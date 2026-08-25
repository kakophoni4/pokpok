import type { LeaderboardRow, RegistrationView, TournamentSummary } from "@poker/contracts";
import { describe, expect, it } from "vitest";
import { escapeHtml, formatLeaderboard, formatRoster, formatSchedule, plural } from "./format.js";

function tournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: "t1",
    title: "Weekly Freezeout #16",
    gameType: "nlh",
    status: "reg_open",
    startsAt: "2026-09-01T16:00:00.000Z",
    regOpensAt: null,
    regClosesAt: null,
    capacity: 12,
    ratingMultiplier: 1,
    venue: null,
    registeredCount: 9,
    waitlistCount: 0,
    myRegistration: null,
    ...overrides,
  } as TournamentSummary;
}

function registration(nickname: string, overrides: Partial<RegistrationView> = {}): RegistrationView {
  return {
    id: `r-${nickname}`,
    user: { id: `u-${nickname}`, nickname, avatarUrl: null, role: "player" },
    status: "registered",
    source: "tg_bot",
    waitlistPosition: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  } as RegistrationView;
}

describe("escapeHtml", () => {
  it("neutralises markup so a nickname cannot break the message", () => {
    expect(escapeHtml('<b>Bad</b> & "quoted"')).toBe('&lt;b&gt;Bad&lt;/b&gt; &amp; "quoted"');
  });
});

describe("plural", () => {
  it("picks the right Russian form", () => {
    expect(plural(1, "игра", "игры", "игр")).toBe("игра");
    expect(plural(3, "игра", "игры", "игр")).toBe("игры");
    expect(plural(11, "игра", "игры", "игр")).toBe("игр");
    expect(plural(21, "игра", "игры", "игр")).toBe("игра");
  });
});

describe("formatSchedule", () => {
  it("says so plainly when nothing is scheduled", () => {
    expect(formatSchedule([])).toContain("Пока нет запланированных турниров");
  });

  it("shows seats, waiting list and the rating multiplier", () => {
    const text = formatSchedule([
      tournament({ waitlistCount: 2, ratingMultiplier: 2, registeredCount: 12 }),
    ]);

    expect(text).toContain("12/12 мест");
    expect(text).toContain("+2 в ожидании");
    expect(text).toContain("×2 рейтинг");
  });

  it("marks the tournaments the player already joined", () => {
    const joined = formatSchedule([
      tournament({
        myRegistration: {
          id: "r1",
          status: "registered",
          waitlistPosition: null,
          createdAt: "2026-08-01T10:00:00.000Z",
        },
      }),
    ]);
    expect(joined).toContain("✅ вы записаны");

    const waiting = formatSchedule([
      tournament({
        myRegistration: {
          id: "r2",
          status: "waitlist",
          waitlistPosition: 3,
          createdAt: "2026-08-01T10:00:00.000Z",
        },
      }),
    ]);
    expect(waiting).toContain("🕓 вы в ожидании №3");
  });

  it("does not advertise a cancelled registration as active", () => {
    const text = formatSchedule([
      tournament({
        myRegistration: {
          id: "r3",
          status: "cancelled",
          waitlistPosition: null,
          createdAt: "2026-08-01T10:00:00.000Z",
        },
      }),
    ]);
    expect(text).not.toContain("вы записаны");
  });
});

describe("formatRoster", () => {
  it("numbers the seated players and lists the waiting ones separately", () => {
    const text = formatRoster(tournament(), [
      registration("Ferz", { status: "checked_in" }),
      registration("Kate_AA"),
      registration("Late_Guy", { status: "waitlist", waitlistPosition: 1 }),
    ]);

    expect(text).toContain("Записались (2)");
    expect(text).toContain("1. Ferz ✅");
    expect(text).toContain("2. Kate_AA");
    expect(text).toContain("Лист ожидания");
    expect(text).toContain("1. Late_Guy");
  });

  it("handles an empty field", () => {
    expect(formatRoster(tournament(), [])).toContain("Пока никто не записался");
  });
});

describe("formatLeaderboard", () => {
  const rows: LeaderboardRow[] = Array.from({ length: 20 }, (_, index) => ({
    rank: index + 1,
    user: { id: `u${index + 1}`, nickname: `Player${index + 1}`, avatarUrl: null, role: "player" },
    points: 500 - index * 10,
    gamesPlayed: 6,
    wins: index === 0 ? 2 : 0,
    top3: 1,
    itm: 2,
    avgPlace: 5,
    bestPlace: 1,
  })) as LeaderboardRow[];

  it("medals the podium and cuts the list at fifteen", () => {
    const text = formatLeaderboard(rows);
    expect(text).toContain("🥇 Player1");
    expect(text).toContain("🥉 Player3");
    expect(text).toContain("15. Player15");
    expect(text).not.toContain("Player16");
  });

  it("appends the player's own row when they are outside the top", () => {
    const text = formatLeaderboard(rows, "u18");
    expect(text).toContain("18. Player18");
    expect(text).toContain("← вы");
  });

  it("marks the player inline when they are inside the top", () => {
    const text = formatLeaderboard(rows, "u2");
    expect(text).toContain("Player2 — <b>490</b> (6 игр) ← вы");
    expect(text).not.toContain("…");
  });
});
