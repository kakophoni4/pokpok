import { describe, expect, it, vi } from "vitest";
import { LiveService } from "./live.service";
import { initialState } from "./live-engine";
import { DEFAULT_LIVE_CONFIG } from "@poker/contracts";

const dealer = { id: "dealer", role: "dealer" as const, nickname: "Dealer", audience: "web" as const, dealerTournamentId: "event", dealerShiftId: "shift", dealerTable: 1 };
function desk() {
  const state = initialState(DEFAULT_LIVE_CONFIG);
  state.tables[0] = { number: 1, open: true, dealerId: "dealer", breakRequested: false };
  state.seats = [{ userId: "player", table: 1, seat: 1, state: "playing", stack: 40000, wantsMove: false, arrivedAt: new Date().toISOString() }];
  const row = { id: "grant", userId: "player", tournamentId: "event", grantedById: "dealer", grantedAt: new Date(), achievement: { title: "Каре", category: "game", rule: null }, ratingEvents: [{ points: 75 }], grantedBy: { displayName: null, nickname: "Dealer" } };
  const tx = { userAchievement: { findUnique: vi.fn().mockResolvedValue(row), findMany: vi.fn().mockResolvedValue([row]) }, tournament: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: "running" }) } };
  const revoke = vi.fn().mockResolvedValue({ ok: true });
  const service = new LiveService({} as never, {} as never, {} as never, { revoke } as never);
  vi.spyOn(service, "locked").mockImplementation(async (_id, work) => work(tx as never, state));
  return { service, row, state, tx, revoke };
}
describe("live hand history and correction", () => {
  it("lists only the player's game grants in this event with actual ledger points", async () => {
    const { service, tx } = desk();
    expect(await service.handHistory("event", dealer, "player")).toEqual([expect.objectContaining({ id: "grant", points: 75, canRevoke: true })]);
    expect(tx.userAchievement.findMany.mock.calls[0]![0].where).toEqual({ tournamentId: "event", userId: "player", achievement: { category: "game" } });
  });
  it("allows own correction and floor correction but rejects another dealer's grant", async () => {
    const { service, row, revoke } = desk();
    await service.revokeHand("event", dealer, "grant");
    expect(revoke).toHaveBeenCalledWith("dealer", "grant");
    row.grantedById = "other";
    await expect(service.revokeHand("event", dealer, "grant")).rejects.toMatchObject({ status: 403 });
    expect(revoke).toHaveBeenCalledTimes(1);
    await service.revokeHand("event", { ...dealer, id: "floor", role: "floor" }, "grant");
    expect(revoke).toHaveBeenCalledWith("floor", "grant");
  });
  it("rejects other events, other tables, non-game awards and completed games", async () => {
    const { service, row, state, tx, revoke } = desk();
    await expect(service.revokeHand("other", dealer, "grant")).rejects.toMatchObject({ status: 403 });
    state.seats[0]!.table = 2;
    await expect(service.revokeHand("event", dealer, "grant")).rejects.toMatchObject({ status: 403 });
    state.seats[0]!.table = 1;
    row.tournamentId = "other";
    await expect(service.revokeHand("event", dealer, "grant")).rejects.toMatchObject({ status: 404 });
    row.tournamentId = "event"; row.achievement.category = "social";
    await expect(service.revokeHand("event", dealer, "grant")).rejects.toMatchObject({ status: 404 });
    row.achievement.category = "game";
    tx.tournament.findUniqueOrThrow.mockResolvedValue({ status: "finished" });
    await expect(service.revokeHand("event", dealer, "grant")).rejects.toMatchObject({ status: 409 });
    expect(revoke).not.toHaveBeenCalled();
  });
});
