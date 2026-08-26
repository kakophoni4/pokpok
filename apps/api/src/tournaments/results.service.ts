import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { SubmitResultsInput, TournamentPlayer } from "@poker/contracts";
import { scoreTournament } from "@poker/rating";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { RatingService } from "../rating/rating.service";
import { SeasonsService } from "../seasons/seasons.service";
import { PaymentsService } from "./payments.service";
import { effectiveConfig } from "./tournament-config";

export type FinishSummary = {
  players: number;
  chipsInPlay: number;
  paidPlaces: number;
  awarded: { userId: string; place: number; points: number }[];
};

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly rating: RatingService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records where one player finished, as they bust out. Places are assigned one
   * at a time during the evening and cost nothing until the tournament is
   * finished, which is when rating is actually computed.
   */
  async setPlace(
    tournamentId: string,
    userId: string,
    place: number | null,
    actorId: string,
  ): Promise<TournamentPlayer> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, status: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }
    if (tournament.status === "finished") {
      throw new ConflictException({
        code: "TOURNAMENT_FINISHED",
        message: "Турнир завершён. Верните его в игру, чтобы менять места",
      });
    }

    if (place == null) {
      await this.prisma.result.deleteMany({ where: { tournamentId, userId } });
    } else {
      // The database also refuses a duplicate place, but a name in the message is
      // far more useful at a table than a constraint violation.
      const occupant = await this.prisma.result.findUnique({
        where: { tournamentId_place: { tournamentId, place } },
        include: { user: { select: { id: true, nickname: true } } },
      });
      if (occupant && occupant.user.id !== userId) {
        throw new ConflictException({
          code: "PLACE_TAKEN",
          message: `${place}-е место уже занято: ${occupant.user.nickname}`,
        });
      }

      await this.prisma.result.upsert({
        where: { tournamentId_userId: { tournamentId, userId } },
        create: { tournamentId, userId, place },
        update: { place },
      });
    }

    await this.audit.record({
      actorId,
      action: "result.place",
      entity: "Tournament",
      entityId: tournamentId,
      after: { userId, place },
    });

    return this.payments.playerView(tournamentId, userId);
  }

  /**
   * Turns the evening into rating. Safe to run again: the previous rating events
   * for this tournament are replaced, never added to, so re-finishing after a
   * correction lands on the same numbers as finishing once.
   */
  async finish(tournamentId: string, actorId: string): Promise<FinishSummary> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        results: { select: { userId: true, place: true } },
        payments: { where: { voidedAt: null }, select: { userId: true, chips: true } },
      },
    });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }
    if (tournament.results.length === 0) {
      throw new BadRequestException({
        code: "NO_PLACES",
        message: "Не проставлено ни одного места",
      });
    }

    const season = await this.seasons.ratingConfig(tournament.seasonId);
    const config = effectiveConfig(tournament, season);

    const chipsInPlay = tournament.payments.reduce((sum, payment) => sum + payment.chips, 0);
    const participants = new Set(tournament.payments.map((payment) => payment.userId));

    const scored = scoreTournament({
      standings: tournament.results.map((row) => ({ userId: row.userId, place: row.place })),
      chipsInPlay,
      paidPlaces: config.paidPlaces,
      multiplier: tournament.ratingMultiplier,
      config,
    });

    const previous = await this.prisma.ratingEvent.findMany({
      where: { tournamentId, sourceType: "tournament_result" },
      select: { userId: true },
    });
    const affected = new Set<string>([
      ...scored.map((row) => row.userId),
      ...previous.map((row) => row.userId),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.ratingEvent.deleteMany({ where: { tournamentId, sourceType: "tournament_result" } });

      await tx.ratingEvent.createMany({
        data: scored.map((row) => ({
          userId: row.userId,
          seasonId: tournament.seasonId,
          sourceType: "tournament_result" as const,
          points: row.points,
          tournamentId,
          place: row.place,
          fieldSize: participants.size,
          createdBy: actorId,
        })),
      });

      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "finished" } });
    });

    await this.rating.recomputeStats([...affected], tournament.seasonId);

    await this.audit.record({
      actorId,
      action: "tournament.finish",
      entity: "Tournament",
      entityId: tournamentId,
      after: { players: participants.size, chipsInPlay, paidPlaces: config.paidPlaces },
    });

    return {
      players: participants.size,
      chipsInPlay,
      paidPlaces: config.paidPlaces,
      awarded: scored.map((row) => ({ userId: row.userId, place: row.place, points: row.points })),
    };
  }

  /**
   * Undoes a payout. Places and the cash desk stay exactly as they were — only
   * the rating is withdrawn, so a wrong finish costs one tap instead of an
   * evening of manual repair.
   */
  async reopen(tournamentId: string, actorId: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { seasonId: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }

    const previous = await this.prisma.ratingEvent.findMany({
      where: { tournamentId, sourceType: "tournament_result" },
      select: { userId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.ratingEvent.deleteMany({ where: { tournamentId, sourceType: "tournament_result" } });
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "running" } });
    });

    await this.rating.recomputeStats(
      previous.map((row) => row.userId),
      tournament.seasonId,
    );

    await this.audit.record({
      actorId,
      action: "tournament.reopen",
      entity: "Tournament",
      entityId: tournamentId,
      before: { withdrawnFrom: previous.length },
    });
  }

  /**
   * The whole standings table in one go, for entering an evening from the
   * website rather than tapping through the bot.
   */
  async submit(tournamentId: string, input: SubmitResultsInput, actorId: string): Promise<void> {
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

    await this.prisma.$transaction(async (tx) => {
      await tx.result.deleteMany({ where: { tournamentId } });
      await tx.result.createMany({
        data: input.entries.map((entry) => ({
          tournamentId,
          userId: entry.userId,
          place: entry.place,
        })),
      });
    });

    await this.finish(tournamentId, actorId);
  }

  /** Wipes standings and the rating they produced, e.g. after a cancelled event. */
  async clear(tournamentId: string, actorId: string): Promise<void> {
    await this.reopen(tournamentId, actorId);
    await this.prisma.result.deleteMany({ where: { tournamentId } });
    await this.audit.record({
      actorId,
      action: "tournament.results.clear",
      entity: "Tournament",
      entityId: tournamentId,
    });
  }
}
