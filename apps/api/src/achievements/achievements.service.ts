import { Injectable, OnModuleInit, ConflictException, NotFoundException } from "@nestjs/common";
import {
  type Achievement as AchievementView,
  AchievementRule,
  type CreateAchievementInput,
  type GrantAchievementInput,
  type UpdateAchievementInput,
  type UserAchievementView,
} from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import type { Achievement } from "../generated/prisma/client";
import { RatingService } from "../rating/rating.service";
import { SeasonsService } from "../seasons/seasons.service";
import { toPublicUser } from "../users/user.mapper";

@Injectable()
export class AchievementsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rating: RatingService,
    private readonly seasons: SeasonsService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureComboCatalogue();
  }

  /** Hands that get awarded at the table. Inserted if a live club is missing them. */
  private async ensureComboCatalogue(): Promise<void> {
    for (const row of COMBO_HANDS) {
      await this.prisma.achievement.upsert({
        where: { code: row.code },
        create: {
          code: row.code,
          title: row.title,
          description: row.description,
          icon: row.icon,
          ratingPoints: row.ratingPoints,
          isRepeatable: true,
          isActive: true,
          rule: null as never,
        },
        update: {},
      });
    }
  }

  async list(includeInactive = false): Promise<AchievementView[]> {
    const rows = await this.prisma.achievement.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { _count: { select: { holders: true } } },
      orderBy: [{ ratingPoints: "desc" }, { title: "asc" }],
    });

    return rows.map((row) => ({ ...toView(row), holdersCount: row._count.holders }));
  }

  async create(actorId: string, input: CreateAchievementInput): Promise<AchievementView> {
    const code = await this.uniqueCode(input.code, input.title);

    const achievement = await this.prisma.achievement.create({
      data: {
        code,
        title: input.title,
        description: input.description ?? null,
        icon: input.icon ?? null,
        ratingPoints: input.ratingPoints,
        isActive: input.isActive,
        isRepeatable: input.isRepeatable,
        rule: (input.rule ?? null) as never,
      },
    });

    await this.audit.record({
      actorId,
      action: "achievement.create",
      entity: "Achievement",
      entityId: achievement.id,
      after: { code: achievement.code, ratingPoints: achievement.ratingPoints },
    });
    return toView(achievement);
  }

  /**
   * Changing `ratingPoints` deliberately does not rewrite past grants: the
   * points a player already earned were earned under the old rules. Staff can
   * re-grant or use a manual adjustment if they really want to backdate.
   */
  async update(
    actorId: string,
    id: string,
    input: UpdateAchievementInput,
  ): Promise<AchievementView> {
    const before = await this.prisma.achievement.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "ACHIEVEMENT_NOT_FOUND", message: "Ачивка не найдена" });
    }

    const achievement = await this.prisma.achievement.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined ? {} : { description: input.description ?? null }),
        ...(input.icon === undefined ? {} : { icon: input.icon ?? null }),
        ...(input.ratingPoints === undefined ? {} : { ratingPoints: input.ratingPoints }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.isRepeatable === undefined ? {} : { isRepeatable: input.isRepeatable }),
        ...(input.rule === undefined ? {} : { rule: (input.rule ?? null) as never }),
      },
    });

    await this.audit.record({
      actorId,
      action: "achievement.update",
      entity: "Achievement",
      entityId: id,
      before: { title: before.title, ratingPoints: before.ratingPoints },
      after: { title: achievement.title, ratingPoints: achievement.ratingPoints },
    });
    return toView(achievement);
  }

  /** Hands an achievement to a player and books its rating in the ledger. */
  async grant(actorId: string, input: GrantAchievementInput): Promise<UserAchievementView> {
    const [achievement, user] = await Promise.all([
      this.prisma.achievement.findUnique({ where: { id: input.achievementId } }),
      this.prisma.user.findUnique({ where: { id: input.userId } }),
    ]);

    if (!achievement) {
      throw new NotFoundException({ code: "ACHIEVEMENT_NOT_FOUND", message: "Ачивка не найдена" });
    }
    if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Игрок не найден" });

    // Empty key for one-off achievements makes the unique index reject a repeat.
    const dedupeKey = achievement.isRepeatable
      ? (input.tournamentId ?? `manual_${Date.now()}`)
      : "";

    const already = await this.prisma.userAchievement.findUnique({
      where: {
        userId_achievementId_dedupeKey: {
          userId: input.userId,
          achievementId: input.achievementId,
          dedupeKey,
        },
      },
    });
    if (already) {
      throw new ConflictException({
        code: "ALREADY_GRANTED",
        message: "У игрока уже есть эта ачивка",
      });
    }

    const seasonId = (await this.seasons.findActive())?.id ?? null;

    const granted = await this.prisma.$transaction(async (tx) => {
      const row = await tx.userAchievement.create({
        data: {
          userId: input.userId,
          achievementId: input.achievementId,
          tournamentId: input.tournamentId ?? null,
          grantedById: actorId,
          comment: input.comment ?? null,
          dedupeKey,
        },
        include: { achievement: true, grantedBy: true },
      });

      if (achievement.ratingPoints !== 0) {
        await tx.ratingEvent.create({
          data: {
            userId: input.userId,
            seasonId,
            sourceType: "achievement",
            points: achievement.ratingPoints,
            achievementId: achievement.id,
            userAchievementId: row.id,
            comment: achievement.title,
            createdBy: actorId,
          },
        });
      }

      return row;
    });

    await this.rating.recomputeStats([input.userId], seasonId);
    await this.audit.record({
      actorId,
      action: "achievement.grant",
      entity: "UserAchievement",
      entityId: granted.id,
      after: { userId: input.userId, code: achievement.code, points: achievement.ratingPoints },
    });

    return {
      id: granted.id,
      achievement: toView(granted.achievement),
      grantedAt: granted.grantedAt.toISOString(),
      grantedBy: granted.grantedBy ? toPublicUser(granted.grantedBy) : null,
      tournamentId: granted.tournamentId,
      comment: granted.comment,
    };
  }

  /** Removing a grant also removes its rating event, via the cascade in the schema. */
  async revoke(actorId: string, userAchievementId: string): Promise<{ ok: true }> {
    const row = await this.prisma.userAchievement.findUnique({
      where: { id: userAchievementId },
      include: { achievement: { select: { code: true } } },
    });
    if (!row) {
      throw new NotFoundException({ code: "GRANT_NOT_FOUND", message: "Выдача не найдена" });
    }

    const seasonId = (await this.seasons.findActive())?.id ?? null;
    await this.prisma.userAchievement.delete({ where: { id: userAchievementId } });
    await this.rating.recomputeStats([row.userId], seasonId);

    await this.audit.record({
      actorId,
      action: "achievement.revoke",
      entity: "UserAchievement",
      entityId: userAchievementId,
      before: { userId: row.userId, code: row.achievement.code },
    });
    return { ok: true };
  }

  async listForUser(userId: string): Promise<UserAchievementView[]> {
    const rows = await this.prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true, grantedBy: true },
      orderBy: { grantedAt: "desc" },
    });

    return rows.map((row) => ({
      id: row.id,
      achievement: toView(row.achievement),
      grantedAt: row.grantedAt.toISOString(),
      grantedBy: row.grantedBy ? toPublicUser(row.grantedBy) : null,
      tournamentId: row.tournamentId,
      comment: row.comment,
    }));
  }

  private async uniqueCode(requested: string | undefined, title: string): Promise<string> {
    const base = requested && requested.length >= 2 ? requested : slugify(title) || `ach_${Date.now()}`;
    let code = base;
    let attempt = 2;
    while (await this.prisma.achievement.findUnique({ where: { code }, select: { id: true } })) {
      code = `${base}_${attempt}`;
      attempt += 1;
    }
    return code;
  }
}

