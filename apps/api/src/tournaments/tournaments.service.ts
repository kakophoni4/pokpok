import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type CreateTournamentInput,
  OCCUPYING_STATUSES,
  type TournamentDetail,
  type TournamentListQuery,
  type TournamentSummary,
  type UpdateTournamentInput,
} from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import type { Prisma, Tournament, Venue } from "../generated/prisma/client";
import { toPublicUser } from "../users/user.mapper";

type TournamentWithVenue = Tournament & { venue: Venue | null };

type CountsByTournament = Map<string, { registered: number; waitlist: number }>;

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: TournamentListQuery, viewerId?: string): Promise<TournamentSummary[]> {
    const where = this.buildWhere(query);
    const tournaments = await this.prisma.tournament.findMany({
      where,
      include: { venue: true },
      orderBy: { startsAt: query.scope === "past" ? "desc" : "asc" },
      take: 200,
    });

    const ids = tournaments.map((tournament) => tournament.id);
    const [counts, mine] = await Promise.all([
      this.countRegistrations(ids),
      this.myRegistrations(ids, viewerId),
    ]);

    return tournaments.map((tournament) =>
      toSummary(tournament, counts, mine.get(tournament.id) ?? null),
    );
  }

  async detail(id: string, viewerId?: string): Promise<TournamentDetail> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        venue: true,
        registrations: {
          include: { user: true },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        },
        results: { include: { user: true }, orderBy: { place: "asc" } },
      },
    });

    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }

    const counts = await this.countRegistrations([id]);
    const mine = tournament.registrations.find((row) => row.userId === viewerId) ?? null;

    // Rating earned per player is read from the ledger, not recomputed here,
    // so the page always shows exactly what was actually awarded.
    const ratingEvents = await this.prisma.ratingEvent.findMany({
      where: { tournamentId: id, sourceType: "tournament_result" },
      select: { userId: true, points: true },
    });
    const pointsByUser = new Map(ratingEvents.map((event) => [event.userId, event.points]));

    return {
      ...toSummary(tournament, counts, mine),
      description: tournament.description,
      buyinChips: tournament.buyinChips,
      seasonId: tournament.seasonId,
      registrations: tournament.registrations.map((row) => ({
        id: row.id,
        user: toPublicUser(row.user),
        status: row.status,
        source: row.source,
        waitlistPosition: row.waitlistPosition,
        createdAt: row.createdAt.toISOString(),
      })),
      results: tournament.results.map((row) => ({
        place: row.place,
        user: toPublicUser(row.user),
        knockouts: row.knockouts,
        rebuys: row.rebuys,
        ratingPoints: pointsByUser.get(row.userId) ?? 0,
      })),
    };
  }

  async create(actorId: string, input: CreateTournamentInput): Promise<TournamentSummary> {
    const seasonId = input.seasonId ?? (await this.defaultSeasonId());

    const tournament = await this.prisma.tournament.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        gameType: input.gameType,
        seasonId,
        venueId: input.venueId ?? null,
        startsAt: new Date(input.startsAt),
        regOpensAt: input.regOpensAt ? new Date(input.regOpensAt) : null,
        regClosesAt: input.regClosesAt ? new Date(input.regClosesAt) : null,
        capacity: input.capacity ?? null,
        buyinChips: input.buyinChips ?? null,
        ratingMultiplier: input.ratingMultiplier,
        status: input.status,
      },
      include: { venue: true },
    });

    await this.audit.record({
      actorId,
      action: "tournament.create",
      entity: "Tournament",
      entityId: tournament.id,
      after: { title: tournament.title, startsAt: tournament.startsAt },
    });

    return toSummary(tournament, new Map(), null);
  }

  async update(
    actorId: string,
    id: string,
    input: UpdateTournamentInput,
  ): Promise<TournamentSummary> {
    const before = await this.prisma.tournament.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }

    if (input.capacity != null) {
      const occupied = await this.prisma.registration.count({
        where: { tournamentId: id, status: { in: OCCUPYING_STATUSES } },
      });
      if (input.capacity < occupied) {
        throw new BadRequestException({
          code: "CAPACITY_TOO_SMALL",
          message: `Уже записано ${occupied} игроков — лимит не может быть меньше`,
        });
      }
    }

    const tournament = await this.prisma.tournament.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined ? {} : { description: input.description ?? null }),
        ...(input.gameType === undefined ? {} : { gameType: input.gameType }),
        ...(input.seasonId === undefined ? {} : { seasonId: input.seasonId ?? null }),
        ...(input.venueId === undefined ? {} : { venueId: input.venueId ?? null }),
        ...(input.startsAt === undefined ? {} : { startsAt: new Date(input.startsAt) }),
        ...(input.regOpensAt === undefined
          ? {}
          : { regOpensAt: input.regOpensAt ? new Date(input.regOpensAt) : null }),
        ...(input.regClosesAt === undefined
          ? {}
          : { regClosesAt: input.regClosesAt ? new Date(input.regClosesAt) : null }),
        ...(input.capacity === undefined ? {} : { capacity: input.capacity ?? null }),
        ...(input.buyinChips === undefined ? {} : { buyinChips: input.buyinChips ?? null }),
        ...(input.ratingMultiplier === undefined
          ? {}
          : { ratingMultiplier: input.ratingMultiplier }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      include: { venue: true },
    });

    await this.audit.record({
      actorId,
      action: "tournament.update",
      entity: "Tournament",
      entityId: id,
      before: { title: before.title, startsAt: before.startsAt, status: before.status },
      after: { title: tournament.title, startsAt: tournament.startsAt, status: tournament.status },
    });

    const counts = await this.countRegistrations([id]);
    return toSummary(tournament, counts, null);
  }

  async remove(actorId: string, id: string): Promise<{ ok: true }> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: { results: { select: { id: true } } },
    });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }
    if (tournament.results.length > 0) {
      throw new BadRequestException({
        code: "TOURNAMENT_HAS_RESULTS",
        message: "У турнира есть результаты — отмените его вместо удаления",
      });
    }

    await this.prisma.tournament.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: "tournament.delete",
      entity: "Tournament",
      entityId: id,
      before: { title: tournament.title },
    });
    return { ok: true };
  }

  private buildWhere(query: TournamentListQuery): Prisma.TournamentWhereInput {
    const statuses = Array.isArray(query.status)
      ? query.status
      : query.status
        ? [query.status]
        : undefined;

    // All date bounds are merged into one filter; setting `startsAt` twice would
    // silently drop the earlier condition.
    const startsAt: Prisma.DateTimeFilter = {};
    const today = startOfDay(new Date());
    if (query.scope === "upcoming") startsAt.gte = today;
    if (query.scope === "past") startsAt.lt = today;
    if (query.from) startsAt.gte = new Date(query.from);
    if (query.to) startsAt.lte = new Date(query.to);

    return {
      // Drafts are staff-only; they never reach the public schedule.
      status: statuses ? { in: statuses } : { not: "draft" },
      ...(query.seasonId ? { seasonId: query.seasonId } : {}),
      ...(Object.keys(startsAt).length > 0 ? { startsAt } : {}),
    };
  }

  private async countRegistrations(tournamentIds: string[]): Promise<CountsByTournament> {
    if (tournamentIds.length === 0) return new Map();

    const grouped = await this.prisma.registration.groupBy({
      by: ["tournamentId", "status"],
      where: { tournamentId: { in: tournamentIds } },
      _count: { _all: true },
    });

    const counts: CountsByTournament = new Map();
    for (const row of grouped) {
      const entry = counts.get(row.tournamentId) ?? { registered: 0, waitlist: 0 };
      if (OCCUPYING_STATUSES.includes(row.status)) entry.registered += row._count._all;
      if (row.status === "waitlist") entry.waitlist += row._count._all;
      counts.set(row.tournamentId, entry);
    }
    return counts;
  }

  private async myRegistrations(tournamentIds: string[], viewerId?: string) {
    if (!viewerId || tournamentIds.length === 0) {
      return new Map<string, MyRegistrationRow>();
    }

    const rows = await this.prisma.registration.findMany({
      where: { userId: viewerId, tournamentId: { in: tournamentIds } },
    });
    return new Map(rows.map((row) => [row.tournamentId, row]));
  }

  private async defaultSeasonId(): Promise<string | null> {
    const active = await this.prisma.season.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    return active?.id ?? null;
  }
}

