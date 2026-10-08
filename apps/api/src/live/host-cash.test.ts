import { describe, expect, it, vi } from "vitest";
import { cashDayReport, clubDay } from "./host-cash";
import { LiveService } from "./live.service";

const purchase = (overrides = {}) => ({ kind: "entry", note: null, amountRub: 1000, deferred: false, method: "cash", prize: null, ...overrides });
describe("host cash day", () => {
  it("changes the club day at UTC+4 midnight", () => {
    expect(clubDay(new Date("2026-10-08T19:59:59Z")).date).toBe("2026-10-08");
    const day = clubDay(new Date("2026-10-08T20:00:00Z"));
    expect(day.date).toBe("2026-10-09");
    expect(day.start.toISOString()).toBe("2026-10-08T20:00:00.000Z");
    expect(day.end.toISOString()).toBe("2026-10-09T20:00:00.000Z");
  });
  it("counts issued units, separates prize issues and never treats debt as received money", () => {
    const report = cashDayReport("2026-10-08", [purchase(), purchase({ method: "terminal" }), purchase({ method: null }), purchase({ kind: "rebuy", deferred: true }), purchase({ kind: "rebuy", deferred: true }), purchase({ kind: "rebuy", amountRub: 0, prize: { id: "prize" } }), purchase({ kind: "other", note: "Кофе", amountRub: 250, deferred: true })], [{ method: "terminal", amountRub: 500 }, { method: "cash", amountRub: 250 }]);
    expect(report).toMatchObject({ cashRub: 1250, terminalRub: 1500, unspecifiedRub: 1000, paidRub: 3750 });
    expect(report.items.find(i => i.kind === "rebuy")).toMatchObject({ quantity: 2, prizeQuantity: 1, chargedRub: 2000 });
    expect(report.items.find(i => i.title === "Кофе")).toMatchObject({ quantity: 1, chargedRub: 250 });
  });
  it("excludes voided records and restricts the report to staff", async () => {
    const tx = { payment: { findMany: vi.fn().mockResolvedValue([]) }, cashReceipt: { findMany: vi.fn().mockResolvedValue([]) } };
    const db = { $transaction: vi.fn(async work => work(tx)) };
    const service = new LiveService(db as never, {} as never, {} as never, {} as never);
    await expect(service.hostCash({ id: "dealer", role: "dealer" } as never)).rejects.toMatchObject({ status: 403 });
    expect(db.$transaction).not.toHaveBeenCalled();
    await service.hostCash({ id: "host", role: "hostess" } as never);
    expect(tx.payment.findMany.mock.calls[0][0].where).toMatchObject({ voidedAt: null, createdAt: { gte: expect.any(Date), lt: expect.any(Date) } });
    expect(tx.cashReceipt.findMany.mock.calls[0][0].where).toEqual(tx.payment.findMany.mock.calls[0][0].where);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
  });
});
