import { randomInt, randomUUID } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  DEFAULT_RATING_CONFIG,
  formatPlayerName,
  hasRole,
  parsePromoBundle,
  type AccountView,
  type LiveAction,
  type LiveState,
  type LiveView,
  type PlaceOrderInput,
  type ReceiptInput,
} from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { PrismaService } from "../common/prisma/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import {
  NotificationsService,
  escapeHtml,
} from "../notifications/notifications.service";
import { RatingService } from "../rating/rating.service";
import { AchievementsService } from "../achievements/achievements.service";
import {
  assertAddonRoom,
  kindTitle,
  assertEntryUnpaid,
  seatPlayer,
  returnToPlay,
} from "../tournaments/cash-desk";
import {
  chipsForKind,
  effectiveConfig,
} from "../tournaments/tournament-config";
import { assertNoPastDebt, dueFor } from "./accounts";
import {
  assignSeat,
  automaticPlaces,
  canBreak,
  clockView,
  initialState,
  occupancy,
  rebuyOpen,
} from "./live-engine";

type Tx = Prisma.TransactionClient;
function fail(message: string): never {
  throw new ConflictException({ code: "LIVE_CONFLICT", message });
}
function floor(actor: RequestUser) {
  if (!hasRole(actor.role, "floor"))
    throw new ForbiddenException("Недостаточно прав");
}
function staff(actor: RequestUser) {
  if (!hasRole(actor.role, "hostess"))
    throw new ForbiddenException("Недостаточно прав");
}