type MyRegistrationRow = {
  id: string;
  status: TournamentDetail["registrations"][number]["status"];
  waitlistPosition: number | null;
  createdAt: Date;
  tournamentId: string;
};

function toSummary(
  tournament: TournamentWithVenue,
  counts: CountsByTournament,
  mine: MyRegistrationRow | null,
): TournamentSummary {
  const count = counts.get(tournament.id) ?? { registered: 0, waitlist: 0 };

  return {
    id: tournament.id,
    title: tournament.title,
    gameType: tournament.gameType,
    status: tournament.status,
    startsAt: tournament.startsAt.toISOString(),
    regOpensAt: tournament.regOpensAt?.toISOString() ?? null,
    regClosesAt: tournament.regClosesAt?.toISOString() ?? null,
    capacity: tournament.capacity,
    ratingMultiplier: tournament.ratingMultiplier,
    venue: tournament.venue
      ? { id: tournament.venue.id, title: tournament.venue.title, address: tournament.venue.address }
      : null,
    registeredCount: count.registered,
    waitlistCount: count.waitlist,
    myRegistration: mine
      ? {
          id: mine.id,
          status: mine.status,
          waitlistPosition: mine.waitlistPosition,
          createdAt: mine.createdAt.toISOString(),
        }
      : null,
  };
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
