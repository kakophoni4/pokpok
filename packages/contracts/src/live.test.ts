import { describe, expect, it } from "vitest";
import { BlindLevel } from "./live.js";
describe("Big Blind Ante", () => {
  it("keeps ante equal to the big blind even when a client submits a different value", () => {
    expect(
      BlindLevel.parse({
        title: "Уровень",
        seconds: 1200,
        small: 500,
        big: 1000,
        ante: 50,
      }).ante,
    ).toBe(1000);
  });
  it("does not charge ante during a break", () => {
    expect(
      BlindLevel.parse({
        title: "Перерыв",
        seconds: 600,
        small: 500,
        big: 1000,
        break: true,
      }).ante,
    ).toBe(0);
  });
});
