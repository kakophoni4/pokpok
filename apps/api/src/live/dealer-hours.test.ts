import { describe, it, expect } from "vitest";
import { DEFAULT_LIVE_CONFIG } from "@poker/contracts";
import { initialState } from "./live-engine";
import { shiftEndElapsed, billableHours } from "./dealer-hours";
describe("dealer shifts", () => {
  it("finishes outgoing shift after break but preserves incoming shift", () => {
    const state = initialState(DEFAULT_LIVE_CONFIG);
    state.config.levels = [
      {
        title: "1",
        seconds: 1200,
        small: 100,
        big: 200,
        ante: 200,
        break: false,
      },
      {
        title: "Перерыв",
        seconds: 600,
        small: 0,
        big: 0,
        ante: 0,
        break: true,
      },
      {
        title: "2",
        seconds: 1200,
        small: 200,
        big: 400,
        ante: 400,
        break: false,
      },
      {
        title: "Перерыв",
        seconds: 600,
        small: 0,
        big: 0,
        ante: 0,
        break: true,
      },
    ];
    expect(shiftEndElapsed(state, 1199)).toBe(1800);
    expect(shiftEndElapsed(state, 1200)).toBe(3600);
    expect(shiftEndElapsed(state, 1800)).toBe(3600);
  });
  it("rounds work hours according to payroll policy", () => {
    expect(billableHours(4900, 30, "nearest")).toBe(1.5);
    expect(billableHours(4900, 60, "down")).toBe(1);
    expect(billableHours(4900, 60, "up")).toBe(2);
    expect(billableHours(0, 30, "up")).toBe(0);
  });
});
