import type { RatingConfig } from "@poker/contracts";

/**
 * A tournament may override the stack sizes and the number of paid places; the
 * rest of the formula belongs to the season. Resolving both in one place keeps
 * the cash desk, the bot and the standings from disagreeing about what a
 * particular evening was worth.
 */
export type EffectiveConfig = RatingConfig & {
  paidPlaces: number;
  startingStack: number;
  addonChips: number;
};

type Overrides = {
  paidPlaces: number | null;
  startingStack: number | null;
  addonChips: number | null;
};

export function effectiveConfig(tournament: Overrides, season: RatingConfig): EffectiveConfig {
  return {
    ...season,
    startingStack: tournament.startingStack ?? season.startingStack,
    addonChips: tournament.addonChips ?? season.addonChips,
    paidPlaces: tournament.paidPlaces ?? season.defaultPaidPlaces,
  };
}

/** Chips a payment of this kind hands out under the given settings. */
export function chipsForKind(kind: string, config: EffectiveConfig): number {
  if (kind === "entry" || kind === "rebuy") return config.startingStack;
  if (kind === "addon") return config.addonChips;
  return 0;
}
