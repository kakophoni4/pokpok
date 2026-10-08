import { describe, expect, it } from "vitest";
import type { LiveView } from "@poker/contracts";
import { DEFAULT_LIVE_CONFIG } from "@poker/contracts";
import {
  DisplayCueTracker,
  projectDisplayClock,
  type DisplayClock,
} from "./display-clock";
const levels = [
  {
    title: "Уровень 1",
    seconds: 120,
    small: 100,
    big: 200,
    ante: 200,
    break: false,
  },
  { title: "Перерыв", seconds: 60, small: 0, big: 0, ante: 0, break: true },
  {
    title: "Уровень 2",
    seconds: 120,
    small: 200,
    big: 400,
    ante: 400,
    break: false,
  },
];
function view(elapsed = 0, running = true): LiveView {
  return {
    id: "t1",
    title: "Вечер",
    status: "running",
    serverTime: "2026-10-08T12:00:00Z",
    state: {
      config: { ...DEFAULT_LIVE_CONFIG, levels },
      clock: { running, elapsedSeconds: elapsed, startedAt: null },
      seats: [],
      tables: [],
      orders: [],
      bounties: [],
      alerts: [],
    },
    clock: {
      index: 0,
      level: levels[0]!,
      next: levels[1]!,
      remaining: 120 - elapsed,
      elapsed,
      complete: false,
    },
    players: [],
    balances: [],
    leaderboard: [],
  };
}
function sample(elapsed: number, running = true): DisplayClock {
  return projectDisplayClock(view(elapsed, running), 1000, 1000)!;
}
describe("TV projection", () => {
  it("advances into a break between responses", () => {
    const c = projectDisplayClock(view(119), 3000, 1000)!;
    expect(c.index).toBe(1);
    expect(c.remaining).toBe(59);
    expect(c.level.break).toBe(true);
  });
  it("uses receipt time instead of a possibly incorrect device timezone", () => {
    expect(
      projectDisplayClock(view(30), 1000000001000, 1000000000000)?.remaining,
    ).toBe(89);
  });
  it("does not advance a paused timer", () => {
    expect(projectDisplayClock(view(30, false), 9000, 1000)?.remaining).toBe(
      90,
    );
  });
  it("keeps a completed structure at zero", () => {
    expect(sample(320)).toMatchObject({
      remaining: 0,
      complete: true,
      index: 2,
    });
  });
  it("calculates time to break and no future break", () => {
    expect(sample(30).untilBreak).toBe(90);
    expect(sample(190).untilBreak).toBeNull();
  });
});
describe("TV audio events", () => {
  it("does not replay a level transition after a poll corrects the clock backwards", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(119), 1000, true);
    expect(t.observe(sample(120), 2000, true)).toBe("break");
    expect(t.observe(sample(119), 2100, true)).toBeNull();
    expect(t.observe(sample(120), 3000, true)).toBeNull();
  });
  it("is silent on initial load in the last ten seconds", () => {
    expect(new DisplayCueTracker().observe(sample(115), 1000, true)).toBeNull();
  });
  it("warns at a crossed minute threshold only once, despite poll correction", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(59), 1000, true);
    expect(t.observe(sample(60), 2000, true)).toBe("minute");
    expect(t.observe(sample(60), 2100, true)).toBeNull();
    t.observe(sample(59), 2200, true);
    expect(t.observe(sample(60), 2300, true)).toBeNull();
  });
  it("warns at ten seconds", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(109), 1000, true);
    expect(t.observe(sample(110), 2000, true)).toBe("ten");
  });
  it("announces a break once across the subsequent poll", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(119), 1000, true);
    expect(t.observe(sample(120), 2000, true)).toBe("break");
    expect(t.observe(sample(120), 2100, true)).toBeNull();
  });
  it("announces resumed play after a break", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(179), 1000, true);
    expect(t.observe(sample(180), 2000, true)).toBe("level");
  });
  it("announces pause and resume without a spurious warning", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(59), 1000, true);
    expect(t.observe(sample(60, false), 2000, true)).toBe("pause");
    expect(t.observe(sample(60, false), 3000, true)).toBeNull();
    expect(t.observe(sample(60), 4000, true)).toBe("resume");
  });
  it("does not replay events after an outage", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(119), 1000, true);
    expect(t.observe(sample(120), 2000, false)).toBeNull();
    expect(t.observe(sample(130), 13000, true)).toBeNull();
  });
  it("does not replay events after a suspended browser tab", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(50), 1000, true);
    expect(t.observe(sample(115), 67000, true)).toBeNull();
  });
  it("does not warn when duration is edited or rewound", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(30), 1000, true);
    expect(
      t.observe(
        { ...sample(65), level: { ...levels[0]!, seconds: 100 } },
        2000,
        true,
      ),
    ).toBeNull();
    expect(t.observe(sample(10), 3000, true)).toBeNull();
  });
  it("does not announce a change when opening another tournament", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(20), 1000, true);
    expect(t.observe({ ...sample(140), id: "t2" }, 2000, true)).toBeNull();
  });
  it("announces completion once", () => {
    const t = new DisplayCueTracker();
    t.observe(sample(299), 1000, true);
    expect(t.observe(sample(300), 2000, true)).toBe("complete");
    expect(t.observe(sample(301), 3000, true)).toBeNull();
  });
});
