import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LIVE_CONFIG } from "@poker/contracts";
import { LiveService } from "./live.service";
import { initialState } from "./live-engine";

describe("dealer signal for hostess", () => {
  it.each([false, true])("keeps the source table and seat when removing a player, final=%s", async final => {
    const service = new LiveService({} as never, {} as never, {} as never, {} as never);
    const state = initialState(DEFAULT_LIVE_CONFIG);
    state.tables[0] = { number: 1, open: true, dealerId: "dealer", breakRequested: false };
    state.seats = [1, 2, 3, 4].map(n => ({ userId: `p${n}`, table: 1, seat: n, state: "playing" as const, stack: 40000, arrivedAt: new Date().toISOString(), wantsMove: false }));
    const tx = { tournament: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: "running", paidPlaces: 3 }) }, payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountRub: 1000 } }) }, cashReceipt: { aggregate: vi.fn().mockResolvedValue({ _sum: { amountRub: 750 } }) }, result: { findUnique: vi.fn().mockResolvedValue({ id: "existing" }) } };
    vi.spyOn(service, "locked").mockImplementation(async (_id, work) => work(tx as never, state));
    vi.spyOn(service as any, "save").mockResolvedValue(undefined);
    vi.spyOn(service as any, "audit").mockResolvedValue(undefined);
    vi.spyOn(service, "view").mockResolvedValue({ state } as never);
    const notify = vi.spyOn(service, "notify").mockResolvedValue(undefined);
    await service.action("event", { id: "dealer", role: "dealer", nickname: "Dealer", audience: "web", dealerTournamentId: "event", dealerShiftId: "shift", dealerTable: 1 }, { type: "bust", userId: "p1", final });
    expect(state.seats[0]).toMatchObject({ table: null, seat: null, stack: 0, state: final ? "eliminated" : "busted" });
    expect(state.alerts[0]).toMatchObject({ kind: "bust", table: 1, seat: 1, userId: "p1", acknowledgedBy: null, text: `${final ? "Завершил игру" : "Без стека"}. К оплате 250 ₽` });
    expect(notify.mock.calls[0]?.[1]).toBe("p1");
    expect(notify.mock.calls[0]?.[2]).toBe("player.busted");
  });
});
