import { describe, expect, it } from "vitest";
import type { Api, TelegramProfile } from "./api.js";
import type { ClubInfo } from "./club.js";
import { setTimezone } from "./format.js";
import { PlayerScreens } from "./player.js";

/**
 * Telegram rejects a whole message when its markup is malformed — the player
 * sees nothing at all, not a badly formatted screen. These tests render every
 * screen against a stubbed API and check what Telegram checks: balanced tags,
 * a length that fits in one message, and buttons within the callback budget.
 */

const ME = "user-me";
const START = "2026-09-04T15:00:00.000Z";

const profile: TelegramProfile = { id: 4242, firstName: "Тимур", lastName: "А." };

function user(id: string, nickname: string) {
  return { id, nickname, displayName: nickname, avatarUrl: null };
}

const tournaments = [
  {
    id: "t1",
    title: "Вечерний турнир #17",
    status: "reg_open",
    startsAt: START,
    regOpensAt: null,
    regClosesAt: null,
    capacity: 16,
    ratingMultiplier: 2,
    paidPlaces: 9,
    minRating: null,
    venue: { id: "v1", title: "Клуб", address: "Самара, ул. Молодогвардейская, 204" },
    registeredCount: 7,
    waitlistCount: 2,
    myRegistration: { id: "r1", status: "registered", waitlistPosition: null, createdAt: START },
  },
  {
    id: "t2",
    title: "Дипстек по воскресеньям <всем>",
    status: "reg_open",
    startsAt: "2026-09-13T15:00:00.000Z",
    regOpensAt: null,
    regClosesAt: null,
    capacity: 8,
    ratingMultiplier: 1,
    paidPlaces: 3,
    minRating: null,
    venue: null,
    registeredCount: 8,
    waitlistCount: 0,
    myRegistration: null,
  },
];

const leaderboard = Array.from({ length: 30 }, (_, index) => ({
  rank: index + 1,
  user: index === 3 ? user(ME, "Тимур А.") : user(`u${index}`, `Игрок ${index + 1}`),
  points: 5000 - index * 137,
  gamesPlayed: 9,
  wins: index === 0 ? 3 : 0,
  top3: 2,
  itm: 5,
  avgPlace: 4.25,
  bestPlace: 1,
}));

const stats = {
  user: user(ME, "Тимур А."),
  seasonId: "s1",
  points: 4452,
  rank: 4,
  gamesPlayed: 9,
  wins: 1,
  top3: 3,
  itm: 5,
  avgPlace: 4.25,
  bestPlace: 1,
  progression: [],
  history: [
    {
      id: "e1",
      createdAt: START,
      points: 1200,
      sourceType: "tournament",
      comment: null,
      tournament: { id: "t0", title: "Вечерний турнир #16", startsAt: START, fieldSize: 12, paidPlaces: 9 },
      place: 3,
      achievement: null,
    },
    {
      id: "e2",
      createdAt: START,
      points: -50,
      sourceType: "manual",
      comment: null,
      tournament: { id: "t0", title: "Штраф <за> опоздание", startsAt: START, fieldSize: 0, paidPlaces: 1 },
      place: null,
      achievement: null,
    },
  ],
};

// Ten seated players spill onto a second page; two more are waiting.
const registrations = Array.from({ length: 12 }, (_, index) => ({
  id: `reg${index}`,
  user: user(`u${index}`, `Игрок ${index + 1}`),
  status: index < 10 ? "registered" : "waitlist",
  source: "web",
  waitlistPosition: index < 10 ? null : index - 9,
  createdAt: START,
}));

const wallet = {
  lines: [
    { title: "Пиво <светлое>", kind: "drink", count: 2 },
    { title: "Ребай", kind: "rebuy", count: 1 },
  ],
  total: 3,
  active: [],
  history: [],
};

const api = {
  session: async () => ({ accessToken: "t", expiresAt: 0, userId: ME, nickname: "Тимур А.", role: "player" }),
  asUser: async (_profile: TelegramProfile, _method: string, path: string) => {
    if (path.startsWith("/tournaments")) return tournaments;
    if (path === "/rating/me") return stats;
    if (path === "/prizes/me") return wallet;
    throw new Error(`unexpected asUser path ${path}`);
  },
  public: async (path: string) => {
    if (path.startsWith("/rating/leaderboard")) return leaderboard;
    if (path.startsWith("/rating/player/")) return stats;
    if (path.endsWith("/registrations")) return registrations;
    if (path.startsWith("/achievements/user/")) {
      return [
        { id: "a1", achievement: { title: "Бэд бит <дня>" }, grantedAt: START },
        { id: "a2", achievement: { title: "Стрит-флеш" }, grantedAt: START },
      ];
    }
    throw new Error(`unexpected public path ${path}`);
  },
} as unknown as Api;