function slugify(value: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
    й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
    у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
    э: "e", ю: "yu", я: "ya",
  };

  return value
    .toLowerCase()
    .split("")
    .map((char) => map[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function toView(achievement: Achievement): AchievementView {
  const rule = AchievementRule.safeParse(achievement.rule);

  return {
    id: achievement.id,
    code: achievement.code,
    title: achievement.title,
    description: achievement.description,
    icon: achievement.icon,
    ratingPoints: achievement.ratingPoints,
    isActive: achievement.isActive,
    isRepeatable: achievement.isRepeatable,
    rule: rule.success ? rule.data : null,
  };
}

const COMBO_HANDS = [
  {
    code: "hand_of_the_day",
    title: "Рука дня",
    description: "Лучшая рука вечера",
    icon: "🃏",
    ratingPoints: 100,
  },
  {
    code: "quads",
    title: "Каре",
    description: "Собрал каре",
    icon: "🎰",
    ratingPoints: 50,
  },
  {
    code: "straight_flush",
    title: "Стрит-флеш",
    description: "Собрал стрит-флеш",
    icon: "🌈",
    ratingPoints: 120,
  },
  {
    code: "royal_flush",
    title: "Роял-флеш",
    description: "Собрал роял-флеш",
    icon: "👑",
    ratingPoints: 200,
  },
];
