import { Injectable } from "@nestjs/common";
import { formatPlayerName, type ClubOverview, type LiveState } from "@poker/contracts";
import { PrismaService } from "../common/prisma/prisma.service";
import { cashDayReport, clubDay } from "../live/host-cash";

@Injectable()
export class OverviewService {
  constructor(private readonly db: PrismaService) {}
  async get(): Promise<ClubOverview> {
    const day = clubDay();
    return this.db.$transaction(async tx => {
      const where = { createdAt: { gte: day.start, lt: day.end }, voidedAt: null };
      const [settings, purchases, receipts, unpaid, paid, users, events] = await Promise.all([
        tx.clubSettings.findUnique({ where: { id: "club" } }),
        tx.payment.findMany({ where, select: { kind: true, note: true, amountRub: true, deferred: true, method: true, prize: { select: { id: true } } } }),
        tx.cashReceipt.findMany({ where, select: { amountRub: true, method: true } }),
        tx.payment.groupBy({ by: ["userId", "tournamentId"], where: { voidedAt: null, deferred: true }, _sum: { amountRub: true } }),
        tx.cashReceipt.groupBy({ by: ["userId", "tournamentId"], where: { voidedAt: null }, _sum: { amountRub: true } }),
        tx.user.findMany({ select: { id: true, nickname: true, displayName: true, role: true, status: true, creditLimitRub: true } }),
        tx.tournament.findMany({ where: { status: { in: ["running", "announced", "reg_open", "reg_closed"] } }, orderBy: { startsAt: "asc" }, include: { live: true, _count: { select: { registrations: { where: { status: { not: "cancelled" } } } } } } }),
      ]);
      const defaultCreditLimitRub = settings?.defaultCreditLimitRub ?? 3000;
      const names = new Map(users.map(u => [u.id, u]));
      const receiptMap = new Map(paid.map(p => [JSON.stringify([p.userId,p.tournamentId]),p._sum.amountRub ?? 0]));
      const debt = new Map<string,number>();
      for (const p of unpaid) {
        const due = Math.max(0,(p._sum.amountRub ?? 0) - (receiptMap.get(JSON.stringify([p.userId,p.tournamentId])) ?? 0));
        if (due) debt.set(p.userId,(debt.get(p.userId) ?? 0)+due);
      }
      const debtors = [...debt].map(([userId,debtRub]) => {
        const u = names.get(userId)!;
        return { userId, name: formatPlayerName(u.displayName,u.nickname), debtRub, limitRub: u.creditLimitRub ?? defaultCreditLimitRub, individual: u.creditLimitRub !== null };
      }).sort((a,b) => b.debtRub-a.debtRub);
      const requests: ClubOverview["requests"] = [];
      const eventViews = events.map(t => {
        const s = t.live?.state as LiveState | undefined;
        const pending = s?.orders.filter(o => o.state === "pending") ?? [];
        for (const o of pending) requests.push({ id: o.id, tournamentId: t.id, player: names.has(o.userId) ? formatPlayerName(names.get(o.userId)!.displayName,names.get(o.userId)!.nickname) : "Игрок", title: o.title, quantity: o.quantity, amountRub: o.priceRub*o.quantity, table: o.table ?? null });
        return { id: t.id, title: t.title, startsAt: t.startsAt.toISOString(), status: t.status, registered: t._count.registrations, inPlay: s?.seats.filter(p=>p.state === "playing").length ?? 0, tables: s?.tables.filter(t=>t.open).length ?? 0, paused: !s?.clock.running, configured: !!s, pending: pending.length };
      });
      return { at: new Date().toISOString(), defaultCreditLimitRub, cash: cashDayReport(day.date,purchases,receipts), players: users.filter(u=>u.role === "player").length, staff: users.filter(u=>u.role !== "player" && u.status === "active").length, debtRub: debtors.reduce((n,d)=>n+d.debtRub,0), debtors, events: eventViews, requests };
    }, { isolationLevel: "RepeatableRead" });
  }
}
