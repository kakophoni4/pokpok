import type { TournamentDetail } from "./tournament.js";

/**
 * Running an evening: who is at the table and which places are still free.
 *
 * The bot's game topic and the website's cash desk both need these answers and
 * must never disagree about them, so the arithmetic lives here rather than
 * being written out twice.
 */

/**
 * How many places the evening has to hand out.
 *
 * Whoever paid the entry is playing, but the count has to survive the minutes
 * before the cash desk has caught up: at that point the sign-up list is the
 * only estimate of the field there is. A place already awarded also counts,
 * because a table cannot shrink below the number it has already seated.
 */
export function fieldSize(detail: TournamentDetail): number {
  const paid = (detail.players ?? []).filter((player) =>
    player.payments.some((payment) => payment.kind === "entry"),
  ).length;

  const signedUp = detail.registrations.filter((row) => row.status === "registered").length;
  const awarded = detail.results.reduce((highest, row) => Math.max(highest, row.place), 0);

  return Math.max(paid, signedUp, awarded, 1);
}

/** Places nobody holds yet, deepest first — the order they get handed out in. */
export function freePlaces(detail: TournamentDetail): number[] {
  const taken = new Set(detail.results.map((row) => row.place));
  const places: number[] = [];

  for (let place = fieldSize(detail); place >= 1; place -= 1) {
    if (!taken.has(place)) places.push(place);
  }

  return places;
}

/**
 * What the next player to bust out finishes in: the deepest place still free.
 *
 * Counting down is what a live table does — the first player out of eighteen
 * finishes eighteenth — so the admin taps a button instead of typing a number.
 */
export function nextPlace(detail: TournamentDetail): number {
  return freePlaces(detail)[0] ?? 1;
}

/**
 * How many stacks of this kind sit on a player's tab. A triple add-on is one
 * payment with three stacks, so counting rows would under-report it.
 */
export function stacksOf(
  payments: { kind: string; chips: number }[],
  kind: string,
  stack: number,
): number {
  const rows = payments.filter((payment) => payment.kind === kind);
  if (stack <= 0) return rows.length;
  return rows.reduce((sum, payment) => {
    if (payment.chips <= 0) return sum + 1;
    return sum + Math.max(1, Math.round(payment.chips / stack));
  }, 0);
}
