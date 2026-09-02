import { ConflictException } from "@nestjs/common";
import { ADDON_MAX_STACKS, stacksOf, type TournamentPlayer } from "@poker/contracts";
import { toPublicUser } from "../users/user.mapper";
import type { Prisma } from "../generated/prisma/client";

/**
 * Rules the desk enforces however a line arrives — paid for in cash, included
 * in a promo, or covered by a prize the player won last week.
 *
 * They live apart from PaymentsService because a prize redemption is the same
 * transaction with the price crossed out, and a rule that only one of the two
 * paths remembered would be a rule the club does not actually have.
 */

type DeskDb = Pick<
  Prisma.TransactionClient,
  "payment" | "user" | "registration" | "result" | "ratingEvent"
>;

/** Nobody buys in twice. */
export async function assertEntryUnpaid(
  db: DeskDb,
  tournamentId: string,
  userId: string,
  nickname: string,
): Promise<void> {
  const alreadyIn = await db.payment.findFirst({
    where: { tournamentId, userId, kind: "entry", voidedAt: null },
    select: { id: true },
  });
  if (alreadyIn) {
    throw new ConflictException({
      code: "ENTRY_ALREADY_PAID",
      message: `${nickname} уже оплатил вход`,
    });
  }
}

export async function assertAddonRoom(
  db: DeskDb,
  tournamentId: string,
  userId: string,
  copies: number,
  addonChips: number,
): Promise<void> {
  const existing = await db.payment.findMany({
    where: { tournamentId, userId, kind: "addon", voidedAt: null },
    select: { kind: true, chips: true },
  });
  const have = stacksOf(existing, "addon", addonChips);
  if (have + copies > ADDON_MAX_STACKS) {
    throw new ConflictException({
      code: "ADDON_LIMIT",
      message: `Адон максимум ×${ADDON_MAX_STACKS}${have > 0 ? ` (уже ${have})` : ""}`,
    });
  }
}

/**
 * A walk-in who never signed up still belongs on the roster: paying the entry
 * fee is what makes somebody a participant.
 */
export async function seatPlayer(db: DeskDb, tournamentId: string, userId: string): Promise<void> {
  await db.registration.upsert({
    where: { tournamentId_userId: { tournamentId, userId } },
    create: { tournamentId, userId, status: "registered", source: "admin" },
    update: { status: "registered", waitlistPosition: null },
  });
}

/** A rebuy puts a busted player back at the table, so their place is no longer. */
export async function returnToPlay(db: DeskDb, tournamentId: string, userId: string): Promise<void> {
  await db.result.deleteMany({ where: { tournamentId, userId } });
}

/** Everything the admin card for one player needs to redraw itself. */
export async function playerView(
  db: DeskDb,
  tournamentId: string,
  userId: string,
): Promise<TournamentPlayer> {
  const [user, payments, result, ratingEvent] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.payment.findMany({
      where: { tournamentId, userId, voidedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    db.result.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      select: { place: true },
    }),
    db.ratingEvent.findFirst({
      where: { tournamentId, userId, sourceType: "tournament_result" },
      select: { points: true },
    }),
  ]);

  return {
    user: toPublicUser(user),
    payments: payments.map((payment) => ({
      id: payment.id,
      kind: payment.kind,
      amountRub: payment.amountRub,
      chips: payment.chips,
      note: payment.note,
      createdAt: payment.createdAt.toISOString(),
    })),
    totalRub: payments.reduce((sum, payment) => sum + payment.amountRub, 0),
    chips: payments.reduce((sum, payment) => sum + payment.chips, 0),
    place: result?.place ?? null,
    ratingPoints: ratingEvent?.points ?? null,
  };
}

export function kindTitle(kind: string): string {
  if (kind === "entry") return "Вход";
  if (kind === "rebuy") return "Ребай";
  if (kind === "addon") return "Адон";
  if (kind === "drink") return "Напиток";
  return "Прочее";
}
