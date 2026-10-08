import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";

export async function dueFor(
  db: Prisma.TransactionClient,
  userId: string,
  tournamentId?: string,
): Promise<number> {
  const where = {
    userId,
    ...(tournamentId ? { tournamentId } : {}),
    voidedAt: null,
  };
  const [p, r] = await Promise.all([
    db.payment.aggregate({
      where: { ...where, deferred: true },
      _sum: { amountRub: true },
    }),
    db.cashReceipt.aggregate({ where, _sum: { amountRub: true } }),
  ]);
  return (p._sum.amountRub ?? 0) - (r._sum.amountRub ?? 0);
}
export async function assertNoPastDebt(
  db: Prisma.TransactionClient,
  userId: string,
  currentId: string,
): Promise<void> {
  const rows = await db.payment.groupBy({
    by: ["tournamentId"],
    where: {
      userId,
      deferred: true,
      voidedAt: null,
      tournamentId: { not: currentId },
    },
    _sum: { amountRub: true },
  });
  for (const row of rows) {
    if ((await dueFor(db, userId, row.tournamentId)) > 0)
      throw new ForbiddenException({
        code: "UNPAID_DEBT",
        message: "Сначала оплатите задолженность за предыдущий вечер",
      });
  }
}
