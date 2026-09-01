import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  hasRole,
  type AdminUpdateUserInput,
  type MeUser,
  type Paginated,
  type PaginationQuery,
  type PublicUser,
  type UpdateMeInput,
  type UserListQuery,
} from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { findFreeNickname } from "./nickname";
import { toMeUser, toPublicUser, type UserWithIdentities } from "./user.mapper";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async isNicknameTaken(nickname: string, exceptUserId?: string): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({
      where: {
        nickname: { equals: nickname, mode: "insensitive" },
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /** Suggests a free nickname derived from provider profile data. */
  suggestNickname(candidate: string): Promise<string> {
    return findFreeNickname(candidate, (nickname) => this.isNicknameTaken(nickname));
  }

  async getMe(userId: string): Promise<MeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identities: true },
    });
    if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Игрок не найден" });
    return toMeUser(user as UserWithIdentities);
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<MeUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.displayName === undefined ? {} : { displayName: input.displayName ?? null }),
        ...(input.notifyBeforeTournament === undefined
          ? {}
          : { notifyBeforeTournament: input.notifyBeforeTournament }),
      },
      include: { identities: true },
    });
    return toMeUser(user as UserWithIdentities);
  }

  /**
   * Staff-only edit. Nickname changes live here rather than in updateMe because
   * the club wants stable names in the standings.
   */
  async adminUpdate(actorId: string, userId: string, input: AdminUpdateUserInput): Promise<MeUser> {
    const [before, actor] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { identities: true },
      }),
      this.prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
    ]);
    if (!before) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Игрок не найден" });
    if (!actor) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Игрок не найден" });

    const actorIsAdmin = hasRole(actor.role, "admin");
    if (input.role !== undefined && !actorIsAdmin) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Роль меняет только администратор",
      });
    }
    if (!actorIsAdmin && before.role === "admin") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Администратора может менять только другой администратор",
      });
    }

    if (input.nickname && (await this.isNicknameTaken(input.nickname, userId))) {
      throw new ConflictException({ code: "NICKNAME_TAKEN", message: "Такой ник уже занят" });
    }

    const after = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.nickname === undefined ? {} : { nickname: input.nickname }),
        ...(input.displayName === undefined ? {} : { displayName: input.displayName ?? null }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      include: { identities: true },
    });

    await this.audit.record({
      actorId,
      action: "user.update",
      entity: "User",
      entityId: userId,
      before: { nickname: before.nickname, role: before.role, status: before.status },
      after: { nickname: after.nickname, role: after.role, status: after.status },
    });

    return toMeUser(after as UserWithIdentities);
  }

  async list(
    query: UserListQuery,
    pagination: PaginationQuery,
  ): Promise<Paginated<PublicUser & { status: string; createdAt: string }>> {
    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { nickname: { contains: query.search, mode: "insensitive" as const } },
              { displayName: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { nickname: "asc" },
        skip: (pagination.page - 1) * pagination.perPage,
        take: pagination.perPage,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        ...toPublicUser(row),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: pagination.page,
      perPage: pagination.perPage,
      hasNext: pagination.page * pagination.perPage < total,
    };
  }

  async findPublicById(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Игрок не найден" });
    return toPublicUser(user);
  }
}
