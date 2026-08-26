import type { RatingConfig } from "@poker/contracts";

export { DEFAULT_RATING_CONFIG } from "@poker/contracts";
export type { RatingConfig } from "@poker/contracts";

/**
 * The rating mirrors a prize pool. Every entry and every add-on puts chips on the
 * table; the total divided by `divisor` is what the winner takes, and each paid
 * place below takes a share of the winner's award. Finishing outside the paid
 * places is worth nothing, which is what makes the standings mean something.
 *
 * Nothing here reads the database or the clock: the same numbers in always give
 * the same numbers out, which is what lets a finished tournament be recomputed
 * from its ledger at any time.
 */

/** What first place is worth, before the per-place share is applied. */
export function ratingPool(params: {
  chipsInPlay: number;
  divisor: number;
  multiplier?: number;
}): number {
  const { chipsInPlay, divisor, multiplier = 1 } = params;
  if (divisor <= 0) return 0;
  return (Math.max(0, chipsInPlay) / divisor) * multiplier;
}

/**
 * Fraction of the winner's award that a place receives: 1 for first, exactly
 * `lastPlaceShare` for the last paid place, 0 below it. `shareCurve` above 1
 * bends the curve towards the top places.
 */
export function placeShare(params: {
  place: number;
  paidPlaces: number;
  lastPlaceShare: number;
  shareCurve: number;
}): number {
  const { place, paidPlaces, lastPlaceShare, shareCurve } = params;

  if (place < 1 || place > paidPlaces) return 0;
  // A single paid place cannot have a gradient, and dividing by paidPlaces - 1
  // below would be a division by zero.
  if (paidPlaces === 1) return 1;

  const fromBottom = (paidPlaces - place) / (paidPlaces - 1);
  return lastPlaceShare + (1 - lastPlaceShare) * Math.pow(fromBottom, shareCurve);
}

/** Points a single place earns. Rounded once, at the end. */
export function pointsForPlace(params: {
  place: number;
  paidPlaces: number;
  chipsInPlay: number;
  multiplier?: number;
  config: RatingConfig;
}): number {
  const { place, paidPlaces, chipsInPlay, multiplier = 1, config } = params;

  const pool = ratingPool({ chipsInPlay, divisor: config.divisor, multiplier });
  const share = placeShare({
    place,
    paidPlaces,
    lastPlaceShare: config.lastPlaceShare,
    shareCurve: config.shareCurve,
  });

  return Math.round(pool * share);
}

export type StandingInput = {
  userId: string;
  place: number;
};

export type StandingOutput = StandingInput & {
  points: number;
  /** Kept for display: it explains the number without re-deriving it. */
  share: number;
};

/**
 * Scores a whole tournament. `chipsInPlay` is the sum of the chips every payment
 * handed out, so a table where nobody took an add-on scores lower than the same
 * table where everybody did.
 */
export function scoreTournament(params: {
  standings: StandingInput[];
  chipsInPlay: number;
  paidPlaces: number;
  multiplier?: number;
  config: RatingConfig;
}): StandingOutput[] {
  const { standings, chipsInPlay, paidPlaces, multiplier = 1, config } = params;
  const pool = ratingPool({ chipsInPlay, divisor: config.divisor, multiplier });

  return standings.map((standing) => {
    const share = placeShare({
      place: standing.place,
      paidPlaces,
      lastPlaceShare: config.lastPlaceShare,
      shareCurve: config.shareCurve,
    });

    return { ...standing, share, points: Math.round(pool * share) };
  });
}

export type RatingSource = "tournament_result" | "achievement" | "manual_adjustment" | "penalty";

export type SeasonEvent = {
  /** Only tournament results take part in the "best of N" selection. */
  sourceType: RatingSource;
  points: number;
};

/**
 * Season total. With `bestOfCount` set, only that many of the best tournament
 * results count, so missing a week does not knock somebody out of the race.
 * Achievements, manual corrections and penalties always count in full.
 */
export function seasonTotal(events: SeasonEvent[], config: RatingConfig): number {
  const tournamentPoints: number[] = [];
  let other = 0;

  for (const event of events) {
    if (event.sourceType === "tournament_result") tournamentPoints.push(event.points);
    else other += event.points;
  }

  const counted =
    config.bestOfCount > 0
      ? tournamentPoints.sort((a, b) => b - a).slice(0, config.bestOfCount)
      : tournamentPoints;

  return counted.reduce((sum, points) => sum + points, 0) + other;
}

export type LedgerEvent = SeasonEvent & {
  place?: number | null;
};

export type PlayerSummary = {
  points: number;
  gamesPlayed: number;
  wins: number;
  top3: number;
  /** Finishes that earned rating, i.e. inside the paid places. */
  itm: number;
  avgPlace: number | null;
  bestPlace: number | null;
};

/**
 * Everything the profile and the standings display, derived from ledger rows.
 * Kept here so the API, the seed script and any future report agree by
 * construction instead of by convention.
 */
export function summarizeLedger(events: LedgerEvent[], config: RatingConfig): PlayerSummary {
  const finishes = events.filter(
    (event) => event.sourceType === "tournament_result" && event.place != null,
  );
  const places = finishes.map((event) => event.place as number);

  return {
    points: seasonTotal(events, config),
    gamesPlayed: finishes.length,
    wins: places.filter((place) => place === 1).length,
    top3: places.filter((place) => place <= 3).length,
    // A paid finish is simply one that was worth points; the paid-place count of
    // that particular tournament is already baked into the stored number.
    itm: finishes.filter((event) => event.points > 0).length,
    avgPlace: places.length > 0 ? places.reduce((a, b) => a + b, 0) / places.length : null,
    bestPlace: places.length > 0 ? Math.min(...places) : null,
  };
}