@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private reminding = false;
  constructor(
    private readonly db: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly rating: RatingService,
    private readonly achievements: AchievementsService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.remind().catch(() => {}), 60_000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async templates() {
    const settings = await this.db.clubSettings.findUnique({
      where: { id: "club" },
    });
    return (settings?.blindTemplates ?? []) as unknown as {
      id: string;
      title: string;
      config: LiveState["config"];
    }[];
  }
  async saveTemplate(
    actor: RequestUser,
    body: { id?: string; title: string; config: LiveState["config"] },
  ) {
    return this.changeTemplates(actor, (rows) => {
      const item = { ...body, id: body.id ?? randomUUID() };
      return [...rows.filter((row) => row.id !== item.id), item];
    });
  }
  async deleteTemplate(actor: RequestUser, id: string) {
    return this.changeTemplates(actor, (rows) =>
      rows.filter((row) => row.id !== id),
    );
  }
  private async changeTemplates(
    actor: RequestUser,
    change: (
      rows: { id: string; title: string; config: LiveState["config"] }[],
    ) => { id: string; title: string; config: LiveState["config"] }[],
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.clubSettings.upsert({
        where: { id: "club" },
        create: { id: "club" },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM "ClubSettings" WHERE id='club' FOR UPDATE`;
      const settings = await tx.clubSettings.findUniqueOrThrow({
        where: { id: "club" },
      });
      const rows = change((settings.blindTemplates ?? []) as never);
      if (rows.length > 50) fail("Не больше 50 структур");
      await tx.clubSettings.update({
        where: { id: "club" },
        data: { blindTemplates: rows as never },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "blind.templates",
          entity: "club",
          entityId: "club",
          after: { count: rows.length },
        },
      });
      return rows;
    });
  }

  async locked<T>(
    id: string,
    work: (tx: Tx, state: LiveState | null) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "Tournament" WHERE id=${id} FOR UPDATE`;
        if (!rows.length) throw new NotFoundException("Турнир не найден");
        const live = await tx.liveTournament.findUnique({
          where: { tournamentId: id },
        });
        return work(tx, live ? (live.state as unknown as LiveState) : null);
      },
      { timeout: 20000 },
    );
  }
  private async save(tx: Tx, id: string, state: LiveState) {
    const existing = await tx.liveTournament.findUnique({ where: { tournamentId: id }, select: { displayCode: true } });
    let displayCode = existing?.displayCode;
    if (!displayCode) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(83462109)`;
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = String(randomInt(100000, 1000000));
        if (!await tx.liveTournament.findUnique({ where: { displayCode: candidate }, select: { tournamentId: true } })) {
          displayCode = candidate;
          break;
        }
      }
      if (!displayCode) fail("Не удалось создать код телевизора. Повторите попытку.");
    }
    await tx.liveTournament.upsert({
      where: { tournamentId: id },
      create: { tournamentId: id, state: state as never, displayCode },
      update: { state: state as never, displayCode },
    });
  }
  private async audit(
    tx: Tx,
    id: string,
    actor: RequestUser,
    action: string,
    data: object,
  ) {
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: `live.${action}`,
        entity: "Tournament",
        entityId: id,
        after: {
          ...data,
          interface:
            actor.role === "dealer"
              ? "dealer"
              : actor.role === "player"
                ? "miniapp"
                : "staff",
        } as never,
      },
    });
  }
  private player(state: LiveState, userId: string) {
    const p = state.seats.find((s) => s.userId === userId);
    if (!p) fail("Игрок ещё не оформлен на вечер");
    return p;
  }
  private access(
    state: LiveState,
    actor: RequestUser,
    userId?: string,
    table?: number,
  ) {
    if (hasRole(actor.role, "floor")) return;
    const player = userId ? this.player(state, userId) : null;
    const target = table ?? player?.table ?? player?.lastTable ?? null;
    if (
      actor.role !== "dealer" ||
      !actor.dealerShiftId ||
      actor.dealerTable !== target ||
      !state.tables.some(
        (t) => t.open && t.number === target && t.dealerId === actor.id,
      )
    )
      throw new ForbiddenException("Доступен только ваш стол");
  }
  async view(
    id: string,
    actor?: RequestUser,
    token?: string,
  ): Promise<LiveView> {
    const t = await this.db.tournament.findUnique({
      where: { id },
      include: { live: true, results: true },
    });
    if (!t) throw new NotFoundException();
    const display = !!token && t.live?.displayToken === token;
    if (!display && (!actor || !hasRole(actor.role, "dealer")))
      throw new ForbiddenException();
    if (
      actor?.role === "dealer" &&
      (!actor.dealerShiftId || actor.dealerTournamentId !== id)
    )
      throw new ForbiddenException("Войдите на планшете");
    const state = t.live
      ? structuredClone(t.live.state as unknown as LiveState)
      : null;
    const players = await this.db.user.findMany({
      where: {
        OR: [
          {
            registrations: { some: { tournamentId: id, status: "registered" } },
          },
          { payments: { some: { tournamentId: id, voidedAt: null } } },
          { id: { in: state?.seats.map((p) => p.userId) ?? [] } },
        ],
      },
      select: { id: true, nickname: true, displayName: true },
    });
    const balances =
      display || actor?.role === "dealer" || actor?.role === "floor"
        ? []
        : await Promise.all(
            players.map(async (p) => ({
              userId: p.id,
              dueRub: Math.max(0, await dueFor(this.db, p.id, id)),
            })),
          );
    const top = t.seasonId
      ? await this.db.userSeasonStats.findMany({
          where: { seasonId: t.seasonId },
          include: { user: true },
          orderBy: { points: "desc" },
          take: 17,
        })
      : [];
    if (state) {
      if (!rebuyOpen(state))
        state.seats.forEach((s) => {
          if (s.state === "busted") s.state = "eliminated";
        });
      if (display) {
        state.orders = [];
        state.alerts = [];
        state.bounties = [];
      } else if (actor?.role === "dealer" || actor?.role === "floor") {
        const own = new Set(
          state.tables
            .filter(
              (t) =>
                (actor.role === "floor" || t.dealerId === actor.id) && t.open,
            )
            .map((t) => t.number),
        );
        const users = new Set(
          state.seats
            .filter((s) => s.table != null && own.has(s.table))
            .map((s) => s.userId),
        );
        state.orders = state.orders.filter((o) => users.has(o.userId));
        state.alerts = [];
        state.bounties = state.bounties.filter((b) => users.has(b.userId));
      }
    }
    return {
      id,
      title: t.title,
      status: t.status,
      paidPlaces: t.paidPlaces ?? DEFAULT_RATING_CONFIG.defaultPaidPlaces,
      handOfDay:
        (await this.db.clubSettings.findUnique({ where: { id: "club" } }))
          ?.handOfDay ?? null,
      serverTime: new Date().toISOString(),
      state,
      clock: state ? clockView(state) : null,
      players: players.map((p) => ({
        id: p.id,
        name: formatPlayerName(p.displayName, p.nickname),
        ...(actor?.role !== "dealer"
          ? { place: t.results.find((r) => r.userId === p.id)?.place ?? null }
          : {}),
      })),
      balances,
      leaderboard: top.map((r) => ({
        name: formatPlayerName(r.user.displayName, r.user.nickname),
        points: r.points,
      })),
      ...(actor && hasRole(actor.role, "floor")
        ? { displayToken: t.live?.displayToken, displayCode: t.live?.displayCode }
        : {}),
    };
  }
  async connectDisplay(code: string) {
    const live = await this.db.liveTournament.findUnique({
      where: { displayCode: code },
      select: { tournamentId: true, displayToken: true, tournament: { select: { status: true } } },
    });
    if (!live || live.tournament.status === "cancelled" || live.tournament.status === "draft")
      throw new NotFoundException("Код турнира не найден");
    return { id: live.tournamentId, token: live.displayToken };
  }
  async action(id: string, actor: RequestUser, input: LiveAction) {
    if (actor.role === "dealer" && actor.dealerTournamentId !== id)
      throw new ForbiddenException("Доступен только ваш вечер");
    await this.locked(id, async (tx, current) => {
      const t = await tx.tournament.findUniqueOrThrow({ where: { id } });
      if (t.status === "finished" || t.status === "cancelled")
        fail("Сначала верните турнир в игру");
      if (input.type === "configure") {
        if (!hasRole(actor.role, "admin")) throw new ForbiddenException();
        if (current && (current.seats.length || current.clock.running))
          fail("Структуру нельзя заменить после начала посадки");
        const count = await tx.registration.count({
          where: { tournamentId: id, status: "registered" },
        });
        if (count > input.config.maxTables * input.config.seatsPerTable)
          fail("Вместимость меньше числа записанных игроков");
        const next = initialState(input.config);
        const entries = await tx.payment.findMany({
          where: {
            tournamentId: id,
            kind: "entry",
            voidedAt: null,
            deferred: false,
          },
          orderBy: { createdAt: "asc" },
        });
        for (const entry of entries) {
          if (next.seats.some((p) => p.userId === entry.userId)) continue;
          const chips = await tx.payment.aggregate({
            where: { tournamentId: id, userId: entry.userId, voidedAt: null },
            _sum: { chips: true },
          });
          const result = await tx.result.findUnique({
            where: {
              tournamentId_userId: { tournamentId: id, userId: entry.userId },
            },
          });
          next.seats.push({
            userId: entry.userId,
            table: null,
            seat: null,
            lastTable: undefined,
            state: result?.place ? "eliminated" : "playing",
            stack: chips._sum.chips ?? 40000,
            arrivedAt: entry.createdAt.toISOString(),
            measuredAt: new Date().toISOString(),
            wantsMove: false,
          });
        }
        if (
          next.seats.length >
          input.config.maxTables * input.config.seatsPerTable
        )
          fail("Вместимость меньше числа участников");
        await this.save(tx, id, next);
        await tx.tournament.update({
          where: { id },
          data: {
            capacity: input.config.maxTables * input.config.seatsPerTable,
            maxTables: input.config.maxTables,
            seatsPerTable: input.config.seatsPerTable,
          },
        });
      } else {
        if (!current) fail("Настройте столы и структуру турнира");
        const s = current;
        switch (input.type) {
          case "openTable": {
            floor(actor);
            const table = s.tables.find((t) => t.number === input.table);
            if (!table) fail("Стол не найден");
            if (!input.open && occupancy(s, table.number))
              fail("Расформируйте стол перед закрытием");
            table.open = input.open;
            if (input.open)
              for (const seat of s.seats.filter(
                (p) => p.state === "playing" && p.table === null,
              ))
                assignSeat(s, seat);
            break;
          }
          case "table": {
            staff(actor);
            const table = s.tables.find((t) => t.number === input.table);
            if (!table) fail("Стол не найден");
            const dealer = await tx.user.findUnique({
              where: { id: input.dealerId },
            });
            if (
              !dealer ||
              !hasRole(dealer.role, "dealer") ||
              dealer.status !== "active"
            )
              fail("Выберите действующего дилера");
            if (
              input.open &&
              s.tables.some(
                (t) =>
                  t.open &&
                  t.number !== input.table &&
                  t.dealerId === input.dealerId,
              )
            )
              fail("Дилер уже назначен на другой стол");
            if (!input.open && occupancy(s, input.table) > 0)
              fail("Сначала расформируйте стол");
            table.open = input.open;
            table.dealerId = input.dealerId;
            for (const p of s.seats.filter(
              (p) => p.state === "playing" && p.table === null,
            ))
              assignSeat(s, p);
            break;
          }
          case "clock": {
            floor(actor);
            const c = clockView(s);
            if (input.command === "start") {
              if (!s.clock.running) {
                s.clock.startedAt = new Date().toISOString();
                s.clock.running = true;
              }
            }
            if (input.command === "pause") {
              s.clock.elapsedSeconds = c.elapsed;
              s.clock.startedAt = null;
              s.clock.running = false;
            }
            if (input.command === "reset") {
              if (s.seats.length)
                fail("Сброс часов доступен только до прихода игроков");
              s.clock = { running: false, elapsedSeconds: 0, startedAt: null };
            }
            if (input.command === "next") {
              s.clock.elapsedSeconds = s.config.levels
                .slice(0, c.index + 1)
                .reduce((n, l) => n + l.seconds, 0);
              s.clock.startedAt = s.clock.running
                ? new Date().toISOString()
                : null;
            }
            if (input.command === "previous" || input.command === "skipBreak") {
              let index = Math.max(0, c.index - 1);
              if (input.command === "skipBreak") {
                index = s.config.levels.findIndex(
                  (level, i) => i >= c.index && level.break,
                );
                if (index < 0) fail("Впереди нет перерыва");
                if (index === c.index) {
                  index += 1;
                } else {
                  s.config.levels.splice(index, 1);
                  for (const key of [
                    "registrationClosesLevel",
                    "rebuyClosesLevel",
                    "addonLevel",
                  ] as const) {
                    if (s.config[key] > index + 1) s.config[key] -= 1;
                  }
                  break;
                }
              }
              s.clock.elapsedSeconds = s.config.levels
                .slice(0, index)
                .reduce((sum, level) => sum + level.seconds, 0);
              s.clock.startedAt = s.clock.running
                ? new Date().toISOString()
                : null;
            }
            break;
          }
          case "editLevel": {
            floor(actor);
            if (!s.config.levels[input.index]) fail("Уровень не найден");
            const before = clockView(s);
            s.config.levels[input.index] = input.level;
            if (input.index <= before.index) {
              // Preserve the current level and its remaining time when editing the structure.
              const oldStart =
                before.elapsed - (before.level.seconds - before.remaining);
              const elapsedInLevel = before.elapsed - oldStart;
              s.clock.elapsedSeconds =
                s.config.levels
                  .slice(0, before.index)
                  .reduce((sum, level) => sum + level.seconds, 0) +
                Math.min(
                  elapsedInLevel,
                  s.config.levels[before.index]!.seconds,
                );
              s.clock.startedAt = s.clock.running
                ? new Date().toISOString()
                : null;
            }
            break;
          }
          case "arrive": {
            staff(actor);
            await assertNoPastDebt(tx, input.userId, id);
            if (s.seats.some((p) => p.userId === input.userId))
              fail("Приход уже оформлен");
            const entry = await tx.payment.findFirst({
              where: {
                tournamentId: id,
                userId: input.userId,
                kind: "entry",
                voidedAt: null,
                deferred: false,
              },
            });
            if (!entry) fail("Сначала примите оплату входа");
            const p = {
              userId: input.userId,
              table: null,
              seat: null,
              state: "playing" as const,
              stack: entry.chips,
              measuredAt: new Date().toISOString(),
              arrivedAt: new Date().toISOString(),
              wantsMove: false,
            };
            s.seats.push(p);
            assignSeat(s, p);
            break;
          }
          case "bust": {
            this.access(s, actor, input.userId);
            const p = this.player(s, input.userId);
            if (p.state !== "playing" && !(p.state === "busted" && input.final))
              fail("Игрок уже выбыл");
            p.lastTable = p.table ?? p.lastTable;
            p.state = input.final || !rebuyOpen(s) ? "eliminated" : "busted";
            p.bustedAt = new Date().toISOString();
            if (p.state === "eliminated") p.eliminatedAt = p.bustedAt;
            p.stack = 0;
            p.table = null;
            p.seat = null;
            p.wantsMove = false;
            s.alerts.push({
              id: randomUUID(),
              userId: p.userId,
              text: `${p.state === "eliminated" ? "Завершил игру" : "Без стека"}. К оплате ${Math.max(0, await dueFor(tx, p.userId, id))} ₽`,
              createdAt: new Date().toISOString(),
              acknowledgedBy: null,
            });
            await this.notify(
              tx,
              p.userId,
              "player.busted",
              randomUUID(),
              p.state === "eliminated"
                ? "Игра завершена. Ваш счёт доступен в клубе."
                : "Стек закончился. Ребай доступен до закрытия регистрации.",
            );
            break;
          }
          case "correctPlace": {
            floor(actor);
            const actual = await tx.result.findUnique({
              where: {
                tournamentId_userId: { tournamentId: id, userId: input.userId },
              },
            });
            if ((actual?.place ?? null) !== input.expected)
              fail("Место уже изменено. Обновите данные");
            const entrant = s.seats.find(
              (seat) => seat.userId === input.userId,
            );
            if (!entrant) fail("Игрок не участвовал в вечере");
            if (input.place && input.place > (t.paidPlaces ?? 9))
              fail("Только призовые места");
            const occupant = input.place
              ? await tx.result.findUnique({
                  where: {
                    tournamentId_place: {
                      tournamentId: id,
                      place: input.place,
                    },
                  },
                })
              : null;
            if (
              occupant &&
              occupant.userId !== input.userId &&
              occupant.userId !== input.swapUserId
            )
              fail("Место уже занято. Подтвердите обмен");
            await tx.result.deleteMany({
              where: {
                tournamentId: id,
                userId: {
                  in: [
                    input.userId,
                    ...(occupant && occupant.userId !== input.userId
                      ? [occupant.userId]
                      : []),
                  ],
                },
              },
            });
            if (input.place)
              await tx.result.create({
                data: {
                  tournamentId: id,
                  userId: input.userId,
                  place: input.place,
                },
              });
            if (occupant && occupant.userId !== input.userId && input.expected)
              await tx.result.create({
                data: {
                  tournamentId: id,
                  userId: occupant.userId,
                  place: input.expected,
                },
              });
            break;
          }
          case "restore": {
            floor(actor);
            const p = this.player(s, input.userId);
            if (p.state === "playing") fail("Игрок уже в игре");
            p.state = "playing";
            delete p.eliminatedAt;
            delete p.bustedAt;
            await tx.result.deleteMany({
              where: { tournamentId: id, userId: input.userId },
            });
            p.stack = input.stack;
            p.measuredAt = new Date().toISOString();
            assignSeat(s, p);
            break;
          }
          case "stack":
            floor(actor);
            this.access(s, actor, input.userId);
            Object.assign(this.player(s, input.userId), {
              stack: input.stack,
              measuredAt: new Date().toISOString(),
            });
            break;
          case "wantMove": {
            if (actor.id !== input.userId) this.access(s, actor, input.userId);
            const p = this.player(s, input.userId);
            if (p.state !== "playing")
              fail("Пересадка доступна игроку за столом");
            p.wantsMove = input.wanted;
            break;
          }
          case "rebox": {
            this.access(s, actor, input.userId);
            if (!hasRole(actor.role, "dealer")) throw new ForbiddenException();
            const p = this.player(s, input.userId);
            if (
              p.state !== "playing" ||
              p.table === null ||
              input.seat > s.config.seatsPerTable
            )
              fail("Игрок не за столом");
            const q = s.seats.find(
              (q) =>
                q.state === "playing" &&
                q.table === p.table &&
                q.seat === input.seat,
            );
            if (
              p.seat !== input.expectedSeat ||
              (q?.userId ?? null) !== input.expectedOccupant
            )
              throw new ConflictException(
                "Посадка изменилась. Повторите перемещение",
              );
            if (q && q.userId !== p.userId) q.seat = p.seat;
            p.seat = input.seat;
            break;
          }
          case "move": {
            this.access(s, actor, input.userId);
            const p = this.player(s, input.userId);
            if (p.state !== "playing" || p.table === null)
              fail("Игрок не за столом");
            const to = s.tables.find(
              (t) => t.number === input.targetTable && t.open && t.dealerId,
            );
            if (!to || p.table === to.number)
              fail("Выберите другой действующий стол");
            if (input.swapUserId) {
              const q = this.player(s, input.swapUserId);
              if (
                (!hasRole(actor.role, "floor") &&
                  (!p.wantsMove || !q.wantsMove)) ||
                q.state !== "playing" ||
                q.table !== to.number
              )
                fail("Запрос обмена уже не действителен");
              const prev = { table: p.table, seat: p.seat };
              p.table = q.table;
              p.seat = q.seat;
              q.table = prev.table;
              q.seat = prev.seat;
              p.wantsMove = false;
              q.wantsMove = false;
            } else {
              if (!hasRole(actor.role, "floor")) {
                const counts = s.tables
                  .filter((table) => table.open && table.dealerId)
                  .map((table) => occupancy(s, table.number));
                const future = s.tables
                  .filter((table) => table.open && table.dealerId)
                  .map(
                    (table) =>
                      occupancy(s, table.number) +
                      (table.number === to.number ? 1 : 0) -
                      (table.number === p.table ? 1 : 0),
                  );
                if (
                  Math.max(...future) - Math.min(...future) >= 2 &&
                  Math.max(...future) - Math.min(...future) >
                    Math.max(...counts) - Math.min(...counts)
                )
                  fail("Пересадку с изменением баланса подтверждает флор");
              }
              if (occupancy(s, to.number) >= s.config.seatsPerTable)
                fail("Стол заполнен");
              p.table = null;
              p.seat = null;
              const used = new Set(
                s.seats
                  .filter((q) => q.table === to.number && q.state === "playing")
                  .map((q) => q.seat),
              );
              p.table = to.number;
              p.seat = Array.from(
                { length: s.config.seatsPerTable },
                (_, i) => i + 1,
              ).find((n) => !used.has(n))!;
              p.wantsMove = false;
            }
            break;
          }
          case "breakRequest": {
            this.access(s, actor, undefined, input.table);
            if (
              clockView(s).index + 1 <= s.config.registrationClosesLevel &&
              !clockView(s).complete
            )
              fail("Регистрация ещё открыта");
            if (!canBreak(s, input.table))
              fail("За другими столами недостаточно мест");
            const table = s.tables.find(
              (t) => t.number === input.table && t.open,
            );
            if (!table) fail("Стол закрыт");
            table.breakRequested = true;
            break;
          }
          case "breakApprove": {
            floor(actor);
            const table = s.tables.find(
              (t) =>
                t.number === input.table &&
                t.open &&
                (t.breakRequested ||
                  actor.role === "floor" ||
                  hasRole(actor.role, "admin")),
            );
            if (!table || !canBreak(s, input.table))
              fail("План расформирования больше недоступен");
            const moving = s.seats.filter(
              (p) => p.table === input.table && p.state === "playing",
            );
            table.open = false;
            table.dealerId = null;
            table.breakRequested = false;
            moving.forEach((p) => {
              p.table = null;
              p.seat = null;
            });
            for (const p of moving)
              if (!assignSeat(s, p, input.table)) fail("Недостаточно мест");
            break;
          }
          case "ack": {
            staff(actor);
            const a = s.alerts.find((a) => a.id === input.alertId);
            if (a) a.acknowledgedBy = actor.id;
            break;
          }
          case "deferBalance": {
            this.access(s, actor, undefined, input.table);
            const table = s.tables.find(
              (t) => t.number === input.table && t.open,
            );
            if (!table) fail("Стол закрыт");
            table.balanceDeferredUntil = new Date(
              Date.now() + 60000,
            ).toISOString();
            break;
          }
          case "bounty": {
            this.access(s, actor, input.userId);
            if (
              input.userId === input.victimId ||
              s.config.bountyMode === "none"
            )
              fail("Баунти недоступно");
            const victim = this.player(s, input.victimId);
            if (victim.state === "playing")
              fail("Сначала отметьте выбывшего игрока");
            if (
              actor.role === "dealer" &&
              victim.lastTable !== this.player(s, input.userId).table
            )
              throw new ForbiddenException(
                "Баунти можно отметить только за вылет с вашего стола",
              );
            const lastPurchase = await tx.payment.findFirst({
              where: {
                tournamentId: id,
                userId: input.victimId,
                voidedAt: null,
                kind: { in: ["entry", "rebuy"] },
              },
              orderBy: { createdAt: "desc" },
            });
            if (
              s.bounties.some(
                (b) =>
                  b.victimId === input.victimId &&
                  !b.voided &&
                  Date.parse(b.createdAt) >=
                    (lastPurchase?.createdAt.getTime() ?? 0),
              )
            )
              fail("Баунти за этот вылет уже записано");
            const b = {
              id: randomUUID(),
              userId: input.userId,
              victimId: input.victimId,
              actorId: actor.id,
              mode: s.config.bountyMode,
              points:
                s.config.bountyMode === "rating" ? s.config.bountyPoints : 0,
              createdAt: new Date().toISOString(),
              voided: false,
            };
            s.bounties.push(b);
            if (b.points)
              await this.ratingAward(
                tx,
                id,
                t.seasonId,
                b.userId,
                b.id,
                b.points,
                actor.id,
              );
            await this.notify(
              tx,
              b.userId,
              "bounty",
              b.id,
              b.points
                ? `Баунти: +${b.points} очков.`
                : "Начислена попытка в лототроне. Подойдите к хостес.",
            );
            break;
          }
          case "lottery": {
            staff(actor);
            const b = s.bounties.find(
              (b) =>
                b.id === input.bountyId &&
                !b.voided &&
                b.mode === "lottery" &&
                !b.award,
            );
            if (!b) fail("Попытка уже использована или отменена");
            const prizeIds: string[] = [];
            if (input.menuItemId) {
              const item = await tx.clubMenuItem.findUnique({
                where: { id: input.menuItemId },
              });
              if (!item || !item.isActive) fail("Позиция недоступна");
              const bundle = item.isPromo ? parsePromoBundle(item.bundle) : [];
              const lines = bundle.length
                ? bundle
                : [{ menuItemId: item.id, kind: item.kind, quantity: 1 }];
              if (item.isPromo && !bundle.length) fail("В акции нет позиций");
              const catalogue = await tx.clubMenuItem.findMany();
              if (
                lines.reduce(
                  (n, line) => n + line.quantity * input.quantity,
                  0,
                ) > 20
              )
                fail("Слишком много призов за одну попытку");
              for (const line of lines) {
                const unit = catalogue.find((m) =>
                  line.menuItemId
                    ? m.id === line.menuItemId
                    : m.isFixed && m.kind === line.kind,
                );
                if (!unit || !unit.isActive || unit.isPromo)
                  fail("Состав акции недоступен");
                for (let i = 0; i < line.quantity * input.quantity; i++) {
                  const prize = await tx.playerPrize.create({
                    data: {
                      userId: b.userId,
                      menuItemId: unit.id,
                      title: unit.title,
                      kind: unit.kind,
                      grantedById: actor.id,
                      wonAtId: id,
                      comment: "Лототрон",
                    },
                  });
                  prizeIds.push(prize.id);
                }
              }
            }
            b.award = {
              title: input.title,
              points: input.points,
              menuItemId: input.menuItemId,
              quantity: input.quantity,
              actorId: actor.id,
              prizeIds,
              at: new Date().toISOString(),
            };
            if (input.points)
              await this.ratingAward(
                tx,
                id,
                t.seasonId,
                b.userId,
                b.id,
                input.points,
                actor.id,
              );
            await this.notify(
              tx,
              b.userId,
              "lottery",
              b.id,
              `Лототрон: ${input.title}${input.points ? ` (+${input.points} очков)` : ""}.`,
            );
            break;
          }
          case "voidBounty": {
            staff(actor);
            const b = s.bounties.find(
              (b) => b.id === input.bountyId && !b.voided,
            );
            if (!b) fail("Баунти уже отменено");
            if (b.award?.prizeIds.length) {
              if (
                await tx.playerPrize.count({
                  where: {
                    id: { in: b.award.prizeIds },
                    redeemedAt: { not: null },
                  },
                })
              )
                fail("Приз уже использован. Сначала отмените его списание");
              await tx.playerPrize.updateMany({
                where: { id: { in: b.award.prizeIds } },
                data: { voidedAt: new Date(), voidedById: actor.id },
              });
            }
            await tx.ratingEvent.deleteMany({
              where: { comment: `bounty:${b.id}` },
            });
            await this.rating.recomputeStats([b.userId], t.seasonId, tx);
            b.voided = true;
            await this.notify(
              tx,
              b.userId,
              "bounty.cancel",
              b.id,
              "Начисление баунти отменено сотрудником клуба.",
            );
            break;
          }
          case "cancelLottery": {
            staff(actor);
            const b = s.bounties.find(
              (b) => b.id === input.bountyId && !b.voided && b.award,
            );
            if (!b || !b.award) fail("Результат не найден");
            if (
              await tx.playerPrize.count({
                where: {
                  id: { in: b.award.prizeIds },
                  redeemedAt: { not: null },
                },
              })
            )
              fail("Приз уже использован. Сначала отмените его списание");
            await tx.playerPrize.updateMany({
              where: { id: { in: b.award.prizeIds } },
              data: { voidedAt: new Date(), voidedById: actor.id },
            });
            await tx.ratingEvent.deleteMany({
              where: { comment: `bounty:${b.id}` },
            });
            await this.rating.recomputeStats([b.userId], t.seasonId, tx);
            delete b.award;
            await this.notify(
              tx,
              b.userId,
              "lottery.cancel",
              randomUUID(),
              "Результат лототрона отменён. Попытка восстановлена.",
            );
            break;
          }
        }
        if (!rebuyOpen(s))
          for (const seat of s.seats.filter(
            (seat) => seat.state === "busted",
          )) {
            seat.state = "eliminated";
            seat.eliminatedAt = seat.bustedAt ?? new Date().toISOString();
          }
        if (
          input.type === "bust" ||
          input.type === "clock" ||
          input.type === "editLevel"
        ) {
          for (const result of automaticPlaces(
            s,
            t.paidPlaces ?? DEFAULT_RATING_CONFIG.defaultPaidPlaces,
          )) {
            const existing = await tx.result.findUnique({
              where: {
                tournamentId_userId: {
                  tournamentId: id,
                  userId: result.userId,
                },
              },
            });
            const occupied = await tx.result.findUnique({
              where: {
                tournamentId_place: { tournamentId: id, place: result.place },
              },
            });
            if (!existing && !occupied) {
              await tx.result.create({ data: { tournamentId: id, ...result } });
              await this.audit(tx, id, actor, "result.automatic", result);
            }
          }
        }
        await this.save(tx, id, s);
      }
      await this.audit(tx, id, actor, input.type, input);
    });
    return hasRole(actor.role, "dealer") ? this.view(id, actor) : { ok: true };
  }
  private async ratingAward(
    tx: Tx,
    id: string,
    seasonId: string | null,
    userId: string,
    bountyId: string,
    points: number,
    actorId: string,
  ) {
    await tx.ratingEvent.create({
      data: {
        userId,
        seasonId,
        tournamentId: id,
        sourceType: "achievement",
        points,
        comment: `bounty:${bountyId}`,
        createdBy: actorId,
      },
    });
    await this.rating.recomputeStats([userId], seasonId, tx);
  }
  async notify(
    tx: Tx,
    userId: string,
    kind: string,
    key: string,
    text: string,
  ) {
    await this.notifications.queue(tx, {
      userId,
      kind,
      dedupeKey: key,
      text: escapeHtml(text),
    });
  }

  async recordPurchase(
    tx: Tx,
    id: string,
    userId: string,
    actorId: string,
    kind: string,
    chips: number,
    amountRub: number,
    key: string,
  ) {
    const row = await tx.liveTournament.findUnique({
      where: { tournamentId: id },
    });
    if (!row) {
      await this.notify(
        tx,
        userId,
        "purchase",
        key,
        `Записана покупка: ${amountRub} ₽.`,
      );
      return;
    }
    const s = row.state as unknown as LiveState;
    let p = s.seats.find((p) => p.userId === userId);
    if (kind === "entry") {
      if (
        clockView(s).complete ||
        clockView(s).index + 1 > s.config.registrationClosesLevel
      )
        fail("Регистрация закрыта");
      await assertNoPastDebt(tx, userId, id);
      if (!p) {
        if (s.seats.length >= s.config.maxTables * s.config.seatsPerTable)
          fail("Достигнута вместимость вечера");
        p = {
          userId,
          table: null,
          seat: null,
          state: "playing",
          stack: 0,
          measuredAt: new Date().toISOString(),
          arrivedAt: new Date().toISOString(),
          wantsMove: false,
        };
        s.seats.push(p);
      }
    }
    if (p) {
      if (kind === "rebuy") {
        if (p.state === "eliminated")
          fail("Игрок завершил игру. Возврат подтверждает хостес");
        delete p.bustedAt;
        delete p.eliminatedAt;
        if (!rebuyOpen(s)) fail("Ребаи закрыты");
        p.state = "playing";
      }
      if (
        kind === "addon" &&
        (clockView(s).index + 1 !== s.config.addonLevel ||
          clockView(s).complete)
      )
        fail("Окно адона закрыто");
      p.stack += chips;
      p.measuredAt = new Date().toISOString();
      if (p.state === "playing" && p.table === null) assignSeat(s, p);
    } else if (kind !== "entry") fail("Сначала оформите оплаченный вход");
    s.alerts.push({
      id: randomUUID(),
      userId,
      text: `Покупка: ${amountRub} ₽. К оплате ${Math.max(0, await dueFor(tx, userId, id))} ₽`,
      createdAt: new Date().toISOString(),
      acknowledgedBy: null,
    });
    await this.save(tx, id, s);
    await this.notify(
      tx,
      userId,
      "purchase",
      key,
      `Покупка ${amountRub} ₽. К оплате ${Math.max(0, await dueFor(tx, userId, id))} ₽.`,
    );
  }
  async voidPurchase(
    tx: Tx,
    id: string,
    userId: string,
    actorId: string,
    kind: string,
    chips: number,
    amountRub: number,
    key: string,
  ) {
    const row = await tx.liveTournament.findUnique({
      where: { tournamentId: id },
    });
    if (row) {
      const s = row.state as unknown as LiveState;
      const p = s.seats.find((p) => p.userId === userId);
      if (p) {
        if (kind === "entry") {
          const extra = await tx.payment.count({
            where: {
              tournamentId: id,
              userId,
              voidedAt: null,
              kind: { not: "entry" },
            },
          });
          if (extra) fail("У игрока есть другие покупки. Сначала исправьте их");
          s.seats = s.seats.filter((p) => p.userId !== userId);
        } else {
          p.stack = Math.max(0, p.stack - chips);
          p.measuredAt = new Date().toISOString();
        }
      }
      await this.save(tx, id, s);
    }
    await this.notify(
      tx,
      userId,
      "purchase.cancel",
      key,
      `Отменена покупка ${amountRub} ₽. К оплате ${Math.max(0, await dueFor(tx, userId, id))} ₽.`,
    );
  }

  async account(userId: string): Promise<AccountView> {
    const [p, r] = await Promise.all([
      this.db.payment.findMany({
        where: { userId },
        include: { tournament: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
      }),
      this.db.cashReceipt.findMany({
        where: { userId },
        include: { actor: { select: { nickname: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const ids = [
      ...new Set([
        ...p.map((p) => p.tournamentId),
        ...r.map((r) => r.tournamentId),
      ]),
    ];
    const accounts = ids.map((tournamentId) => {
      const purchases = p.filter((p) => p.tournamentId === tournamentId),
        receipts = r.filter((r) => r.tournamentId === tournamentId);
      const chargedRub = purchases
        .filter((p) => !p.voidedAt)
        .reduce((n, p) => n + p.amountRub, 0);
      const paidRub =
        purchases
          .filter((p) => !p.voidedAt && !p.deferred)
          .reduce((n, p) => n + p.amountRub, 0) +
        receipts
          .filter((r) => !r.voidedAt)
          .reduce((n, r) => n + r.amountRub, 0);
      return {
        tournamentId,
        title: purchases[0]?.tournament.title ?? "Вечер",
        chargedRub,
        paidRub,
        dueRub: chargedRub - paidRub,
        purchases: purchases.map((p) => ({
          id: p.id,
          title: p.note ?? kindTitle(p.kind),
          amountRub: p.amountRub,
          deferred: p.deferred,
          voided: !!p.voidedAt,
          createdAt: p.createdAt.toISOString(),
        })),
        receipts: receipts.map((r) => ({
          id: r.id,
          amountRub: r.amountRub,
          method: r.method,
          actor: r.actor.nickname,
          createdAt: r.createdAt.toISOString(),
          voided: !!r.voidedAt,
        })),
      };
    });
    return {
      userId,
      debtRub: accounts.reduce((n, a) => n + Math.max(0, a.dueRub), 0),
      creditRub: accounts.reduce((n, a) => n + Math.max(0, -a.dueRub), 0),
      accounts,
    };
  }
  async receipt(actor: RequestUser, input: ReceiptInput) {
    staff(actor);
    await this.locked(input.tournamentId, async (tx) => {
      if (
        await tx.cashReceipt.findUnique({
          where: { requestId: input.requestId },
        })
      )
        return;
      if (
        input.amountRub > (await dueFor(tx, input.userId, input.tournamentId))
      )
        fail("Сумма больше остатка к оплате");
      await tx.cashReceipt.create({ data: { ...input, actorId: actor.id } });
      await this.audit(tx, input.tournamentId, actor, "receipt", input);
      await this.notify(
        tx,
        input.userId,
        "receipt",
        input.requestId,
        `Получена оплата ${input.amountRub} ₽. К оплате ${Math.max(0, await dueFor(tx, input.userId, input.tournamentId))} ₽.`,
      );
    });
    return this.account(input.userId);
  }
  async voidReceipt(actor: RequestUser, receiptId: string) {
    staff(actor);
    const r = await this.db.cashReceipt.findUniqueOrThrow({
      where: { id: receiptId },
    });
    await this.locked(r.tournamentId, async (tx) => {
      const result = await tx.cashReceipt.updateMany({
        where: { id: r.id, voidedAt: null },
        data: { voidedAt: new Date() },
      });
      if (!result.count) fail("Оплата уже отменена");
      await this.audit(tx, r.tournamentId, actor, "receipt.cancel", {
        userId: r.userId,
        amountRub: r.amountRub,
        receiptId,
      });
      await this.notify(
        tx,
        r.userId,
        "receipt.cancel",
        r.id,
        `Оплата ${r.amountRub} ₽ отменена. Проверьте счёт.`,
      );
    });
    return this.account(r.userId);
  }
  async placeOrder(actor: RequestUser, input: PlaceOrderInput) {
    if (
      actor.role === "dealer" &&
      actor.dealerTournamentId !== input.tournamentId
    )
      throw new ForbiddenException("Доступен только ваш вечер");
    const userId = input.userId ?? actor.id;
    return this.locked(input.tournamentId, async (tx, s) => {
      if (!s) fail("Вечер не настроен");
      if (userId !== actor.id) this.access(s, actor, userId);
      const t = await tx.tournament.findUniqueOrThrow({
        where: { id: input.tournamentId },
      });
      if (t.status === "finished" || t.status === "cancelled")
        fail("Вечер завершён");
      if (s.orders.some((o) => o.id === input.requestId)) return { ok: true };
      this.player(s, userId);
      const item = await tx.clubMenuItem.findUnique({
        where: { id: input.menuItemId },
      });
      if (!item || !item.isActive || item.kind === "entry")
        fail("Позиция недоступна");
      if (
        actor.role === "floor" &&
        userId !== actor.id &&
        (item.kind !== "rebuy" || item.isPromo)
      )
        throw new ForbiddenException("Флор может оформить только ребай");
      if (item.kind === "rebuy" && !rebuyOpen(s)) fail("Ребаи закрыты");
      s.orders.push({
        id: input.requestId,
        userId,
        menuItemId: item.id,
        title: item.title,
        priceRub: item.priceRub,
        quantity: input.quantity,
        state: "pending",
        createdAt: new Date().toISOString(),
      });
      await this.save(tx, input.tournamentId, s);
      await this.audit(tx, input.tournamentId, actor, "order", {
        ...input,
        userId,
      });
      return { ok: true };
    });
  }
  async orderAction(
    id: string,
    orderId: string,
    actor: RequestUser,
    fulfil: boolean,
  ) {
    await this.locked(id, async (tx, s) => {
      if (!s) fail("Вечер не настроен");
      const o = s.orders.find((o) => o.id === orderId);
      if (!o || o.state !== "pending") fail("Заказ уже обработан");
      if (!fulfil) {
        if (actor.id !== o.userId) this.access(s, actor, o.userId);
        o.state = "cancelled";
      } else {
        this.access(s, actor, o.userId);
        const t = await tx.tournament.findUniqueOrThrow({ where: { id } });
        if (t.status === "finished" || t.status === "cancelled")
          fail("Вечер завершён");
        const item = await tx.clubMenuItem.findUniqueOrThrow({
          where: { id: o.menuItemId },
        });
        if (!item.isActive || item.priceRub !== o.priceRub)
          fail("Цена изменилась. Отмените заказ и создайте новый");
        if (
          (actor.role === "floor" && item.kind !== "rebuy") ||
          (actor.role === "dealer" &&
            item.kind !== "rebuy" &&
            item.kind !== "addon")
        )
          throw new ForbiddenException("Бар выдаёт хостес");
        const season = t.seasonId
          ? await tx.season.findUnique({ where: { id: t.seasonId } })
          : null;
        const config = effectiveConfig(t, {
          ...DEFAULT_RATING_CONFIG,
          ...((season?.ratingConfig as object) ?? {}),
        });
        const catalogue = await tx.clubMenuItem.findMany();
        const bundle = item.isPromo ? parsePromoBundle(item.bundle) : [];
        const grants = bundle.length
          ? bundle
          : [
              {
                kind: item.kind,
                quantity: 1,
                menuItemId: item.id,
                title: item.title,
              },
            ];
        if (
          (actor.role === "dealer" || actor.role === "floor") &&
          bundle.length
        )
          throw new ForbiddenException("Комплекты выдаёт хостес");
        const addonCount = grants
          .filter((g) => g.kind === "addon")
          .reduce((n, g) => n + g.quantity * o.quantity, 0);
        if (addonCount) {
          if (
            clockView(s).index + 1 !== s.config.addonLevel ||
            clockView(s).complete
          )
            fail("Сейчас адон недоступен");
          await assertAddonRoom(
            tx,
            id,
            o.userId,
            addonCount,
            config.addonChips,
          );
        }
        if (grants.some((g) => g.kind === "entry"))
          fail("Вход оформляется и оплачивается отдельно");
        if (grants.some((g) => g.kind === "rebuy") && !rebuyOpen(s))
          fail("Ребаи закрыты");
        const ids: string[] = [];
        const unitCount = grants.reduce(
          (n, g) => n + g.quantity * o.quantity,
          0,
        );
        const totalCost = item.priceRub * o.quantity;
        const unitCost = Math.floor(totalCost / unitCount);
        for (const g of grants) {
          const source = catalogue.find((c) => c.id === g.menuItemId);
          for (let i = 0; i < g.quantity * o.quantity; i++) {
            const p = await tx.payment.create({
              data: {
                tournamentId: id,
                userId: o.userId,
                kind: g.kind,
                amountRub:
                  unitCost + (ids.length === 0 ? totalCost % unitCount : 0),
                deferred: true,
                chips: source?.chips || chipsForKind(g.kind, config),
                note: g.title ?? source?.title ?? item.title,
                createdById: actor.id,
              },
            });
            ids.push(p.id);
          }
        }
        o.paymentIds = ids;
        o.state = "fulfilled";
        o.actorId = actor.id;
        const player = this.player(s, o.userId);
        const purchased = await tx.payment.aggregate({
          where: { id: { in: ids } },
          _sum: { chips: true },
        });
        if (grants.some((g) => g.kind === "rebuy")) {
          player.state = "playing";
          if (player.table === null) assignSeat(s, player);
          await returnToPlay(tx, id, o.userId);
        }
        player.stack += purchased._sum.chips ?? 0;
        player.measuredAt = new Date().toISOString();
        s.alerts.push({
          id: randomUUID(),
          userId: o.userId,
          text: `Выдано: ${o.title} x${o.quantity}. К оплате ${Math.max(0, await dueFor(tx, o.userId, id))} ₽`,
          createdAt: new Date().toISOString(),
          acknowledgedBy: null,
        });
        await this.notify(
          tx,
          o.userId,
          "purchase",
          o.id,
          `${o.title} x${o.quantity}: ${o.priceRub * o.quantity} ₽. К оплате ${Math.max(0, await dueFor(tx, o.userId, id))} ₽.`,
        );
      }
      await this.save(tx, id, s);
      await this.audit(
        tx,
        id,
        actor,
        fulfil ? "order.fulfil" : "order.cancel",
        {
          userId: o.userId,
          orderId: o.id,
          title: o.title,
          quantity: o.quantity,
          amountRub: o.priceRub * o.quantity,
          paymentIds: o.paymentIds,
        },
      );
    });
    return { ok: true };
  }
  async playerLive(userId: string) {
    const rows = await this.db.liveTournament.findMany({
      where: { tournament: { status: { notIn: ["finished", "cancelled"] } } },
      include: { tournament: { select: { title: true } } },
    });
    return rows.flatMap((r) => {
      const s = r.state as unknown as LiveState;
      const p = s.seats.find((p) => p.userId === userId);
      return p
        ? [
            {
              tournamentId: r.tournamentId,
              title: r.tournament.title,
              player: p,
              orders: s.orders.filter((o) => o.userId === userId),
              bounties: s.bounties.filter((b) => b.userId === userId),
              rebuyOpen: rebuyOpen(s),
            },
          ]
        : [];
    });
  }
  async staffList() {
    const users = await this.db.user.findMany({
      where: {
        role: { in: ["dealer", "floor", "hostess", "admin"] },
        status: "active",
      },
      select: { id: true, nickname: true, displayName: true, role: true },
    });
    return users.map((u) => ({
      id: u.id,
      name: formatPlayerName(u.displayName, u.nickname),
      role: u.role,
    }));
  }
  async grantHand(
    id: string,
    actor: RequestUser,
    userId: string,
    achievementId: string,
  ) {
    if (actor.role === "dealer" && actor.dealerTournamentId !== id)
      throw new ForbiddenException("Доступен только ваш вечер");
    await this.locked(id, async (tx, s) => {
      const achievement = await tx.achievement.findUnique({
        where: { id: achievementId },
      });
      if (
        !achievement ||
        achievement.category !== "game" ||
        !achievement.isActive ||
        achievement.rule != null
      )
        fail("Выберите игровую комбинацию");
      if (!s) fail("Вечер не настроен");
      this.access(s, actor, userId);
      const t = await tx.tournament.findUniqueOrThrow({ where: { id } });
      if (t.status === "finished" || t.status === "cancelled")
        fail("Вечер завершён");
    });
    return this.achievements.grant(actor.id, {
      userId,
      achievementId,
      tournamentId: id,
    });
  }
  private async remind() {
    if (this.reminding) return;
    this.reminding = true;
    try {
      const local = new Date(Date.now() + 4 * 3600_000);
      if (local.getUTCHours() < 12) return;
      const day = local.toISOString().slice(0, 10);
      const users = await this.db.payment.findMany({
        where: { deferred: true, voidedAt: null },
        distinct: ["userId"],
        select: { userId: true },
      });
      for (const { userId } of users) {
        const a = await this.account(userId);
        if (a.debtRub > 0)
          await this.db.$transaction((tx) =>
            this.notify(
              tx,
              userId,
              "debt.daily",
              day,
              `К оплате ${a.debtRub} ₽. Откройте «Мой счёт» или обратитесь к хостес. До погашения запись на следующий турнир недоступна.`,
            ),
          );
      }
    } finally {
      this.reminding = false;
    }
  }
}
