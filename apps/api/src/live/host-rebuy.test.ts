import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LIVE_CONFIG } from "@poker/contracts";
import { LiveService } from "./live.service";
import { LiveController } from "./live.controller";
import { initialState } from "./live-engine";

const dealer = { id: "dealer", role: "dealer" as const, nickname: "Dealer", audience: "web" as const, dealerTournamentId: "event", dealerShiftId: "shift", dealerTable: 1 };
const hostess = { id: "host", role: "hostess" as const, nickname: "Host", audience: "web" as const };
function desk() {
  const state = initialState(DEFAULT_LIVE_CONFIG);
  state.tables[0] = { number: 1, open: true, dealerId: "dealer", breakRequested: false };
  state.seats = [{ userId: "player", table: null, seat: null, lastTable: 1, state: "busted", stack: 0, arrivedAt: new Date().toISOString(), wantsMove: false }];
  state.alerts = [{ id: "bust", userId: "player", kind: "bust", text: "Без стека. К оплате 0 ₽", createdAt: new Date().toISOString(), acknowledgedBy: null }];
  const item = { id: "rebuy", title: "Ребай", kind: "rebuy", isActive: true, priceRub: 1000, chips: 40000 };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({creditLimitRub:null}) },
    clubSettings: { findUnique: vi.fn().mockResolvedValue({defaultCreditLimitRub:3000}) },
    tournament: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: "running", seasonId: null }) },
    clubMenuItem: { findUnique: vi.fn().mockResolvedValue(item), findUniqueOrThrow: vi.fn().mockResolvedValue(item), findMany: vi.fn().mockResolvedValue([item]) },
    payment: { groupBy: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: "payment" }), aggregate: vi.fn(async (input: any) => input._sum.chips ? { _sum: { chips: 80000 } } : { _sum: { amountRub: 2000 } }) },
    cashReceipt: { groupBy: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _sum: { amountRub: 0 } }) },
    result: { deleteMany: vi.fn() },
  };
  const service = new LiveService({} as never, {} as never, {} as never, {} as never);
  vi.spyOn(service, "locked").mockImplementation(async (_id, work) => work(tx as never, state));
  vi.spyOn(service as any, "save").mockResolvedValue(undefined);
  vi.spyOn(service as any, "audit").mockResolvedValue(undefined);
  vi.spyOn(service, "notify").mockResolvedValue(undefined);
  const input = { tournamentId: "event", userId: "player", menuItemId: "rebuy", quantity: 2, requestId: "request" };
  return { state, tx, service, input };
}

describe("hostess issues requested rebuys", () => {
  it("keeps another player's request pending when the first is issued", async () => {
    const { state, service, input } = desk();
    state.seats.push({ ...state.seats[0]!, userId: "other" });
    await service.placeOrder(dealer, input);
    await service.placeOrder(dealer, { ...input, userId: "other", requestId: "other-request" });
    await service.orderAction("event", "request", hostess, true);
    expect(state.orders.filter(order => order.state === "pending")).toEqual([
      expect.objectContaining({ id: "other-request", userId: "other" }),
    ]);
    expect(state.seats.find(player => player.userId === "other")).toMatchObject({ state: "busted", stack: 0 });
  });

  it("creates a pending request without purchases or chips, then issues once through hostess", async () => {
    expect(Reflect.getMetadata("auth:roles", LiveController.prototype.fulfil)).toEqual(["hostess"]);
    const { state, tx, service, input } = desk();
    await service.placeOrder(dealer, input);
    expect(state.orders[0]).toMatchObject({ id: "request", state: "pending", quantity: 2, requestedById: "dealer", table: 1 });
    expect(state.seats[0]).toMatchObject({ state: "busted", stack: 0, table: null });
    expect(tx.payment.create).not.toHaveBeenCalled();
    await expect(service.orderAction("event", "request", dealer, true)).rejects.toMatchObject({ status: 403 });
    await expect(service.orderAction("event", "request", { ...hostess, role: "floor" }, true)).rejects.toMatchObject({ status: 403 });
    expect(tx.payment.create).not.toHaveBeenCalled();
    await service.placeOrder(dealer, input);
    expect(state.orders).toHaveLength(1);
    await expect(service.placeOrder(dealer, { ...input, requestId: "duplicate" })).rejects.toMatchObject({ status: 409 });
    await expect(service.placeOrder(hostess, { ...input, requestId: "duplicate-host" })).rejects.toMatchObject({ status: 409 });
    await service.orderAction("event", "request", hostess, true);
    expect(state.orders[0]).toMatchObject({ state: "fulfilled", actorId: "host" });
    expect(tx.payment.create).toHaveBeenCalledTimes(2);
    expect(tx.payment.create.mock.calls[0]?.[0].data).toMatchObject({ amountRub: 1000, chips: 40000, deferred: true, createdById: "host" });
    expect(state.seats[0]).toMatchObject({ state: "playing", stack: 80000, table: 1 });
    expect(state.alerts[0]?.acknowledgedBy).toBe("host");
    await expect(service.orderAction("event", "request", hostess, true)).rejects.toMatchObject({ status: 409 });
    expect(tx.payment.create).toHaveBeenCalledTimes(2);
  });

  it("cancels a request without issuing chips or billing the player", async () => {
    const { state, tx, service, input } = desk();
    await service.placeOrder(dealer, input);
    await service.orderAction("event", "request", hostess, false);
    expect(state.orders[0]?.state).toBe("cancelled");
    expect(state.seats[0]).toMatchObject({ state: "busted", stack: 0 });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});
