import { describe, expect, it } from "vitest";
import { DEFAULT_RATING_CONFIG, itmCutoff, pointsForPlace, scoreTournament, seasonTotal } from "./index.js";

const config = DEFAULT_RATING_CONFIG;

describe("pointsForPlace", () => {
  it("rewards better places more", () => {
    const scores = [1, 2, 5, 10, 20, 30].map((place) =>
      pointsForPlace({ place, fieldSize: 30, config }),
    );

    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
    expect(scores[0]!).toBeGreaterThan(scores.at(-1)!);
  });

  it("rewards winning a bigger field more", () => {
    const small = pointsForPlace({ place: 1, fieldSize: 8, config });
    const large = pointsForPlace({ place: 1, fieldSize: 64, config });
    expect(large).toBeGreaterThan(small);
  });

  it("never drops below the participation floor", () => {
    const last = pointsForPlace({ place: 200, fieldSize: 200, config });
    expect(last).toBeGreaterThanOrEqual(config.participationPoints);
  });

  it("scales with the tournament multiplier, up to rounding", () => {
    const single = pointsForPlace({ place: 3, fieldSize: 40, multiplier: 1, config });
    const major = pointsForPlace({ place: 3, fieldSize: 40, multiplier: 2, config });
    expect(Math.abs(major - single * 2)).toBeLessThanOrEqual(1);
  });

  it("pays the ITM bonus exactly at the cutoff and not past it", () => {
    const fieldSize = 20;
    const cutoff = itmCutoff(fieldSize, config.itmShare);
    expect(cutoff).toBe(4);

    const inside = pointsForPlace({ place: cutoff, fieldSize, config });
    const outside = pointsForPlace({ place: cutoff + 1, fieldSize, config });
    expect(inside - outside).toBeGreaterThan(config.itmBonus - 1);
  });

  it("rejects impossible standings", () => {
    expect(() => pointsForPlace({ place: 0, fieldSize: 10, config })).toThrow(RangeError);
    expect(() => pointsForPlace({ place: 11, fieldSize: 10, config })).toThrow(RangeError);
    expect(() => pointsForPlace({ place: 1.5, fieldSize: 10, config })).toThrow(RangeError);
  });

  it("is deterministic", () => {
    const args = { place: 7, fieldSize: 33, multiplier: 1.5, config } as const;
    expect(pointsForPlace(args)).toBe(pointsForPlace(args));
  });
});

describe("scoreTournament", () => {
  const standings = Array.from({ length: 12 }, (_, i) => ({ userId: `u${i + 1}`, place: i + 1 }));

  it("scores every participant and derives the field size", () => {
    const scored = scoreTournament({ standings, config });
    expect(scored).toHaveLength(12);
    expect(scored.every((row) => row.points > 0)).toBe(true);
  });

  it("marks the ITM zone", () => {
    const scored = scoreTournament({ standings, config });
    const itmCount = scored.filter((row) => row.isItm).length;
    expect(itmCount).toBe(itmCutoff(12, config.itmShare));
  });

  it("adds knockout points when the club tracks them", () => {
    const withKo = { ...config, knockoutPoints: 5 };
    const [first] = scoreTournament({
      standings: [
        { userId: "a", place: 1, knockouts: 3 },
        { userId: "b", place: 2, knockouts: 0 },
      ],
      config: withKo,
    });
    const [firstNoKo] = scoreTournament({
      standings: [
        { userId: "a", place: 1, knockouts: 0 },
        { userId: "b", place: 2, knockouts: 0 },
      ],
      config: withKo,
    });
    expect(first!.points - firstNoKo!.points).toBe(15);
  });
});

describe("seasonTotal", () => {
  const results = [40, 30, 25, 10, 5].map((points) => ({
    sourceType: "tournament_result" as const,
    points,
  }));

  it("sums everything when bestOfCount is 0", () => {
    expect(seasonTotal(results, { ...config, bestOfCount: 0 })).toBe(110);
  });

  it("keeps only the strongest results when bestOfCount is set", () => {
    expect(seasonTotal(results, { ...config, bestOfCount: 3 })).toBe(95);
  });

  it("always counts achievements and corrections in full", () => {
    const events = [
      ...results,
      { sourceType: "achievement" as const, points: 50 },
      { sourceType: "penalty" as const, points: -10 },
    ];
    expect(seasonTotal(events, { ...config, bestOfCount: 3 })).toBe(95 + 50 - 10);
  });
});
