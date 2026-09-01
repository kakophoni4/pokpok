import { describe, expect, it } from "vitest";
import {
  clubClock,
  clubDate,
  clubGreeting,
  clubMoment,
  clubWhen,
  escapeHtml,
  fit,
  gauge,
  isToday,
  num,
  plural,
  points,
  quote,
  rankMark,
  rub,
  setTimezone,
} from "./format.js";

/** 19:00 in Samara, which is 15:00 UTC — the club plays at UTC+4 all year. */
const GAME_START = "2026-08-25T15:00:00.000Z";

describe("club clock", () => {
  it("renders the hour the game starts in Samara, not on the reader's device", () => {
    expect(clubClock(GAME_START)).toBe("19:00");
  });

  it("keeps rendering Samara time whatever the process timezone is", () => {
    // The bot may run on a server set to UTC; the club still plays at 19:00.
    expect(clubClock("2026-01-10T15:00:00.000Z")).toBe("19:00");
  });

  it("names the date and the weekday", () => {
    expect(clubDate(GAME_START)).toContain("август");
  });

  it("packs date and time into one button-sized string", () => {
    expect(clubWhen(GAME_START)).toContain("19:00");
    expect(clubWhen(GAME_START).length).toBeLessThan(24);
  });

  it("falls back to the club timezone when handed nonsense", () => {
    setTimezone("Mars/Olympus");
    expect(clubClock(GAME_START)).toBe("19:00");
  });

  it("switches when the club really does move", () => {
    setTimezone("UTC");
    expect(clubClock(GAME_START)).toBe("15:00");
    setTimezone("Europe/Samara");
    expect(clubClock(GAME_START)).toBe("19:00");
  });

  it("knows what today means in the club's timezone", () => {
    expect(isToday(new Date().toISOString())).toBe(true);
    expect(isToday("2020-01-01T00:00:00.000Z")).toBe(false);
  });
});

describe("clubMoment", () => {
  // Fixed point of reference: Friday 4 September 2026, 19:00 in Samara.
  const friday = "2026-09-04T15:00:00.000Z";
  const at = (iso: string) => new Date(iso);

  it("says today and tomorrow instead of a date", () => {
    expect(clubMoment(friday, at("2026-09-04T09:00:00.000Z"))).toBe("сегодня в 19:00");
    expect(clubMoment(friday, at("2026-09-03T09:00:00.000Z"))).toBe("завтра в 19:00");
    expect(clubMoment("2026-09-03T15:00:00.000Z", at("2026-09-04T09:00:00.000Z"))).toBe(
      "вчера в 19:00",
    );
  });

  it("names the weekday within the coming week, in the accusative", () => {
    expect(clubMoment(friday, at("2026-09-01T09:00:00.000Z"))).toBe("в пятницу, 19:00");
    expect(clubMoment("2026-09-02T15:00:00.000Z", at("2026-08-31T09:00:00.000Z"))).toBe(
      "в среду, 19:00",
    );
  });

  it("falls back to the date once there is more than one such weekday left", () => {
    expect(clubMoment(friday, at("2026-08-20T09:00:00.000Z"))).toBe("4 сентября, 19:00");
  });

  it("uses the club's day boundary, not the reader's", () => {
    // 22:00 UTC on the 3rd is already the 4th in Samara.
    expect(clubMoment(friday, at("2026-09-03T21:00:00.000Z"))).toBe("сегодня в 19:00");
  });
});

describe("layout", () => {
  it("draws seats as a bar", () => {
    expect(gauge(0, 16)).toBe("▱▱▱▱▱▱▱▱▱▱");
    expect(gauge(8, 16)).toBe("▰▰▰▰▰▱▱▱▱▱");
    expect(gauge(16, 16)).toBe("▰▰▰▰▰▰▰▰▰▰");
  });

  it("shows a single sign-up and never rounds a full table down", () => {
    expect(gauge(1, 40)).toBe("▰▱▱▱▱▱▱▱▱▱");
    expect(gauge(19, 20)).toBe("▰▰▰▰▰▰▰▰▰▱");
  });

  it("drops the lines a screen decided not to show", () => {
    expect(quote(["раз", null, false, "", "два"])).toBe("<blockquote>раз\nдва</blockquote>");
  });
});

describe("numbers", () => {
  it("groups thousands so a chip count stays readable", () => {
    expect(num(800_000)).toBe("800 000");
    expect(num(1_234_567)).toBe("1 234 567");
    expect(num(999)).toBe("999");
  });

  it("formats money with the sign", () => {
    expect(rub(7400)).toBe("7 400 ₽");
  });

  it("declines the Russian word for points", () => {
    expect(points(1)).toBe("1 очко");
    expect(points(3)).toBe("3 очка");
    expect(points(11)).toBe("11 очков");
    expect(points(4000)).toBe("4 000 очков");
  });

  it("handles the teens, where Russian plurals go wrong most often", () => {
    expect(plural(12, "турнир", "турнира", "турниров")).toBe("турниров");
    expect(plural(22, "турнир", "турнира", "турниров")).toBe("турнира");
    expect(plural(21, "турнир", "турнира", "турниров")).toBe("турнир");
  });
});

describe("text safety", () => {
  it("escapes what would otherwise break the HTML markup", () => {
    expect(escapeHtml('<b>&"')).toBe("&lt;b&gt;&amp;&quot;");
  });

  it("trims labels to fit on a button", () => {
    expect(fit("a".repeat(80))).toHaveLength(60);
    expect(fit("короткая")).toBe("короткая");
  });

  it("marks the podium with medals and the rest with a number", () => {
    expect(rankMark(1)).toBe("🥇");
    expect(rankMark(2)).toBe("🥈");
    expect(rankMark(3)).toBe("🥉");
    expect(rankMark(15)).toBe("15.");
  });
});

describe("greetings", () => {
  it("stays on the same variant for one person on one day", () => {
    const first = clubGreeting("Тимур А.", "42", new Date("2026-09-01T12:00:00+04:00"));
    const second = clubGreeting("Тимур А.", "42", new Date("2026-09-01T23:00:00+04:00"));
    expect(first).toBe(second);
    expect(first).toContain("Тимур А.");
  });

  it("escapes a name that would break HTML", () => {
    expect(clubGreeting("<b>x</b>", "1", new Date("2026-09-01T12:00:00+04:00"))).toContain(
      "&lt;b&gt;x&lt;/b&gt;",
    );
  });
});
