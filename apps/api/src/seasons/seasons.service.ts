import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type CreateSeasonInput,
  DEFAULT_RATING_CONFIG,
  RatingConfig,
  type Season as SeasonView,
  type UpdateSeasonInput,
} from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import type { Season } from "../generated/prisma/client";

@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<SeasonView[]> {
    const seasons = await this.prisma.season.findMany({ orderBy: { startsAt: "desc" } });
    return seasons.map(toSeasonView);
  }

  async findActive(): Promise<SeasonView | null> {
    const season = await this.prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { startsAt: "desc" },
    });
    return season ? toSeasonView(season) : null;
  }

  /**
   * Rating settings for a season, falling back to the defaults so scoring never
   * breaks because a season row is missing or its JSON drifted.
   */
  async ratingConfig(seasonId: string | null | undefined): Promise<RatingConfig> {
    if (!seasonId) return DEFAULT_RATING_CONFIG;

    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { ratingConfig: true },
    });
    return parseRatingConfig(season?.ratingConfig);
  }

  async create(actorId: string, input: CreateSeasonInput): Promise<SeasonView> {
    const season = await this.prisma.$transaction(async (tx) => {
      if (input.isActive) await tx.season.updateMany({ data: { isActive: false } });

      return tx.season.create({
        data: {
          title: input.title,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          isActive: input.isActive,
          ratingConfig: (input.ratingConfig ?? DEFAULT_RATING_CONFIG) as never,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: "season.create",
      entity: "Season",
      entityId: season.id,
      after: { title: season.title },
    });
    return toSeasonView(season);
  }

  async update(actorId: string, id: string, input: UpdateSeasonInput): Promise<SeasonView> {
    const before = await this.prisma.season.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "SEASON_NOT_FOUND", message: "Сезон не найден" });

    const season = await this.prisma.$transaction(async (tx) => {
      // Exactly one season may be active, otherwise "current standings" is ambiguous.
      if (input.isActive) {
        await tx.season.updateMany({ where: { id: { not: id } }, data: { isActive: false } });
      }

      return tx.season.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.startsAt === undefined ? {} : { startsAt: new Date(input.startsAt) }),
          ...(input.endsAt === undefined
            ? {}
            : { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.ratingConfig === undefined
            ? {}
            : { ratingConfig: input.ratingConfig as never }),
        },
      });
    });

    await this.audit.record({
      actorId,
      action: "season.update",
      entity: "Season",
      entityId: id,
      before: { title: before.title, ratingConfig: before.ratingConfig },
      after: { title: season.title, ratingConfig: season.ratingConfig },
    });
    return toSeasonView(season);
  }
}

export function parseRatingConfig(raw: unknown): RatingConfig {
  const parsed = RatingConfig.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_RATING_CONFIG;
}

function toSeasonView(season: Season): SeasonView {
  return {
    id: season.id,
    title: season.title,
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt?.toISOString() ?? null,
    isActive: season.isActive,
    ratingConfig: parseRatingConfig(season.ratingConfig),
  };
}
