import { describe, expect, it } from "vitest";
import { fieldSize, freePlaces, nextPlace, stacksOf } from "./game.js";
import type { TournamentDetail } from "./tournament.js";

function user(id: string) {
  return { id, nickname: id, avatarUrl: null, role: "player" as const };
}

function detail(overrides: {
  signedUp?: string[];
  entriesPaid?: string[];
  places?: [string, number][];
}): TournamentDetail {
  const { signedUp = [], entriesPaid = [], places = [] } = overrides;

  return {
    id: "t1",
    title: "Вечерний турнир",
    status: "running",
    startsAt: "2026-08-28T15:00:00.000Z",
    regOpensAt: null,
    regClosesAt: null,
    capacity: null,
    ratingMultiplier: 1,
    paidPlaces: 9,
    venue: null,
    registeredCount: signedUp.length,
    waitlistCount: 0,
    myRegistration: null,
    description: null,
    seasonId: null,
    startingStack: 40_000,
    addonChips: 80_000,
    chipsInPlay: entriesPaid.length * 40_000,
    ratingPool: 0,
    registrations: signedUp.map((id) => ({
      id: `r-${id}`,
      user: user(id),
      status: "registered" as const,
      source: "web" as const,
      waitlistPosition: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    })),
    results: places.map(([id, place]) => ({ place, user: user(id), ratingPoints: 0 })),
    players: entriesPaid.map((id) => ({
      user: user(id),
      payments: [
        {
          id: `p-${id}`,
          kind: "entry" as const,
          amountRub: 500,
          chips: 40_000,
          note: null,
          createdAt: "2026-08-28T15:10:00.000Z",
        },
      ],
      totalRub: 500,
      chips: 40_000,
      place: places.find(([who]) => who === id)?.[1] ?? null,
      ratingPoints: null,
    })),
    totalRub: entriesPaid.length * 500,
    adminScreens: null,
  };
}

describe("fieldSize", () => {
  it("counts the players who paid to sit down", () => {
    expect(fieldSize(detail({ signedUp: ["a", "b"], entriesPaid: ["a", "b", "c"] }))).toBe(3);
  });

  it("falls back to the sign-up list before the cash desk has caught up", () => {
    // The regression that mattered: with an empty till the field looked empty,
    // so the only place on offer was first — for everybody.
    expect(fieldSize(detail({ signedUp: ["a", "b", "c", "d"] }))).toBe(4);
  });

  it("never shrinks below a place it has already awarded", () => {
    expect(fieldSize(detail({ entriesPaid: ["a"], places: [["a", 12]] }))).toBe(12);
  });

  it("is at least one, even with nobody around", () => {
    expect(fieldSize(detail({}))).toBe(1);
  });
});

describe("nextPlace", () => {
  it("hands out the deepest place first", () => {
    expect(nextPlace(detail({ entriesPaid: ["a", "b", "c"] }))).toBe(3);
  });

  it("walks up the table as players bust", () => {
    const busted = detail({
      entriesPaid: ["a", "b", "c"],
      places: [
        ["c", 3],
        ["b", 2],
      ],
    });
    expect(nextPlace(busted)).toBe(1);
  });

  it("fills a gap left by a correction instead of skipping it", () => {
    const withGap = detail({ entriesPaid: ["a", "b", "c", "d"], places: [["d", 4]] });
    expect(nextPlace(withGap)).toBe(3);
  });

  it("treats a place on the cash-desk row as taken even without a results row", () => {
    const evening = detail({ entriesPaid: ["a", "b", "c"] });
    evening.results = [];
    evening.players = evening.players!.map((player, index) =>
      index === 0 ? { ...player, place: 3 } : player,
    );
    expect(nextPlace(evening)).toBe(2);
  });
});

describe("freePlaces", () => {
  it("lists what is still open, deepest first", () => {
    expect(freePlaces(detail({ entriesPaid: ["a", "b", "c"], places: [["c", 2]] }))).toEqual([
      3, 1,
    ]);
  });

  it("is empty once the whole table is placed", () => {
    const done = detail({
      entriesPaid: ["a", "b"],
      places: [
        ["a", 1],
        ["b", 2],
      ],
    });
    expect(freePlaces(done)).toEqual([]);
  });
});

describe("stacksOf", () => {
  it("counts a triple add-on as three stacks, not one payment", () => {
    expect(
      stacksOf(
        [
          { kind: "addon", chips: 80_000 },
          { kind: "addon", chips: 160_000 },
        ],
        "addon",
        80_000,
      ),
    ).toBe(3);
  });

  it("treats a rebuy the same way as an entry stack", () => {
    expect(stacksOf([{ kind: "rebuy", chips: 120_000 }], "rebuy", 40_000)).toBe(3);
  });
});
