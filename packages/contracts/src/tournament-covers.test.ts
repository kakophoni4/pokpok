import { describe, expect, it } from "vitest";
import { availableTournamentCovers } from "./tournament-covers.js";

describe("tournament cover cycles", () => {
  it("does not repeat a cover until the entire library is used", () => {
    const previous: number[] = [];
    for (let i = 0; i < 60; i++) {
      const choices = availableTournamentCovers(previous);
      const chosen = choices[(i * 7) % choices.length]!;
      previous.push(chosen);
      const cycle = previous.slice(Math.floor(i / 20) * 20);
      expect(new Set(cycle).size).toBe(cycle.length);
    }
  });
  it("uses remaining covers after an uneven legacy allocation", () => {
    expect(availableTournamentCovers([1, 1, 2, null, 25])).toEqual(Array.from({ length: 18 }, (_, i) => i + 3));
  });
});
