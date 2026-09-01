import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  type CreateTournamentInput,
  hasRole,
  OCCUPYING_STATUSES,
  type RatingConfig,
  type SaveAdminScreensInput,
  type TournamentDetail,
  type TournamentListQuery,
  type TournamentPlayer,
  type TournamentSummary,
  type UpdateTournamentInput,
  type UserRole,
} from "@poker/contracts";
import { ratingPool } from "@poker/rating";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import type { Prisma, Tournament, Venue } from "../generated/prisma/client";
import { parseRatingConfig } from "../seasons/seasons.service";
import { toPublicUser } from "../users/user.mapper";
import { effectiveConfig } from "./tournament-config";

type TournamentWithVenue = Tournament & { venue: Venue | null };

type CountsByTournament = Map<string, { registered: number; waitlist: number }>;

export type Viewer = { id: string; role: UserRole };

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
    const [counts, mine, configs] = await Promise.all([
      this.countRegistrations(ids),
      this.myRegistrations(ids, viewerId),
      this.seasonConfigs(),
    ]);

    return tournaments.map((tournament) =>
      toSummary(tournament, counts, mine.get(tournament.id) ?? null, configs),
    );
  }

  /**
   * The tournament whose live screens live in a given forum topic.
   *
   * This is what lets the bot's buttons carry an action and nothing else: the
   * topic identifies the evening, the message identifies the player, and neither
   * has to be squeezed into Telegram's 64 bytes of callback data.
   */
  async byAdminTopic(topicId: number, viewer?: Viewer): Promise<TournamentDetail> {
    const found = await this.prisma.tournament.findFirst({
      where: { adminTopicId: topicId },
      orderBy: { startsAt: "desc" },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: "TOURNAMENT_NOT_FOUND",
        message: "К этому топику не привязан турнир",
      });
    }
    return this.detail(found.id, viewer);
  }

  async detail(id: string, viewer?: Viewer): Promise<TournamentDetail> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        venue: true,
        registrations: {
          include: { user: true },
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        },
        results: { include: { user: true }, orderBy: { place: "asc" } },
        payments: { include: { user: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }

    const [counts, configs] = await Promise.all([
      this.countRegistrations([id]),
      this.seasonConfigs(),
    ]);
    const config = effectiveConfig(tournament, configs.get(tournament.seasonId) ?? configs.get(null)!);
    const mine = tournament.registrations.find((row) => row.userId === viewer?.id) ?? null;

    // Rating earned per player is read from the ledger, not recomputed here,
    // so the page always shows exactly what was actually awarded.
    const ratingEvents = await this.prisma.ratingEvent.findMany({
      where: { tournamentId: id, sourceType: "tournament_result" },
      select: { userId: true, points: true },
    });
    const pointsByUser = new Map(ratingEvents.map((event) => [event.userId, event.points]));

    const live = tournament.payments.filter((payment) => payment.voidedAt == null);
    const chipsInPlay = live.reduce((sum, payment) => sum + payment.chips, 0);
    const placeByUser = new Map(tournament.results.map((row) => [row.userId, row.place]));

    const isStaff = viewer != null && hasRole(viewer.role, "admin");

    return {
      ...toSummary(tournament, counts, mine, configs),
      description: tournament.description,
      seasonId: tournament.seasonId,
      startingStack: config.startingStack,
      addonChips: config.addonChips,
      chipsInPlay,
      ratingPool: Math.round(
        ratingPool({
          chipsInPlay,
          divisor: config.divisor,
          multiplier: tournament.ratingMultiplier,
        }),
      ),
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
        ratingPoints: pointsByUser.get(row.userId) ?? 0,
      })),
      // The cash desk is staff-only. Everyone else gets the same card without it.
      players: isStaff ? groupPlayers(live, placeByUser, pointsByUser) : null,
      totalRub: isStaff ? live.reduce((sum, payment) => sum + payment.amountRub, 0) : null,
      adminScreens: isStaff
        ? {
            topicId: tournament.adminTopicId,
            boardMsgId: tournament.adminBoardMsgId,
            cards: tournament.registrations
              .filter((row) => row.adminCardMsgId != null)
              .map((row) => ({ userId: row.userId, msgId: row.adminCardMsgId as number })),
          }
        : null,
    };
  }

  /** Remembers where the bot put its live screens for this tournament. */
  async saveAdminScreens(id: string, input: SaveAdminScreensInput): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      if (input.topicId !== undefined || input.boardMsgId !== undefined) {
        await tx.tournament.update({
          where: { id },
          data: {
            ...(input.topicId === undefined ? {} : { adminTopicId: input.topicId ?? null }),
            ...(input.boardMsgId === undefined
              ? {}
              : { adminBoardMsgId: input.boardMsgId ?? null }),
          },
        });
      }

      for (const card of input.cards ?? []) {
        await tx.registration.upsert({
          where: { tournamentId_userId: { tournamentId: id, userId: card.userId } },
          create: {
            tournamentId: id,
            userId: card.userId,
            status: "registered",
            source: "admin",
            adminCardMsgId: card.msgId,
          },
          update: { adminCardMsgId: card.msgId },
        });
      }
    });

    return { ok: true };
  }

  async create(actorId: string, input: CreateTournamentInput): Promise<TournamentSummary> {
    const seasonId = input.seasonId ?? (await this.defaultSeasonId());

    const tournament = await this.prisma.tournament.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        seasonId,
        venueId: input.venueId ?? null,
        startsAt: new Date(input.startsAt),
        regOpensAt: input.regOpensAt ? new Date(input.regOpensAt) : null,
        regClosesAt: input.regClosesAt ? new Date(input.regClosesAt) : null,
        capacity: input.capacity ?? null,
        paidPlaces: input.paidPlaces ?? null,
        startingStack: input.startingStack ?? null,
        addonChips: input.addonChips ?? null,
        ratingMultiplier: input.ratingMultiplier,
        minRating: input.minRating ?? null,
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

    return toSummary(tournament, new Map(), null, await this.seasonConfigs());
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
        ...(input.paidPlaces === undefined ? {} : { paidPlaces: input.paidPlaces ?? null }),
        ...(input.startingStack === undefined
          ? {}
          : { startingStack: input.startingStack ?? null }),
        ...(input.addonChips === undefined ? {} : { addonChips: input.addonChips ?? null }),
        ...(input.ratingMultiplier === undefined
          ? {}
          : { ratingMultiplier: input.ratingMultiplier }),
        ...(input.minRating === undefined ? {} : { minRating: input.minRating ?? null }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      include: { venue: true },
    });

    await this.audit.record({
      actorId,
      action: "tournament.update",
      entity: "Tournament",
      entityId: id,
      before: {
        title: before.title,
        startsAt: before.startsAt,
        status: before.status,
        paidPlaces: before.paidPlaces,
      },
      after: {
        title: tournament.title,
        startsAt: tournament.startsAt,
        status: tournament.status,
        paidPlaces: tournament.paidPlaces,
      },
    });

    const [counts, configs] = await Promise.all([
      this.countRegistrations([id]),
      this.seasonConfigs(),
    ]);
    return toSummary(tournament, counts, null, configs);
  }

  async remove(actorId: string, id: string): Promise<{ ok: true }> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: { results: { select: { id: true } }, payments: { select: { id: true } } },
    });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }
    if (tournament.results.length > 0 || tournament.payments.length > 0) {
      throw new ConflictException({
        code: "TOURNAMENT_HAS_HISTORY",
        message: "По турниру уже есть места или оплаты — отмените его вместо удаления",
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

  /**
   * Every season's rating settings in one map, plus the defaults under `null` for
   * tournaments that belong to no season. Seasons are counted in single digits,
   * so loading them all beats a query per tournament in the schedule.
   */
  private async seasonConfigs(): Promise<Map<string | null, RatingConfig>> {
    const seasons = await this.prisma.season.findMany({
      select: { id: true, ratingConfig: true },
    });

    const map = new Map<string | null, RatingConfig>();
    map.set(null, parseRatingConfig(undefined));
    for (const season of seasons) map.set(season.id, parseRatingConfig(season.ratingConfig));
    return map;
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

type PaymentRow = {
  id: string;
  userId: string;
  kind: TournamentPlayer["payments"][number]["kind"];
  amountRub: number;
  chips: number;
  note: string | null;
  createdAt: Date;
  user: Parameters<typeof toPublicUser>[0];
};

/** One row per player, with their tab, their place and what it earned. */
function groupPlayers(
  payments: PaymentRow[],
  placeByUser: Map<string, number>,
  pointsByUser: Map<string, number>,
): TournamentPlayer[] {
  const byUser = new Map<string, TournamentPlayer>();

  for (const payment of payments) {
    const existing = byUser.get(payment.userId) ?? {
      user: toPublicUser(payment.user),
      payments: [],
      totalRub: 0,
      chips: 0,
      place: placeByUser.get(payment.userId) ?? null,
      ratingPoints: pointsByUser.get(payment.userId) ?? null,
    };

    existing.payments.push({
      id: payment.id,
      kind: payment.kind,
      amountRub: payment.amountRub,
      chips: payment.chips,
      note: payment.note,
      createdAt: payment.createdAt.toISOString(),
    });
    existing.totalRub += payment.amountRub;
    existing.chips += payment.chips;
    byUser.set(payment.userId, existing);
  }

  return [...byUser.values()].sort((a, b) => {
    // Finished players first, in finishing order; everyone still playing after.
    if (a.place != null && b.place != null) return a.place - b.place;
    if (a.place != null) return -1;
    if (b.place != null) return 1;
    return a.user.nickname.localeCompare(b.user.nickname, "ru");
  });
}

function toSummary(
  tournament: TournamentWithVenue,
  counts: CountsByTournament,
  mine: MyRegistrationRow | null,
  configs: Map<string | null, RatingConfig>,
): TournamentSummary {
  const count = counts.get(tournament.id) ?? { registered: 0, waitlist: 0 };
  const season = configs.get(tournament.seasonId) ?? configs.get(null)!;

  return {
    id: tournament.id,
    title: tournament.title,
    status: tournament.status,
    startsAt: tournament.startsAt.toISOString(),
    regOpensAt: tournament.regOpensAt?.toISOString() ?? null,
    regClosesAt: tournament.regClosesAt?.toISOString() ?? null,
    capacity: tournament.capacity,
    ratingMultiplier: tournament.ratingMultiplier,
    paidPlaces: tournament.paidPlaces ?? season.defaultPaidPlaces,
    minRating: tournament.minRating,
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
