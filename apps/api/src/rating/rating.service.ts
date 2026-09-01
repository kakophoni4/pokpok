import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  LeaderboardQuery,
  LeaderboardRow,
  ManualAdjustmentInput,
  PlayerStats,
  RatingEventView,
  RatingSourceType,
} from "@poker/contracts";
import { summarizeLedger } from "@poker/rating";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import type { TxClient } from "../common/prisma/tx-client";
import { SeasonsService } from "../seasons/seasons.service";
import { toPublicUser } from "../users/user.mapper";

@Injectable()
export class RatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Rebuilds the cached standings for the given players from the rating ledger.
   *
   * This is the only writer of UserSeasonStats. Dropping that table entirely
   * would lose nothing: every number here is derived from RatingEvent rows.
   */
  async recomputeStats(
    userIds: string[],
    seasonId: string | null,
    client: TxClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (!seasonId || userIds.length === 0) return;

    const config = await this.seasons.ratingConfig(seasonId);
    const events = await client.ratingEvent.findMany({
      where: { seasonId, userId: { in: userIds } },
      select: { userId: true, sourceType: true, points: true, place: true, fieldSize: true },
    });

    const grouped = new Map<string, typeof events>();
    for (const userId of userIds) grouped.set(userId, []);
    for (const event of events) grouped.get(event.userId)?.push(event);

    for (const [userId, userEvents] of grouped) {
      const stats = summarizeLedger(userEvents, config);

      if (userEvents.length === 0) {
        await client.userSeasonStats.deleteMany({ where: { userId, seasonId } });
        continue;
      }

      await client.userSeasonStats.upsert({
        where: { userId_seasonId: { userId, seasonId } },
        create: { userId, seasonId, ...stats },
        update: stats,
      });
    }
  }

  async leaderboard(query: LeaderboardQuery): Promise<LeaderboardRow[]> {
    const seasonId = query.seasonId ?? (await this.seasons.findActive())?.id ?? null;

    if (query.scope === "all_time" || !seasonId) {
      return this.allTimeLeaderboard(query.search);
    }

    const rows = await this.prisma.userSeasonStats.findMany({
      where: {
        seasonId,
        ...(query.search
          ? {
              user: {
                OR: [
                  { nickname: { contains: query.search, mode: "insensitive" as const } },
                  { displayName: { contains: query.search, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
      },
      include: { user: true },
      orderBy: [{ points: "desc" }, { wins: "desc" }],
    });

    return rows.map((row, index) => ({
      rank: index + 1,
      user: toPublicUser(row.user),
      points: row.points,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      top3: row.top3,
      itm: row.itm,
      avgPlace: row.avgPlace,
      bestPlace: row.bestPlace,
    }));
  }

  /**
   * All-time standings sum every event ever recorded, ignoring the season's
   * "best of N" rule, which only makes sense inside one season.
   */
  private async allTimeLeaderboard(search?: string): Promise<LeaderboardRow[]> {
    const events = await this.prisma.ratingEvent.findMany({
      where: search
        ? {
            user: {
              OR: [
                { nickname: { contains: search, mode: "insensitive" as const } },
                { displayName: { contains: search, mode: "insensitive" as const } },
              ],
            },
          }
        : undefined,
      select: {
        points: true,
        place: true,
        sourceType: true,
        fieldSize: true,
        user: { select: { id: true, nickname: true, displayName: true, avatarUrl: true, role: true } },
      },
    });

    const byUser = new Map<string, { user: (typeof events)[number]["user"]; rows: typeof events }>();
    for (const event of events) {
      const entry = byUser.get(event.user.id) ?? { user: event.user, rows: [] };
      entry.rows.push(event);
      byUser.set(event.user.id, entry);
    }

    const config = await this.seasons.ratingConfig(null);
    const rows = [...byUser.values()].map(({ user, rows: userEvents }) => {
      const stats = summarizeLedger(userEvents, { ...config, bestOfCount: 0 });
      return { user: toPublicUser(user), ...stats };
    });

    rows.sort((a, b) => b.points - a.points || b.wins - a.wins);
    return rows.map((row, index) => ({ rank: index + 1, ...row }));
  }

  async playerStats(userId: string, seasonIdInput?: string): Promise<PlayerStats> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Игрок не найден" });

    const seasonId = seasonIdInput ?? (await this.seasons.findActive())?.id ?? null;
    const config = await this.seasons.ratingConfig(seasonId);

    const events = await this.prisma.ratingEvent.findMany({
      where: { userId, ...(seasonId ? { seasonId } : {}) },
      include: {
        tournament: { select: { id: true, title: true, startsAt: true, paidPlaces: true } },
        achievement: { select: { id: true, title: true, icon: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const stats = summarizeLedger(
      events.map((event) => ({
        sourceType: event.sourceType,
        points: event.points,
        place: event.place,
        fieldSize: event.fieldSize,
      })),
      config,
    );

    let running = 0;
    const progression = events.map((event) => {
      running += event.points;
      return { date: event.createdAt.toISOString(), points: running };
    });

    const rank = seasonId ? await this.rankOf(userId, seasonId) : null;

    return {
      user: toPublicUser(user),
      seasonId,
      ...stats,
      rank,
      progression,
      history: events.map(toRatingEventView).reverse(),
    };
  }

  private async rankOf(userId: string, seasonId: string): Promise<number | null> {
    const own = await this.prisma.userSeasonStats.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
      select: { points: true },
    });
    if (!own) return null;

    const ahead = await this.prisma.userSeasonStats.count({
      where: { seasonId, points: { gt: own.points } },
    });
    return ahead + 1;
  }

  /** Staff correction. Recorded as an event, never as an edit of a total. */
  async manualAdjustment(actorId: string, input: ManualAdjustmentInput): Promise<void> {
    const seasonId = input.seasonId ?? (await this.seasons.findActive())?.id ?? null;

    await this.prisma.ratingEvent.create({
      data: {
        userId: input.userId,
        seasonId,
        sourceType: input.points >= 0 ? "manual_adjustment" : "penalty",
        points: input.points,
        comment: input.comment,
        createdBy: actorId,
      },
    });

    await this.recomputeStats([input.userId], seasonId);
    await this.audit.record({
      actorId,
      action: "rating.adjust",
      entity: "RatingEvent",
      entityId: input.userId,
      after: { points: input.points, comment: input.comment },
    });
  }
}

function toRatingEventView(event: {
  id: string;
  createdAt: Date;
  points: number;
  sourceType: RatingSourceType;
  comment: string | null;
  place: number | null;
  fieldSize: number | null;
  tournament: { id: string; title: string; startsAt: Date; paidPlaces: number | null } | null;
  achievement: { id: string; title: string; icon: string | null } | null;
}): RatingEventView {
  return {
    id: event.id,
    createdAt: event.createdAt.toISOString(),
    points: event.points,
    sourceType: event.sourceType,
    comment: event.comment,
    place: event.place,
    tournament: event.tournament
      ? {
          id: event.tournament.id,
          title: event.tournament.title,
          startsAt: event.tournament.startsAt.toISOString(),
          fieldSize: event.fieldSize ?? 0,
          paidPlaces: event.tournament.paidPlaces ?? 9,
        }
      : null,
    achievement: event.achievement,
  };
}
