import type { RatingConfig } from "@poker/contracts";

export { DEFAULT_RATING_CONFIG } from "@poker/contracts";
export type { RatingConfig } from "@poker/contracts";

export type StandingInput = {
  userId: string;
  place: number;
  knockouts?: number | null;
};

export type StandingOutput = StandingInput & {
  points: number;
  isItm: boolean;
};

/**
 * How many places count as "in the money" for a field of this size.
 * Always at least the winner, so a heads-up match still has an ITM zone.
 */
export function itmCutoff(fieldSize: number, itmShare: number): number {
  return Math.max(1, Math.ceil(fieldSize * itmShare));
}

/**
 * Rating awarded for a single finish.
 *
 *   base  = basePoints * sqrt(fieldSize) / place^placeExponent
 *   total = round(multiplier * (base + itmBonus + knockoutBonus))
 *
 * Scaling by sqrt(fieldSize) means beating a big field is worth more than beating
 * a small one, while the place exponent controls how steeply the reward decays.
 * Every finisher is guaranteed `participationPoints` so attendance is never punished.
 */
export function pointsForPlace(params: {
  place: number;
  fieldSize: number;
  multiplier?: number;
  knockouts?: number | null;
  config: RatingConfig;
}): number {
  const { place, fieldSize, multiplier = 1, knockouts = 0, config } = params;

  if (!Number.isInteger(place) || place < 1) {
    throw new RangeError(`place must be a positive integer, got ${place}`);
  }
  if (!Number.isInteger(fieldSize) || fieldSize < 1) {
    throw new RangeError(`fieldSize must be a positive integer, got ${fieldSize}`);
  }
  if (place > fieldSize) {
    throw new RangeError(`place ${place} exceeds fieldSize ${fieldSize}`);
  }

  const base = (config.basePoints * Math.sqrt(fieldSize)) / Math.pow(place, config.placeExponent);
  const itm = place <= itmCutoff(fieldSize, config.itmShare) ? config.itmBonus : 0;
  const ko = config.knockoutPoints * (knockouts ?? 0);

  const total = Math.round(multiplier * (base + itm + ko));
  return Math.max(total, config.participationPoints);
}

/**
 * Scores a whole tournament at once. The field size is derived from the standings
 * themselves, which is why results are always submitted as a complete table.
 */
export function scoreTournament(params: {
  standings: StandingInput[];
  multiplier?: number;
  config: RatingConfig;
}): StandingOutput[] {
  const { standings, multiplier = 1, config } = params;
  const fieldSize = standings.length;
  const cutoff = itmCutoff(fieldSize, config.itmShare);

  return standings.map((entry) => ({
    ...entry,
    isItm: entry.place <= cutoff,
    points: pointsForPlace({
      place: entry.place,
      fieldSize,
      multiplier,
      knockouts: entry.knockouts,
      config,
    }),
  }));
}

export type RatingSource = "tournament_result" | "achievement" | "manual_adjustment" | "penalty";

export type SeasonEvent = {
  /** Only tournament results take part in the "best of N" selection. */
  sourceType: RatingSource;
  points: number;
};

/**
 * Season total. With `bestOfCount > 0` only the player's strongest N tournament
 * results count, so missing a week does not knock somebody out of the race.
 * Achievements, manual corrections and penalties always count in full.
 */
export function seasonTotal(events: SeasonEvent[], config: RatingConfig): number {
  const tournamentPoints: number[] = [];
  let other = 0;

  for (const event of events) {
    if (event.sourceType === "tournament_result") {
      tournamentPoints.push(event.points);
    } else {
      other += event.points;
    }
  }

  const counted =
    config.bestOfCount > 0
      ? tournamentPoints.sort((a, b) => b - a).slice(0, config.bestOfCount)
      : tournamentPoints;

  return counted.reduce((sum, points) => sum + points, 0) + other;
}

export type LedgerEvent = SeasonEvent & {
  place?: number | null;
  fieldSize?: number | null;
};

export type PlayerSummary = {
  points: number;
  gamesPlayed: number;
  wins: number;
  top3: number;
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
    itm: finishes.filter(
      (event) => (event.place as number) <= itmCutoff(event.fieldSize ?? 1, config.itmShare),
    ).length,
    avgPlace: places.length > 0 ? places.reduce((a, b) => a + b, 0) / places.length : null,
    bestPlace: places.length > 0 ? Math.min(...places) : null,
  };
}
