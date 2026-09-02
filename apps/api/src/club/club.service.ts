import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CLUB_TIMEZONE,
  type ClubMenuItem,
  type ClubSettings,
  type ClubVenue,
  type ClubVenueInput,
  type CreateClubMenuItemInput,
  type EveningJournal,
  formatPlayerName,
  parsePromoBundle,
  promoKindFromBundle,
  type SalesQuery,
  type SalesReport,
  type UpdateClubMenuItemInput,
  type UpdateClubSettingsInput,
} from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { describe, summariseStaff } from "./journal";
import type { ClubMenuItem as MenuRow, PaymentKind } from "../generated/prisma/client";

/** There is exactly one club, so exactly one settings row. */
const ROW_ID = "club";

const FIXED: { kind: "entry" | "rebuy" | "addon"; title: string; sortOrder: number }[] = [
  { kind: "entry", title: "Вход", sortOrder: 0 },
  { kind: "rebuy", title: "Ребай", sortOrder: 1 },
  { kind: "addon", title: "Адон", sortOrder: 2 },
];

@Injectable()
export class ClubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Reads the settings, creating them on first use. Doing it lazily means a fresh
   * database needs no seeding step before the bot can answer "как нас найти".
   */
  async get(): Promise<ClubSettings> {
    const row = await this.prisma.clubSettings.upsert({
      where: { id: ROW_ID },
      create: { id: ROW_ID, timezone: CLUB_TIMEZONE },
      update: {},
    });

    await this.ensureFixedItems(row);
    await this.ensureDefaultDrink(row.drinkPriceRub);

    const items = await this.prisma.clubMenuItem.findMany({
      orderBy: [{ isPromo: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const venues = await this.prisma.venue.findMany({ orderBy: { createdAt: "asc" } });

    return {
      infoText: row.infoText,
      entryPriceRub: row.entryPriceRub,
      rebuyPriceRub: row.rebuyPriceRub,
      addonPriceRub: row.addonPriceRub,
      drinkPriceRub: row.drinkPriceRub,
      adminChatId: row.adminChatId,
      timezone: CLUB_TIMEZONE,
      menuItems: items.map(toMenuView),
      venues: venues.map(toVenueView),
    };
  }

  async update(actorId: string, input: UpdateClubSettingsInput): Promise<ClubSettings> {
    const before = await this.get();

    await this.prisma.clubSettings.update({
      where: { id: ROW_ID },
      data: {
        ...(input.infoText === undefined ? {} : { infoText: input.infoText }),
        ...(input.entryPriceRub === undefined ? {} : { entryPriceRub: input.entryPriceRub }),
        ...(input.rebuyPriceRub === undefined ? {} : { rebuyPriceRub: input.rebuyPriceRub }),
        ...(input.addonPriceRub === undefined ? {} : { addonPriceRub: input.addonPriceRub }),
        ...(input.drinkPriceRub === undefined ? {} : { drinkPriceRub: input.drinkPriceRub }),
        ...(input.adminChatId === undefined ? {} : { adminChatId: input.adminChatId ?? null }),
        timezone: CLUB_TIMEZONE,
      },
    });

    const prices: Partial<Record<PaymentKind, number>> = {
      ...(input.entryPriceRub === undefined ? {} : { entry: input.entryPriceRub }),
      ...(input.rebuyPriceRub === undefined ? {} : { rebuy: input.rebuyPriceRub }),
      ...(input.addonPriceRub === undefined ? {} : { addon: input.addonPriceRub }),
    };
    for (const [kind, priceRub] of Object.entries(prices)) {
      await this.prisma.clubMenuItem.updateMany({
        where: { kind: kind as PaymentKind, isFixed: true },
        data: { priceRub },
      });
    }

    const after = await this.get();
    await this.audit.record({
      actorId,
      action: "club.settings.update",
      entity: "ClubSettings",
      entityId: ROW_ID,
      before,
      after,
    });
    return after;
  }

  async createMenuItem(actorId: string, input: CreateClubMenuItemInput): Promise<ClubMenuItem> {
    if (input.kind === "entry" || input.kind === "rebuy" || input.kind === "addon") {
      if (!input.isPromo) {
        throw new BadRequestException({
          code: "FIXED_KIND",
          message: "Вход, адон и ребай уже есть — добавьте другую позицию или акцию",
        });
      }
    }

    const bundle = parsePromoBundle(input.bundle);
    const kind = input.isPromo && bundle.length > 0 ? promoKindFromBundle(bundle) : input.kind;

    const last = await this.prisma.clubMenuItem.aggregate({ _max: { sortOrder: true } });
    const item = await this.prisma.clubMenuItem.create({
      data: {
        title: input.title,
        kind,
        priceRub: input.priceRub,
        chips: input.isPromo && bundle.length > 0 ? 0 : input.chips,
        isPromo: input.isPromo,
        isActive: input.isActive,
        isFixed: false,
        sortOrder: (last._max.sortOrder ?? 10) + 1,
        bundle: bundle.length > 0 ? (bundle as never) : undefined,
      },
    });

    await this.audit.record({
      actorId,
      action: "club.menu.create",
      entity: "ClubMenuItem",
      entityId: item.id,
      after: { title: item.title, kind: item.kind, priceRub: item.priceRub, chips: item.chips },
    });
    return toMenuView(item);
  }

  async updateMenuItem(
    actorId: string,
    id: string,
    input: UpdateClubMenuItemInput,
  ): Promise<ClubMenuItem> {
    const before = await this.prisma.clubMenuItem.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "MENU_ITEM_NOT_FOUND", message: "Позиция не найдена" });
    }

    if (before.isFixed && input.kind != null && input.kind !== before.kind) {
      throw new BadRequestException({
        code: "FIXED_ITEM",
        message: "Вид входа, адона и ребая менять нельзя",
      });
    }

    const bundle = input.bundle === undefined ? undefined : parsePromoBundle(input.bundle);
    const kind =
      bundle && bundle.length > 0
        ? promoKindFromBundle(bundle)
        : before.isFixed || input.kind === undefined
          ? undefined
          : input.kind;

    const item = await this.prisma.clubMenuItem.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(kind === undefined ? {} : { kind }),
        ...(input.priceRub === undefined ? {} : { priceRub: input.priceRub }),
        ...(input.chips === undefined ? {} : { chips: input.chips }),
        ...(input.isPromo === undefined || before.isFixed ? {} : { isPromo: input.isPromo }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(bundle === undefined
          ? {}
          : { bundle: (bundle.length > 0 ? bundle : null) as never }),
      },
    });

    if (item.isFixed) {
      const column =
        item.kind === "entry"
          ? "entryPriceRub"
          : item.kind === "rebuy"
            ? "rebuyPriceRub"
            : item.kind === "addon"
              ? "addonPriceRub"
              : null;
      if (column) {
        await this.prisma.clubSettings.update({
          where: { id: ROW_ID },
          data: { [column]: item.priceRub },
        });
      }
    }

    await this.audit.record({
      actorId,
      action: "club.menu.update",
      entity: "ClubMenuItem",
      entityId: id,
      before: { title: before.title, priceRub: before.priceRub, chips: before.chips },
      after: { title: item.title, priceRub: item.priceRub, chips: item.chips },
    });
    return toMenuView(item);
  }

  async deleteMenuItem(actorId: string, id: string): Promise<{ ok: true }> {
    const before = await this.prisma.clubMenuItem.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "MENU_ITEM_NOT_FOUND", message: "Позиция не найдена" });
    }
    if (before.isFixed) {
      throw new BadRequestException({
        code: "FIXED_ITEM",
        message: "Вход, адон и ребай удалить нельзя",
      });
    }

    await this.prisma.clubMenuItem.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: "club.menu.delete",
      entity: "ClubMenuItem",
      entityId: id,
      before: { title: before.title, kind: before.kind },
    });
    return { ok: true };
  }

  async createVenue(actorId: string, input: ClubVenueInput): Promise<ClubVenue> {
    const venue = await this.prisma.venue.create({
      data: { title: input.title, address: input.address },
    });
    await this.audit.record({
      actorId,
      action: "club.venue.create",
      entity: "Venue",
      entityId: venue.id,
      after: { title: venue.title, address: venue.address },
    });
    return toVenueView(venue);
  }

  async updateVenue(actorId: string, id: string, input: ClubVenueInput): Promise<ClubVenue> {
    const before = await this.prisma.venue.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "VENUE_NOT_FOUND", message: "Адрес не найден" });
    }
    const venue = await this.prisma.venue.update({
      where: { id },
      data: { title: input.title, address: input.address },
    });
    await this.audit.record({
      actorId,
      action: "club.venue.update",
      entity: "Venue",
      entityId: id,
      before: { title: before.title, address: before.address },
      after: { title: venue.title, address: venue.address },
    });
    return toVenueView(venue);
  }

  async deleteVenue(actorId: string, id: string): Promise<{ ok: true }> {
    const before = await this.prisma.venue.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "VENUE_NOT_FOUND", message: "Адрес не найден" });
    }
    await this.prisma.venue.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: "club.venue.delete",
      entity: "Venue",
      entityId: id,
      before: { title: before.title, address: before.address },
    });
    return { ok: true };
  }

  private async ensureFixedItems(row: {
    entryPriceRub: number;
    rebuyPriceRub: number;
    addonPriceRub: number;
  }): Promise<void> {
    const existing = await this.prisma.clubMenuItem.findMany({
      where: { isFixed: true },
      select: { kind: true },
    });
    const have = new Set(existing.map((item) => item.kind));
    const prices = {
      entry: row.entryPriceRub,
      rebuy: row.rebuyPriceRub,
      addon: row.addonPriceRub,
    } as const;

    for (const spec of FIXED) {
      if (have.has(spec.kind)) continue;
      await this.prisma.clubMenuItem.create({
        data: {
          title: spec.title,
          kind: spec.kind,
          priceRub: prices[spec.kind as keyof typeof prices],
          chips: 0,
          isFixed: true,
          isPromo: false,
          isActive: true,
          sortOrder: spec.sortOrder,
        },
      });
    }
  }

  private async ensureDefaultDrink(drinkPriceRub: number): Promise<void> {
    const extras = await this.prisma.clubMenuItem.count({
      where: { isFixed: false },
    });
    if (extras > 0) return;
    await this.prisma.clubMenuItem.create({
      data: {
        title: "Напиток",
        kind: "drink",
        priceRub: drinkPriceRub,
        chips: 0,
        isFixed: false,
        isPromo: false,
        isActive: true,
        sortOrder: 10,
      },
    });
  }

  /**
   * Till totals for the books: what was bought, how often, for how much.
   * Week and month follow the club calendar in Samara; season follows the
   * tournament's season, not the payment timestamp.
   */
  async sales(query: SalesQuery): Promise<SalesReport> {
    const now = new Date();
    let from: Date | null = null;
    let seasonId: string | null = query.seasonId ?? null;
    let seasonTitle: string | null = null;

    if (query.period === "week") {
      from = startOfClubWeek(now);
    } else if (query.period === "month") {
      from = startOfClubMonth(now);
    } else if (query.period === "season") {
      const season = seasonId
        ? await this.prisma.season.findUnique({ where: { id: seasonId } })
        : await this.prisma.season.findFirst({ where: { isActive: true }, orderBy: { startsAt: "desc" } });
      if (season) {
        seasonId = season.id;
        seasonTitle = season.title;
        from = season.startsAt;
      }
    }

    const payments = await this.prisma.payment.findMany({
      where: {
        voidedAt: null,
        ...(query.period === "season" && seasonId
          ? { tournament: { seasonId } }
          : from
            ? { createdAt: { gte: from } }
            : {}),
      },
      select: {
        kind: true,
        amountRub: true,
        chips: true,
        note: true,
        tournamentId: true,
      },
    });

    const grouped = new Map<
      string,
      { title: string; kind: SalesReport["lines"][number]["kind"]; count: number; amountRub: number; chips: number }
    >();

    for (const payment of payments) {
      const title = payment.note?.trim() || kindTitle(payment.kind);
      const key = `${payment.kind}:${title}`;
      const line = grouped.get(key) ?? {
        title,
        kind: payment.kind,
        count: 0,
        amountRub: 0,
        chips: 0,
      };
      line.count += 1;
      line.amountRub += payment.amountRub;
      line.chips += payment.chips;
      grouped.set(key, line);
    }

    const lines = [...grouped.values()].sort((a, b) => b.amountRub - a.amountRub || b.count - a.count);
    const tournamentIds = new Set(payments.map((payment) => payment.tournamentId));

    return {
      period: query.period,
      from: from?.toISOString() ?? null,
      to: now.toISOString(),
      seasonId,
      seasonTitle,
      tournamentCount: tournamentIds.size,
      paymentCount: payments.length,
      totalRub: payments.reduce((sum, payment) => sum + payment.amountRub, 0),
      totalChips: payments.reduce((sum, payment) => sum + payment.chips, 0),
      lines,
    };
  }

  /**
   * Everything that happened at one evening's desk, in order, with a name
   * against each line.
   *
   * Read from the audit trail rather than from the payments themselves, because
   * the question this answers is "who did that", and a voided line, a prize
   * written off and a place typed in wrong all belong in the same list.
   */
  async journal(tournamentId: string): Promise<EveningJournal> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, title: true, startsAt: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }

    // Combos are keyed by their own grant id, so the evening has to be looked
    // up first — there is no tournament id inside the audit row to filter on.
    const grants = await this.prisma.userAchievement.findMany({
      where: { tournamentId },
      select: { id: true },
    });

    const rows = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entity: "Tournament", entityId: tournamentId },
          { entity: "Registration", entityId: { startsWith: `${tournamentId}:` } },
          ...(grants.length > 0
            ? [{ entity: "UserAchievement", entityId: { in: grants.map((row) => row.id) } }]
            : []),
        ],
      },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { nickname: true, displayName: true } } },
    });

    const achievements = await this.prisma.achievement.findMany({
      select: { code: true, title: true },
    });
    const titles = new Map(achievements.map((row) => [row.code, row.title]));

    const described = rows.map((row) => ({ row, told: describe(row, titles) }));

    const playerIds = [
      ...new Set(described.map((item) => item.told.playerId).filter((id): id is string => id != null)),
    ];
    const players = await this.prisma.user.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, nickname: true, displayName: true },
    });
    const nameById = new Map(
      players.map((row) => [row.id, formatPlayerName(row.displayName, row.nickname)]),
    );

    const entries: EveningJournal["entries"] = described.map(({ row, told }) => ({
      id: row.id,
      at: row.createdAt.toISOString(),
      action: row.action,
      label: told.label,
      actor: row.actor ? formatPlayerName(row.actor.displayName, row.actor.nickname) : null,
      player: told.playerId ? (nameById.get(told.playerId) ?? null) : null,
      playerId: told.playerId,
      amountRub: told.amountRub,
    }));

    return {
      tournamentId: tournament.id,
      title: tournament.title,
      startsAt: tournament.startsAt.toISOString(),
      totalRub: entries.reduce((sum, entry) => sum + entry.amountRub, 0),
      staff: summariseStaff(entries),
      entries,
    };
  }
}

