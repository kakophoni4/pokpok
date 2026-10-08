import { describe, expect, it } from "vitest";
import { handOfDayRanks } from "./hand-of-day";
describe("rank-only hand of day", () => {
  it("accepts numeric, Latin and Cyrillic ranks", () => {
    expect(handOfDayRanks("3 4")).toEqual(["3", "4"]);
    expect(handOfDayRanks("А К")).toEqual(["A", "K"]);
    expect(handOfDayRanks("A K")).toEqual(["A", "K"]);
    expect(handOfDayRanks("10 / Т")).toEqual(["10", "10"]);
  });
  it("shows legacy suited hands without adding or displaying suits", () => {
    expect(handOfDayRanks("A♠ K♥")).toEqual(["A", "K"]);
  });
  it("does not invent ranks for missing or unrecognized text", () => {
    expect(handOfDayRanks(null)).toBeNull();
    expect(handOfDayRanks("Выбирает флор")).toBeNull();
    expect(handOfDayRanks("A")).toBeNull();
  });
});
