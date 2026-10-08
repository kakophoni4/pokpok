import { ConflictException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";

// A player lock serialises issues across tournaments. Credits in one evening
// do not hide an unpaid bill in another evening (same rule as AccountView).
export async function creditStatus(tx: Prisma.TransactionClient, userId: string) {
  const [user, settings, payments, receipts] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditLimitRub: true } }),
    tx.clubSettings.findUnique({ where: { id: "club" }, select: { defaultCreditLimitRub: true } }),
    tx.payment.groupBy({ by: ["tournamentId"], where: { userId, voidedAt: null, deferred: true }, _sum: { amountRub: true } }),
    tx.cashReceipt.groupBy({ by: ["tournamentId"], where: { userId, voidedAt: null }, _sum: { amountRub: true } }),
  ]);
  const paid = new Map(receipts.map(r => [r.tournamentId, r._sum.amountRub ?? 0]));
  const debtRub = payments.reduce((n,p) => n + Math.max(0,(p._sum.amountRub ?? 0) - (paid.get(p.tournamentId) ?? 0)),0);
  const limitRub = user.creditLimitRub ?? settings?.defaultCreditLimitRub ?? 3000;
  return { debtRub, limitRub, remainingRub: Math.max(0,limitRub-debtRub), individual: user.creditLimitRub !== null };
}
export async function assertCreditRoom(tx: Prisma.TransactionClient, userId: string, amountRub: number) {
  if (amountRub <= 0) return;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
  const c = await creditStatus(tx,userId);
  if (c.debtRub + amountRub > c.limitRub) throw new ConflictException({
    code: "CREDIT_LIMIT_EXCEEDED",
    message: `Лимит долга ${c.limitRub} ₽. Уже в долг: ${c.debtRub} ₽, доступно: ${c.remainingRub} ₽. Примите оплату перед выдачей.`,
    details: c,
  });
}
