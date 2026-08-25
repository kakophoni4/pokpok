import { createHash, randomBytes } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AccessTokenClaims, UserRole } from "@poker/contracts";
import { PrismaService } from "../common/prisma/prisma.service";
import type { Env } from "../config/env";

export type Audience = "web" | "miniapp" | "bot";

export type SessionMeta = {
  userAgent?: string | null;
  ip?: string | null;
};

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type TokenUser = { id: string; role: UserRole; nickname: string };

/**
 * Short-lived access tokens plus rotating refresh tokens.
 *
 * Refresh tokens are opaque random strings and only their SHA-256 hash is
 * persisted, so a database dump cannot be replayed as a login. Every refresh
 * revokes the previous row, which means a stolen token stops working as soon
 * as the real user refreshes.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get accessTtl(): number {
    return this.config.get("ACCESS_TOKEN_TTL", { infer: true });
  }

  get refreshTtl(): number {
    return this.config.get("REFRESH_TOKEN_TTL", { infer: true });
  }

  async issue(user: TokenUser, audience: Audience, meta: SessionMeta = {}): Promise<IssuedSession> {
    const accessToken = await this.signAccessToken(user, audience);
    const refreshToken = randomBytes(48).toString("hex");

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        audience,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ip: meta.ip ?? null,
        expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }

  /** Exchanges a refresh token for a fresh pair, invalidating the old one. */
  async rotate(refreshToken: string, meta: SessionMeta = {}): Promise<IssuedSession & { user: TokenUser }> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { select: { id: true, role: true, nickname: true, status: true } } },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: "INVALID_REFRESH",
        message: "Сессия недействительна, войдите заново",
      });
    }
    if (session.user.status === "blocked") {
      throw new UnauthorizedException({ code: "USER_BLOCKED", message: "Аккаунт заблокирован" });
    }

    const user: TokenUser = {
      id: session.user.id,
      role: session.user.role,
      nickname: session.user.nickname,
    };
    const audience = session.audience as Audience;

    // Revoke and re-issue in one transaction so a crash cannot leave two live tokens.
    const refreshed = await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      const nextToken = randomBytes(48).toString("hex");
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(nextToken),
          audience,
          userAgent: meta.userAgent?.slice(0, 300) ?? session.userAgent,
          ip: meta.ip ?? session.ip,
          expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
        },
      });

      return nextToken;
    });

    return {
      accessToken: await this.signAccessToken(user, audience),
      refreshToken: refreshed,
      expiresIn: this.accessTtl,
      user,
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Used when staff blocks an account or a user logs out everywhere. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private signAccessToken(user: TokenUser, audience: Audience): Promise<string> {
    const claims: Omit<AccessTokenClaims, "iat" | "exp"> = {
      sub: user.id,
      role: user.role,
      nickname: user.nickname,
      aud: audience,
    };
    return this.jwt.signAsync(claims, { expiresIn: this.accessTtl });
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
