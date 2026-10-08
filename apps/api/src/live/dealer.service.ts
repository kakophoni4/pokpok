import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import type { LiveState } from "@poker/contracts";
import { PrismaService } from "../common/prisma/prisma.service";
import { clockView, assignSeat } from "./live-engine";
import { shiftEndElapsed, billableHours } from "./dealer-hours";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
@Injectable()
export class DealerService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private checking = false;
  onModuleInit() {
    this.timer = setInterval(() => void this.expire(), 10000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async expire() {
    if (this.checking) return;
    this.checking = true;
    try {
      const rows = await this.db.dealerShift.findMany({
        where: { endedAt: null },
        take: 1000,
      });
      for (const row of rows) {
        try {
          await this.session(row.id);
        } catch {}
      }
    } catch {
    } finally {
      this.checking = false;
    }
  }
  constructor(
    private readonly db: PrismaService,
    private readonly jwt: JwtService,
  ) {}
  async password(actorId: string, userId: string, password: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (user?.role !== "dealer") throw new ConflictException("Выберите дилера");
    const salt = randomBytes(16).toString("hex");
    const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      await tx.dealerCredential.upsert({
        where: { userId },
        create: { userId, passwordHash },
        update: { passwordHash },
      });
      await tx.dealerShift.updateMany({
        where: { userId, endedAt: null },
        data: { endedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "dealer.password.reset",
          entity: "user",
          entityId: userId,
        },
      });
    });
    return { ok: true };
  }
  async pair(actorId: string, tournamentId: string, tableNumber: number) {
    const live = await this.db.liveTournament.findUnique({
      where: { tournamentId },
    });
    const state = live?.state as unknown as LiveState | undefined;
    if (!state?.tables.some((table) => table.number === tableNumber))
      throw new ConflictException("Стол не найден");
    const token = randomBytes(32).toString("hex");
    await this.db.$transaction(async (tx) => {
      await tx.dealerTablet.create({
        data: { tournamentId, tableNumber, tokenHash: hash(token) },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "dealer.tablet.pair",
          entity: "tournament",
          entityId: tournamentId,
          after: { tableNumber },
        },
      });
    });
    return { path: `/dealer?device=${token}` };
  }
  async tablet(token: string) {
    const tablet = await this.db.dealerTablet.findUnique({
      where: { tokenHash: hash(token) },
    });
    if (!tablet) throw new UnauthorizedException("Планшет не подключён");
    return tablet;
  }
  async login(device: string, nickname: string, password: string) {
    const tablet = await this.tablet(device);
    const users = await this.db.user.findMany({
      where: {
        nickname: { equals: nickname, mode: "insensitive" },
        role: "dealer",
        status: "active",
      },
      take: 2,
    });
    const user = users.length === 1 ? users[0] : null;
    const credential = user
      ? await this.db.dealerCredential.findUnique({
          where: { userId: user.id },
        })
      : null;
    const [salt, digest] = (
      credential?.passwordHash ?? "0000000000000000:" + "00".repeat(64)
    ).split(":");
    const actual = scryptSync(password, salt!, 64);
    if (
      !user ||
      !credential ||
      !timingSafeEqual(actual, Buffer.from(digest!, "hex"))
    )
      throw new UnauthorizedException("Неверный ник или пароль");
    const shift = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const currentCredential = await tx.dealerCredential.findUnique({
        where: { userId: user.id },
      });
      if (currentCredential?.passwordHash !== credential.passwordHash)
        throw new UnauthorizedException("Пароль изменён");
      const conflicting = await tx.dealerShift.findFirst({
        where: {
          userId: user.id,
          endedAt: null,
          tournamentId: { not: tablet.tournamentId },
        },
      });
      if (conflicting)
        throw new ConflictException("Сначала завершите предыдущую смену");
      await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id=${tablet.tournamentId} FOR UPDATE`;
      const live = await tx.liveTournament.findUniqueOrThrow({
        where: { tournamentId: tablet.tournamentId },
      });
      const tournament = await tx.tournament.findUniqueOrThrow({
        where: { id: tablet.tournamentId },
      });
      if (["finished", "cancelled"].includes(tournament.status))
        throw new ConflictException("Вечер завершён");
      const state = live.state as unknown as LiveState;
      const table = state.tables.find(
        (row) => row.number === tablet.tableNumber,
      );
      if (!table) throw new ConflictException("Стол не найден");
      const now = new Date();
      await tx.dealerShift.updateMany({
        where: {
          endedAt: null,
          OR: [
            { userId: user.id },
            {
              tournamentId: tablet.tournamentId,
              tableNumber: tablet.tableNumber,
            },
          ],
        },
        data: { endedAt: now },
      });
      for (const old of state.tables)
        if (old.dealerId === user.id) old.dealerId = null;
      table.dealerId = user.id;
      table.open = true;
      for (const seat of state.seats.filter(
        (seat) => seat.state === "playing" && seat.table === null,
      ))
        assignSeat(state, seat);
      await tx.liveTournament.update({
        where: { tournamentId: tablet.tournamentId },
        data: { state: state as never },
      });
      const settings = await tx.clubSettings.findUnique({
        where: { id: "club" },
      });
      const policy = (settings?.dealerPayroll ?? {}) as {
        stepMinutes?: number;
        mode?: string;
      };
      const created = await tx.dealerShift.create({
        data: {
          userId: user.id,
          tabletId: tablet.id,
          tournamentId: tablet.tournamentId,
          tableNumber: tablet.tableNumber,
          endElapsed: shiftEndElapsed(state, clockView(state).elapsed),
          roundingMinutes: policy.stepMinutes ?? 30,
          roundingMode: policy.mode ?? "nearest",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "dealer.shift.start",
          entity: "tournament",
          entityId: tablet.tournamentId,
          after: { tableNumber: tablet.tableNumber, shiftId: created.id },
        },
      });
      return created;
    });
    return this.session(shift.id);
  }
  async session(id: string) {
    const shift = await this.db.dealerShift.findUnique({ where: { id } });
    if (!shift || shift.endedAt)
      throw new UnauthorizedException("Смена завершена");
    const [live, user, tournament] = await Promise.all([
      this.db.liveTournament.findUnique({
        where: { tournamentId: shift.tournamentId },
      }),
      this.db.user.findUnique({ where: { id: shift.userId } }),
      this.db.tournament.findUnique({ where: { id: shift.tournamentId } }),
    ]);
    const state = live?.state as unknown as LiveState | undefined;
    if (!state || !user || user.role !== "dealer" || user.status !== "active")
      throw new UnauthorizedException();
    const clock = clockView(state);
    if (
      (shift.endElapsed !== null && clock.elapsed >= shift.endElapsed) ||
      Date.now() - shift.startedAt.getTime() >= 12 * 3600000 ||
      ["finished", "cancelled"].includes(tournament?.status ?? "") ||
      !state.tables.some(
        (t) =>
          t.number === shift.tableNumber && t.dealerId === user.id && t.open,
      )
    ) {
      await this.close(id);
      throw new UnauthorizedException("Смена завершена");
    }
    await this.db.dealerShift.update({
      where: { id },
      data: { lastSeenAt: new Date() },
    });
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        role: "dealer",
        nickname: user.nickname,
        aud: "web",
        dealerShiftId: id,
        dealerTable: shift.tableNumber,
        dealerTournamentId: shift.tournamentId,
      },
      { expiresIn: 900 },
    );
    return {
      accessToken,
      shiftId: id,
      userId: user.id,
      nickname: user.nickname,
      tournamentId: shift.tournamentId,
      table: shift.tableNumber,
      breakStarted: clock.level.break,
      expiresIn: 900,
    };
  }
  async close(id: string) {
    const shift = await this.db.dealerShift.findUnique({ where: { id } });
    if (!shift || shift.endedAt) return { ok: true };
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id=${shift.tournamentId} FOR UPDATE`;
      const changed = await tx.dealerShift.updateMany({
        where: { id, endedAt: null },
        data: { endedAt: new Date() },
      });
      if (!changed.count) return;
      const live = await tx.liveTournament.findUnique({
        where: { tournamentId: shift.tournamentId },
      });
      if (live) {
        const state = live.state as unknown as LiveState;
        const table = state.tables.find((t) => t.number === shift.tableNumber);
        if (table?.dealerId === shift.userId) table.dealerId = null;
        await tx.liveTournament.update({
          where: { tournamentId: shift.tournamentId },
          data: { state: state as never },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: shift.userId,
          action: "dealer.shift.end",
          entity: "tournament",
          entityId: shift.tournamentId,
          after: { shiftId: id, tableNumber: shift.tableNumber },
        },
      });
    });
    return { ok: true };
  }
  async payroll(from: string, to: string) {
    const rows = await this.db.dealerShift.findMany({
      where: { startedAt: { gte: new Date(from), lt: new Date(to) } },
      orderBy: { startedAt: "desc" },
      take: 5000,
    });
    const users = await this.db.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.userId))] } },
      select: { id: true, nickname: true },
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      nickname:
        users.find((user) => user.id === row.userId)?.nickname ?? "Дилер",
      tournamentId: row.tournamentId,
      hours: billableHours(
        ((row.endedAt ?? row.lastSeenAt).getTime() - row.startedAt.getTime()) /
          1000,
        row.roundingMinutes,
        row.roundingMode as "nearest" | "up" | "down",
      ),
      active: !row.endedAt,
    }));
  }
}
