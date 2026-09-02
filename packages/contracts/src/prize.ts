import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";
import { PaymentKind } from "./enums.js";

/**
 * Something a player won and has not spent yet: a free beer, a free rebuy.
 *
 * A prize always points at a till button rather than being free text, because
 * spending one *is* pressing that button — the bar has to know what to pour and
 * the desk has to know how many chips a free rebuy hands out.
 *
 * One row per unit, never a counter. A «тройной ребай» is three of these, so a
 * player can spend one tonight and keep two for next week, and every unit
 * carries its own record of who handed it over and who wrote it off.
 */
export const PlayerPrize = z.object({
  id: Id,
  userId: Id,
  /** Copied from the menu item, so renaming or deleting it keeps history readable. */
  title: z.string(),
  kind: PaymentKind,
  menuItemId: Id.nullable(),
  /** What it was won for, in the granter's words. */
  comment: z.string().nullable(),
  grantedAt: IsoDateTime,
  grantedBy: z.string().nullable(),
  wonAt: z.object({ id: Id, title: z.string() }).nullable(),
  redeemedAt: IsoDateTime.nullable(),
  redeemedBy: z.string().nullable(),
  spentAt: z.object({ id: Id, title: z.string() }).nullable(),
});
export type PlayerPrize = z.infer<typeof PlayerPrize>;

/** Unspent prizes of the same thing, folded into one line for display. */
export const PrizeWalletLine = z.object({
  title: z.string(),
  kind: PaymentKind,
  count: z.number().int().positive(),
});
export type PrizeWalletLine = z.infer<typeof PrizeWalletLine>;

export const PrizeWallet = z.object({
  lines: z.array(PrizeWalletLine),
  /** How many unspent prizes in total, across all lines. */
  total: z.number().int().nonnegative(),
  active: z.array(PlayerPrize),
  /** Already spent, newest first. Capped — this is a reminder, not an archive. */
  history: z.array(PlayerPrize),
});
export type PrizeWallet = z.infer<typeof PrizeWallet>;

/**
 * Awarding a prize. A promo hands out its whole bundle: granting «Тройной
 * ребай» writes three rebuy prizes, exactly as paying for it would.
 */
export const GrantPrizeInput = z.object({
  userId: Id,
  menuItemId: Id,
  quantity: z.number().int().min(1).max(20).default(1),
  comment: z.string().trim().max(200).nullish(),
  /** The evening it was won at, when it was won at one. */
  tournamentId: Id.nullish(),
});
export type GrantPrizeInput = z.infer<typeof GrantPrizeInput>;

/** Spending a prize at the desk. It becomes a normal till line costing nothing. */
export const RedeemPrizeInput = z.object({
  tournamentId: Id,
});
export type RedeemPrizeInput = z.infer<typeof RedeemPrizeInput>;

export function walletLines(prizes: Pick<PlayerPrize, "title" | "kind">[]): PrizeWalletLine[] {
  const byTitle = new Map<string, PrizeWalletLine>();
  for (const prize of prizes) {
    const line = byTitle.get(prize.title);
    if (line) line.count += 1;
    else byTitle.set(prize.title, { title: prize.title, kind: prize.kind, count: 1 });
  }
  return [...byTitle.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

/** "Пиво ×2 · Ребай" — the whole wallet on one line, for the bot and toasts. */
export function walletLabel(lines: PrizeWalletLine[]): string {
  return lines
    .map((line) => (line.count > 1 ? `${line.title} ×${line.count}` : line.title))
    .join(" · ");
}
