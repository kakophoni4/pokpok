import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SubmitResultsInput } from "@poker/contracts";
import { scoreTournament } from "@poker/rating";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { RatingService } from "../rating/rating.service";
import { SeasonsService } from "../seasons/seasons.service";

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly rating: RatingService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records the final standings and awards rating.
   *
   * Re-submitting is a first-class operation, not an edge case: the previous
   * results and their rating events are wiped and recreated inside one
   * transaction. That is what makes "администратор ошибся в третьем месте"
   * a thirty-second fix instead of a data-repair session.
   */
  async submit(tournamentId: string, input: SubmitResultsInput, actorId: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }

    const userIds = input.entries.map((entry) => entry.userId);
    const known = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (known.length !== userIds.length) {
      const missing = userIds.filter((id) => !known.some((user) => user.id === id));
      throw new BadRequestException({
        code: "UNKNOWN_PLAYERS",
        message: "Некоторые игроки не найдены",
        details: { missing },
      });
    }

    const config = await this.seasons.ratingConfig(tournament.seasonId);
    const scored = scoreTournament({
      standings: input.entries.map((entry) => ({
        userId: entry.userId,
        place: entry.place,
        knockouts: entry.knockouts ?? null,
      })),
      multiplier: tournament.ratingMultiplier,
      config,
    });

    // Players whose totals must be refreshed: the new field plus anyone who was
    // in the previous version of the table and is no longer in it.
    const previous = await this.prisma.result.findMany({
      where: { tournamentId },
      select: { userId: true },
    });
    const affected = new Set<string>([...userIds, ...previous.map((row) => row.userId)]);

    await this.prisma.$transaction(async (tx) => {
      await tx.ratingEvent.deleteMany({
        where: { tournamentId, sourceType: { in: ["tournament_result", "penalty"] } },
      });
      await tx.result.deleteMany({ where: { tournamentId } });

      await tx.result.createMany({
        data: input.entries.map((entry) => ({
          tournamentId,
          userId: entry.userId,
          place: entry.place,
          knockouts: entry.knockouts ?? null,
          rebuys: entry.rebuys ?? null,
        })),
      });

      await tx.ratingEvent.createMany({
        data: scored.map((row) => ({
          userId: row.userId,
          seasonId: tournament.seasonId,
          sourceType: "tournament_result" as const,
          points: row.points,
          tournamentId,
          place: row.place,
          fieldSize: scored.length,
          createdBy: actorId,
        })),
      });

      // Walk-ins: somebody who played without signing up still needs a
      // registration row, otherwise the attendance history has holes.
      for (const userId of userIds) {
        await tx.registration.upsert({
          where: { tournamentId_userId: { tournamentId, userId } },
          create: { tournamentId, userId, status: "checked_in", source: "admin" },
          update: { status: "checked_in", waitlistPosition: null },
        });
      }

      if (config.noShowPenalty > 0) {
        const noShows = await tx.registration.findMany({
          where: { tournamentId, status: "no_show" },
          select: { userId: true },
        });

        if (noShows.length > 0) {
          await tx.ratingEvent.createMany({
            data: noShows.map((row) => ({
              userId: row.userId,
              seasonId: tournament.seasonId,
              sourceType: "penalty" as const,
              points: -config.noShowPenalty,
              tournamentId,
              comment: "Не явился на турнир",
              createdBy: actorId,
            })),
          });
          for (const row of noShows) affected.add(row.userId);
        }
      }

      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "finished" } });
    });

    await this.rating.recomputeStats([...affected], tournament.seasonId);

    await this.audit.record({
      actorId,
      action: "tournament.results",
      entity: "Tournament",
      entityId: tournamentId,
      before: { previousPlayers: previous.length },
      after: { players: scored.length, points: scored.map((row) => row.points) },
    });
  }

  /** Wipes standings and the rating they produced, e.g. after a cancelled event. */
  async clear(tournamentId: string, actorId: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { seasonId: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }

    const previous = await this.prisma.result.findMany({
      where: { tournamentId },
      select: { userId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.ratingEvent.deleteMany({
        where: { tournamentId, sourceType: { in: ["tournament_result", "penalty"] } },
      });
      await tx.result.deleteMany({ where: { tournamentId } });
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "reg_closed" } });
    });

    await this.rating.recomputeStats(
      previous.map((row) => row.userId),
      tournament.seasonId,
    );

    await this.audit.record({
      actorId,
      action: "tournament.results.clear",
      entity: "Tournament",
      entityId: tournamentId,
      before: { players: previous.length },
    });
  }
}
