import { describe, expect, it, vi } from "vitest";
import { assertCreditRoom, creditStatus } from "./credit";
function db(limit: number | null = null, payments = [{ tournamentId: "a", _sum: { amountRub: 2500 } }], receipts: typeof payments = []) {
  return { $queryRaw: vi.fn().mockResolvedValue([]), user: { findUniqueOrThrow: vi.fn().mockResolvedValue({creditLimitRub:limit}) }, clubSettings: { findUnique: vi.fn().mockResolvedValue({defaultCreditLimitRub:3000}) }, payment: {groupBy: vi.fn().mockResolvedValue(payments)}, cashReceipt: {groupBy:vi.fn().mockResolvedValue(receipts)} };
}
describe("player credit limit",()=>{
  it("allows the exact default limit and rejects the next ruble",async()=>{ const tx=db(); await expect(assertCreditRoom(tx as never,"u",500)).resolves.toBeUndefined(); await expect(assertCreditRoom(tx as never,"u",501)).rejects.toMatchObject({response:{code:"CREDIT_LIMIT_EXCEEDED",details:{debtRub:2500,remainingRub:500,limitRub:3000}}}); expect(tx.$queryRaw).toHaveBeenCalledTimes(2); });
  it("sums debt across evenings without using another evening's overpayment",async()=>{ const tx=db(null,[{tournamentId:"a",_sum:{amountRub:2500}},{tournamentId:"b",_sum:{amountRub:1000}}],[{tournamentId:"b",_sum:{amountRub:2000}}]); expect(await creditStatus(tx as never,"u")).toMatchObject({debtRub:2500,remainingRub:500}); });
  it("uses the individual override, including zero",async()=>{ await expect(assertCreditRoom(db(5000) as never,"u",2500)).resolves.toBeUndefined(); await expect(assertCreditRoom(db(0,[]) as never,"u",1)).rejects.toMatchObject({response:{details:{limitRub:0}}}); });
  it("releases room after receiving payment",async()=>{ const tx=db(null,undefined,[{tournamentId:"a",_sum:{amountRub:1000}}]); await expect(assertCreditRoom(tx as never,"u",1500)).resolves.toBeUndefined(); });
  it("allows free prize grants even when existing debt exceeds a lowered limit",async()=>{ const tx=db(0); await expect(assertCreditRoom(tx as never,"u",0)).resolves.toBeUndefined(); expect(tx.$queryRaw).not.toHaveBeenCalled(); });
});