function toVenueView(venue: { id: string; title: string; address: string | null }): ClubVenue {
  return { id: venue.id, title: venue.title, address: venue.address };
}

function toMenuView(item: MenuRow): ClubMenuItem {
  const bundle = parsePromoBundle("bundle" in item ? item.bundle : null);
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    priceRub: item.priceRub,
    chips: item.chips,
    isFixed: item.isFixed,
    isPromo: item.isPromo,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    bundle: bundle.length > 0 ? bundle : null,
  };
}

function kindTitle(kind: MenuRow["kind"]): string {
  if (kind === "entry") return "Вход";
  if (kind === "rebuy") return "Ребай";
  if (kind === "addon") return "Адон";
  if (kind === "drink") return "Напиток";
  return "Прочее";
}

function clubDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TIMEZONE }).format(date);
}

function startOfClubDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+04:00`);
}

function startOfClubMonth(date: Date): Date {
  return startOfClubDay(`${clubDay(date).slice(0, 7)}-01`);
}

function startOfClubWeek(date: Date): Date {
  const ymd = clubDay(date);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: CLUB_TIMEZONE,
    weekday: "short",
  }).format(new Date(`${ymd}T12:00:00+04:00`));
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday] ?? 0;
  const noon = new Date(`${ymd}T12:00:00+04:00`);
  const monday = new Date(noon.getTime() - back * 86_400_000);
  return startOfClubDay(clubDay(monday));
}
