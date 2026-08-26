import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATING_CONFIG,
  placeShare,
  pointsForPlace,
  ratingPool,
  scoreTournament,
  seasonTotal,
  summarizeLedger,
} from "./index.js";

const config = DEFAULT_RATING_CONFIG;

/** Twelve entries, four add-ons — the worked example the club settled on. */
const CHIPS = 12 * 40_000 + 4 * 80_000;

describe("ratingPool", () => {
  it("is the chips on the table divided by the divisor", () => {
    expect(ratingPool({ chipsInPlay: CHIPS, divisor: 200 })).toBe(4000);
  });

  it("scales with the tournament multiplier", () => {
    expect(ratingPool({ chipsInPlay: CHIPS, divisor: 200, multiplier: 2 })).toBe(8000);
  });

  it("grows when players take add-ons", () => {
    const without = ratingPool({ chipsInPlay: 12 * 40_000, divisor: 200 });
    const with4 = ratingPool({ chipsInPlay: CHIPS, divisor: 200 });
    expect(with4).toBeGreaterThan(without);
  });

  it("never returns a negative pool or divides by zero", () => {
    expect(ratingPool({ chipsInPlay: -5, divisor: 200 })).toBe(0);
    expect(ratingPool({ chipsInPlay: CHIPS, divisor: 0 })).toBe(0);
  });
});

describe("placeShare", () => {
  const shares = { lastPlaceShare: 0.1, shareCurve: 2 };

  it("gives first place the whole award", () => {
    expect(placeShare({ place: 1, paidPlaces: 9, ...shares })).toBe(1);
  });

  it("gives the last paid place exactly the configured floor", () => {
    expect(placeShare({ place: 9, paidPlaces: 9, ...shares })).toBeCloseTo(0.1, 10);
  });

  it("pays nothing below the paid places", () => {
    expect(placeShare({ place: 10, paidPlaces: 9, ...shares })).toBe(0);
    expect(placeShare({ place: 28, paidPlaces: 27, ...shares })).toBe(0);
  });

  it("never rises as the place gets worse", () => {
    for (const paidPlaces of [9, 18, 27]) {
      const values = Array.from({ length: paidPlaces }, (_, index) =>
        placeShare({ place: index + 1, paidPlaces, ...shares }),
      );
      const sorted = [...values].sort((a, b) => b - a);
      expect(values).toEqual(sorted);
    }
  });

  it("works when only the winner is paid", () => {
    expect(placeShare({ place: 1, paidPlaces: 1, ...shares })).toBe(1);
    expect(placeShare({ place: 2, paidPlaces: 1, ...shares })).toBe(0);
  });

  it("falls in even steps when the curve is 1", () => {
    const flat = { lastPlaceShare: 0, shareCurve: 1 };
    expect(placeShare({ place: 2, paidPlaces: 3, ...flat })).toBeCloseTo(0.5, 10);
  });

  it("holds the endpoints whatever the curve", () => {
    for (const shareCurve of [0.5, 1, 2, 4]) {
      expect(placeShare({ place: 1, paidPlaces: 18, lastPlaceShare: 0.2, shareCurve })).toBe(1);
      expect(
        placeShare({ place: 18, paidPlaces: 18, lastPlaceShare: 0.2, shareCurve }),
      ).toBeCloseTo(0.2, 10);
    }
  });
});

describe("pointsForPlace", () => {
  it("hands the winner the whole pool", () => {
    expect(pointsForPlace({ place: 1, paidPlaces: 9, chipsInPlay: CHIPS, config })).toBe(4000);
  });

  it("hands the last paid place the floor share of it", () => {
    expect(pointsForPlace({ place: 9, paidPlaces: 9, chipsInPlay: CHIPS, config })).toBe(400);
  });

  it("hands unpaid places nothing", () => {
    expect(pointsForPlace({ place: 10, paidPlaces: 9, chipsInPlay: CHIPS, config })).toBe(0);
  });

  it("reacts to the paid-place count changing mid-game", () => {
    const short = pointsForPlace({ place: 9, paidPlaces: 9, chipsInPlay: CHIPS, config });
    const long = pointsForPlace({ place: 9, paidPlaces: 18, chipsInPlay: CHIPS, config });
    // Ninth of eighteen is a better finish than ninth of nine.
    expect(long).toBeGreaterThan(short);
  });
});

describe("scoreTournament", () => {
  const standings = Array.from({ length: 12 }, (_, index) => ({
    userId: `u${index + 1}`,
    place: index + 1,
  }));

  it("scores every place and explains the share", () => {
    const scored = scoreTournament({ standings, chipsInPlay: CHIPS, paidPlaces: 9, config });

    expect(scored).toHaveLength(12);
    expect(scored[0]).toMatchObject({ userId: "u1", place: 1, points: 4000, share: 1 });
    expect(scored[8]?.points).toBe(400);
    expect(scored[9]?.points).toBe(0);
    expect(scored[11]?.points).toBe(0);
  });

  it("orders points the same way as places", () => {
    const scored = scoreTournament({ standings, chipsInPlay: CHIPS, paidPlaces: 9, config });
    const points = scored.map((row) => row.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });
});

describe("seasonTotal", () => {
  it("sums everything when bestOfCount is 0", () => {
    const events = [
      { sourceType: "tournament_result" as const, points: 100 },
      { sourceType: "tournament_result" as const, points: 50 },
      { sourceType: "achievement" as const, points: 25 },
    ];
    expect(seasonTotal(events, { ...config, bestOfCount: 0 })).toBe(175);
  });

  it("keeps only the best tournament results, but every achievement", () => {
    const events = [
      { sourceType: "tournament_result" as const, points: 100 },
      { sourceType: "tournament_result" as const, points: 80 },
      { sourceType: "tournament_result" as const, points: 10 },
      { sourceType: "achievement" as const, points: 25 },
    ];
    expect(seasonTotal(events, { ...config, bestOfCount: 2 })).toBe(100 + 80 + 25);
  });

  it("subtracts penalties in full", () => {
    const events = [
      { sourceType: "tournament_result" as const, points: 100 },
      { sourceType: "penalty" as const, points: -30 },
    ];
    expect(seasonTotal(events, { ...config, bestOfCount: 1 })).toBe(70);
  });
});

describe("summarizeLedger", () => {
  it("counts wins, podiums and paid finishes", () => {
    const summary = summarizeLedger(
      [
        { sourceType: "tournament_result", points: 4000, place: 1 },
        { sourceType: "tournament_result", points: 900, place: 3 },
        { sourceType: "tournament_result", points: 0, place: 11 },
        { sourceType: "achievement", points: 50 },
      ],
      { ...config, bestOfCount: 0 },
    );

    expect(summary).toMatchObject({
      points: 4950,
      gamesPlayed: 3,
      wins: 1,
      top3: 2,
      itm: 2,
      bestPlace: 1,
    });
    expect(summary.avgPlace).toBeCloseTo(5, 10);
  });

  it("reports nulls rather than zeros for a player who never finished a game", () => {
    const summary = summarizeLedger([{ sourceType: "achievement", points: 10 }], config);
    expect(summary).toMatchObject({ gamesPlayed: 0, avgPlace: null, bestPlace: null, points: 10 });
  });
});