const club = {
  get: async () => ({ infoText: "Играем каждую пятницу.\nВход свободный.", timezone: "Europe/Samara" }),
} as unknown as ClubInfo;

const screens = new PlayerScreens(api, club, "https://club.example/?v=1");

/** The subset of HTML Telegram accepts, checked the way Telegram checks it. */
function tagErrors(html: string): string[] {
  const problems: string[] = [];
  const open: string[] = [];
  for (const [, closing, name] of html.matchAll(/<(\/?)([a-z-]+)[^>]*>/g)) {
    if (!["b", "i", "u", "s", "a", "code", "pre", "blockquote", "tg-spoiler"].includes(name!)) {
      problems.push(`unsupported tag <${name}>`);
      continue;
    }
    if (closing) {
      if (open.pop() !== name) problems.push(`</${name}> does not close the open tag`);
    } else {
      open.push(name!);
    }
  }
  if (open.length > 0) problems.push(`never closed: ${open.join(", ")}`);
  return problems;
}

const ROUTES = ["home", "sched", "rate", "rate:all", "me", "who", "who:t1", "who:t1:1", "info"];

describe("player screens", () => {
  setTimezone("Europe/Samara");

  it.each(ROUTES)("renders %s as markup Telegram will accept", async (route) => {
    const screen = await screens.render(route, profile);

    expect(tagErrors(screen.text)).toEqual([]);
    expect(screen.text.length).toBeLessThan(4096);
    expect(screen.text).not.toMatch(/undefined|NaN|\[object/);
  });

  it.each(ROUTES)("keeps %s inside Telegram's button budget", async (route) => {
    const screen = await screens.render(route, profile);
    const rows = screen.inline_keyboard ?? screen.keyboard.inline_keyboard;

    for (const button of rows.flat()) {
      expect(button.text.length).toBeGreaterThan(0);
      expect(button.text.length).toBeLessThanOrEqual(64);
      if ("callback_data" in button && button.callback_data) {
        expect(Buffer.byteLength(button.callback_data, "utf8")).toBeLessThanOrEqual(64);
      }
    }
  });

  it("escapes a title that would otherwise break the markup", async () => {
    const screen = await screens.render("sched", profile);

    expect(screen.text).toContain("Дипстек по воскресеньям &lt;всем&gt;");
    expect(tagErrors(screen.text)).toEqual([]);
  });

  it("shows the seat bar and the venue on the next game", async () => {
    const screen = await screens.render("home", profile);

    expect(screen.text).toContain("▰");
    expect(screen.text).toContain("Молодогвардейская");
    expect(screen.text).toContain("✓ <b>Вы записаны</b>");
  });

  it("tells the player how far the next place is", async () => {
    const screen = await screens.render("rate", profile);

    // 4th on 4452 points, 3rd on 4589: 137 to climb.
    expect(screen.text).toContain("До 3-го места: 137 очков");
  });

  it("offers the waiting list when the table is full", async () => {
    const screen = await screens.render("sched", profile);
    const labels = screen.keyboard.inline_keyboard.flat().map((button) => button.text);

    expect(labels.some((label) => label.startsWith("✓ Отменить запись"))).toBe(true);
    expect(labels.some((label) => label.startsWith("→ В лист ожидания"))).toBe(true);
  });

  it("pages a long roster without losing anybody", async () => {
    const first = await screens.render("who:t1", profile);
    const second = await screens.render("who:t1:1", profile);

    expect(first.keyboard.inline_keyboard.flat().some((b) => b.text === "Дальше ›")).toBe(true);
    expect(second.keyboard.inline_keyboard.flat().some((b) => b.text === "‹ Раньше")).toBe(true);
    expect(second.text).toContain("Страница 2 из 2");
  });

  it("puts a player's record in the toast over the roster", async () => {
    expect(await screens.playerToast(ME)).toContain("4-е место");
  });

  it("shows unspent prizes where the player will see them first", async () => {
    const home = await screens.render("home", profile);
    const me = await screens.render("me", profile);

    // A prize title is club-entered text, so it goes through the same escaping
    // as a tournament name — a stray bracket must not eat the message.
    expect(home.text).toContain("Пиво &lt;светлое&gt; ×2 · Ребай");
    expect(home.text).toContain("<b>Ваши призы</b> · 3");
    expect(me.text).toContain("Спишем на кассе");
    expect(tagErrors(home.text)).toEqual([]);
    expect(tagErrors(me.text)).toEqual([]);
  });
});
