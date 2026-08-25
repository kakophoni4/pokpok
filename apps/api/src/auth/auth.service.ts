import { randomBytes } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthProvider, SessionResponse, StartLinkResponse } from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import type { Env } from "../config/env";
import { toMeUser, type UserWithIdentities } from "../users/user.mapper";
import { UsersService } from "../users/users.service";
import type { TelegramProfile } from "./telegram.verifier";
import { type Audience, type SessionMeta, TokenService } from "./token.service";

export type ProviderProfile = {
  provider: AuthProvider;
  providerUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  raw: Record<string, unknown>;
};

export type LoginResult = SessionResponse & { refreshToken: string };

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  static fromTelegram(profile: TelegramProfile): ProviderProfile {
    return {
      provider: "telegram",
      providerUserId: profile.telegramId,
      username: profile.username,
      firstName: profile.firstName,
      lastName: profile.lastName,
      photoUrl: profile.photoUrl,
      raw: profile.raw,
    };
  }

  /**
   * The single entry point for every provider. Finding an existing identity is
   * what keeps one person from turning into two players after switching from
   * the website to the Telegram Mini App.
   */
  async loginWithProvider(
    profile: ProviderProfile,
    audience: Audience,
    meta: SessionMeta = {},
  ): Promise<LoginResult> {
    const existing = await this.prisma.identity.findUnique({
      where: {
        provider_providerUserId: {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: { user: { include: { identities: true } } },
    });

    if (existing) {
      if (existing.user.status === "blocked") {
        throw new ForbiddenException({ code: "USER_BLOCKED", message: "Аккаунт заблокирован" });
      }

      // Provider usernames and avatars change; keep our copy fresh but never
      // touch the nickname, which staff may have set deliberately.
      const user = await this.refreshIdentity(existing.id, existing.user.id, profile);
      const session = await this.tokens.issue(
        { id: user.id, role: user.role, nickname: user.nickname },
        audience,
        meta,
      );

      return {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: session.expiresIn,
        user: toMeUser(user),
        isNewUser: false,
      };
    }

    const created = await this.createUserWithIdentity(profile);
    const session = await this.tokens.issue(
      { id: created.id, role: created.role, nickname: created.nickname },
      audience,
      meta,
    );

    await this.audit.record({
      actorId: created.id,
      action: "auth.register",
      entity: "User",
      entityId: created.id,
      after: { provider: profile.provider, nickname: created.nickname },
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      user: toMeUser(created),
      isNewUser: true,
    };
  }

  private async refreshIdentity(
    identityId: string,
    userId: string,
    profile: ProviderProfile,
  ): Promise<UserWithIdentities> {
    await this.prisma.identity.update({
      where: { id: identityId },
      data: {
        providerUsername: profile.username,
        raw: profile.raw as never,
      },
    });

    return this.prisma.user.update({
      where: { id: userId },
      // Only fill the avatar in; never overwrite one the player already has.
      data: profile.photoUrl ? { avatarUrl: profile.photoUrl } : {},
      include: { identities: true },
    }) as Promise<UserWithIdentities>;
  }

  private async createUserWithIdentity(profile: ProviderProfile): Promise<UserWithIdentities> {
    const nickname = await this.users.suggestNickname(
      profile.username ?? [profile.firstName, profile.lastName].filter(Boolean).join("_"),
    );

    return this.prisma.user.create({
      data: {
        nickname,
        displayName: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null,
        avatarUrl: profile.photoUrl,
        identities: {
          create: {
            provider: profile.provider,
            providerUserId: profile.providerUserId,
            providerUsername: profile.username,
            raw: profile.raw as never,
          },
        },
      },
      include: { identities: true },
    }) as Promise<UserWithIdentities>;
  }

  /** Development helper; the controller refuses to expose it in production. */
  async devLogin(nickname: string): Promise<LoginResult> {
    const user = (await this.prisma.user.findFirst({
      where: { nickname: { equals: nickname, mode: "insensitive" } },
      include: { identities: true },
    })) as UserWithIdentities | null;

    if (!user) {
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: `Игрок «${nickname}» не найден. Запустите pnpm db:seed`,
      });
    }

    const session = await this.tokens.issue(
      { id: user.id, role: user.role, nickname: user.nickname },
      "web",
    );

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      user: toMeUser(user),
      isNewUser: false,
    };
  }

  /**
   * Step one of attaching a second provider: the signed-in user gets a one-time
   * token to carry into the bot as a deep-link payload.
   */
  async startLink(userId: string, provider: AuthProvider): Promise<StartLinkResponse> {
    const already = await this.prisma.identity.findFirst({ where: { userId, provider } });
    if (already) {
      throw new ConflictException({
        code: "ALREADY_LINKED",
        message: `${provider === "telegram" ? "Telegram" : "VK"} уже привязан`,
      });
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
    await this.prisma.linkToken.create({ data: { token, userId, provider, expiresAt } });

    const botUsername = this.config.get("TELEGRAM_BOT_USERNAME", { infer: true });
    const deepLink =
      provider === "telegram" && botUsername
        ? `https://t.me/${botUsername}?start=link_${token}`
        : `${this.config.get("PUBLIC_WEB_URL", { infer: true })}/link/${provider}/${token}`;

    return { token, deepLink, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Step two, called by the bot once it knows which provider account arrived
   * with the token. Refuses to steal an identity that already belongs to
   * somebody else — that case needs a human decision.
   */
  async confirmLink(token: string, profile: ProviderProfile): Promise<void> {
    const record = await this.prisma.linkToken.findUnique({ where: { token } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new NotFoundException({
        code: "LINK_TOKEN_INVALID",
        message: "Ссылка привязки устарела, начните заново",
      });
    }
    if (record.provider !== profile.provider) {
      throw new ConflictException({ code: "PROVIDER_MISMATCH", message: "Не та платформа" });
    }

    const taken = await this.prisma.identity.findUnique({
      where: {
        provider_providerUserId: {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        },
      },
    });
    if (taken && taken.userId !== record.userId) {
      throw new ConflictException({
        code: "IDENTITY_TAKEN",
        message: "Этот аккаунт уже привязан к другому игроку, обратитесь к администратору",
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (!taken) {
        await tx.identity.create({
          data: {
            userId: record.userId,
            provider: profile.provider,
            providerUserId: profile.providerUserId,
            providerUsername: profile.username,
            raw: profile.raw as never,
          },
        });
      }
      await tx.linkToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    });

    await this.audit.record({
      actorId: record.userId,
      action: "auth.link",
      entity: "Identity",
      entityId: record.userId,
      after: { provider: profile.provider },
    });
  }
}
