import { describe, expect, it } from "vitest";
import { DEFAULT_LIVE_CONFIG, type LiveSeat } from "@poker/contracts";
import {
  assignSeat,
  automaticPlaces,
  balanceSuggestions,
  canBreak,
  clockView,
  initialState,
  rebuyOpen,
} from "./live-engine";
const player = (id: string): LiveSeat => ({
  userId: id,
  table: null,
  seat: null,
  state: "playing",
  stack: 40000,
  measuredAt: "2026-10-08T00:00:00Z",
  arrivedAt: "2026-10-08T00:00:00Z",
  wantsMove: false,
});
describe("live tournament invariants", () => {
  it("allocates unique seats evenly and refuses over-capacity", () => {
    const s = initialState({
      ...DEFAULT_LIVE_CONFIG,
      maxTables: 2,
      seatsPerTable: 3,
    });
    s.tables.forEach((t, i) => {
      t.open = true;
      t.dealerId = `d${i}`;
    });
    for (let i = 0; i < 6; i++) {
      const p = player(`p${i}`);
      s.seats.push(p);
      expect(assignSeat(s, p)).toBe(true);
    }
    expect(new Set(s.seats.map((p) => `${p.table}:${p.seat}`)).size).toBe(6);
    const seventh = player("extra");
    s.seats.push(seventh);
    expect(assignSeat(s, seventh)).toBe(false);
    expect(seventh.table).toBeNull();
  });
  it("does not allocate closed or unstaffed tables", () => {
    const s = initialState(DEFAULT_LIVE_CONFIG);
    s.tables[0]!.open = true;
    const p = player("p");
    s.seats.push(p);
    expect(assignSeat(s, p)).toBe(false);
  });
  it("opens a staffed reserve table when the current tables are full", () => {
    const s = initialState({
      ...DEFAULT_LIVE_CONFIG,
      maxTables: 2,
      seatsPerTable: 2,
    });
    s.tables[0]!.open = true;
    s.tables[0]!.dealerId = "d1";
    s.tables[1]!.dealerId = "d2";
    for (let i = 0; i < 3; i++) {
      const p = player(`reserve${i}`);
      s.seats.push(p);
      expect(assignSeat(s, p)).toBe(true);
    }
    expect(s.tables[1]!.open).toBe(true);
    expect(s.seats[2]!.table).toBe(2);
  });
  it("keeps shared clock across restart, pauses exactly and closes rebuy at boundary", () => {
    const s = initialState({ ...DEFAULT_LIVE_CONFIG, rebuyClosesLevel: 1 });
    s.clock = {
      running: true,
      startedAt: "2026-10-08T00:00:00Z",
      elapsedSeconds: 0,
    };
    expect(clockView(s, Date.parse("2026-10-08T00:19:59Z")).remaining).toBe(1);
    expect(rebuyOpen(s, Date.parse("2026-10-08T00:20:00Z"))).toBe(false);
    const saved = JSON.parse(JSON.stringify(s));
    expect(clockView(saved, Date.parse("2026-10-08T00:21:00Z")).remaining).toBe(
      1140,
    );
    s.clock = { running: false, startedAt: null, elapsedSeconds: 120 };
    expect(clockView(s, Date.parse("2026-10-09T00:00:00Z")).remaining).toBe(
      1080,
    );
  });
  it("fills nine seats at the first table before opening the second", () => {
    const s = initialState({ ...DEFAULT_LIVE_CONFIG, maxTables: 2 });
    s.tables.forEach((t, i) => {
      t.open = true;
      t.dealerId = `d${i}`;
    });
    for (let i = 0; i < 10; i++) {
      const p = player(`p${i}`);
      s.seats.push(p);
      assignSeat(s, p);
    }
    expect(s.seats.slice(0, 9).map((p) => p.table)).toEqual(Array(9).fill(1));
    expect(s.seats[9].table).toBe(2);
  });
  it("allows breaking 3x6 into 2x9 but not into 2x8", () => {
    const s = initialState({
      ...DEFAULT_LIVE_CONFIG,
      maxTables: 3,
      seatsPerTable: 9,
    });
    s.tables.forEach((t, i) => {
      t.open = true;
      t.dealerId = `d${i}`;
    });
    for (let i = 0; i < 18; i++) {
      const p = player(`p${i}`);
      s.seats.push(p);
      p.table = Math.floor(i / 6) + 1;
      p.seat = (i % 6) + 1;
    }
    expect(canBreak(s, 1)).toBe(true);
    s.config.seatsPerTable = 8;
    expect(canBreak(s, 1)).toBe(false);
  });
  it("balances seated players, excluding a busted player who can return", () => {
    const s = initialState({ ...DEFAULT_LIVE_CONFIG, maxTables: 2 });
    s.tables.forEach((t, i) => {
      t.open = true;
      t.dealerId = `d${i}`;
    });
    for (let i = 0; i < 12; i++) {
      const p = player(`p${i}`);
      p.table = i < 7 ? 1 : 2;
      p.seat = i < 7 ? i + 1 : i - 6;
      s.seats.push(p);
    }
    const b = player("busted");
    b.state = "busted";
    s.seats.push(b);
    expect(balanceSuggestions(s)).toEqual([
      { from: 1, to: 2, userIds: s.seats.slice(0, 7).map((p) => p.userId) },
    ]);
  });
});

it("assigns only prize places after registration closes", () => {
  const state = initialState(DEFAULT_LIVE_CONFIG);
  state.seats = Array.from({ length: 12 }, (_, index) => ({
    ...player(String(index)),
    state: index < 4 ? ("eliminated" as const) : ("playing" as const),
    eliminatedAt: new Date(index * 1000).toISOString(),
  }));
  expect(automaticPlaces(state, 9)).toEqual([]);
  state.clock.elapsedSeconds = state.config.levels
    .slice(0, state.config.registrationClosesLevel)
    .reduce((sum, l) => sum + l.seconds, 0);
  expect(automaticPlaces(state, 9)).toEqual([{ userId: "3", place: 9 }]);
});
