import { CLUB_TIMEZONE, formatPlayerName } from "@poker/contracts";

/**
 * Everything a human reads is rendered on the club's wall clock, never on the
 * reader's. A player checking the schedule from a phone in another timezone must
 * see the hour the game actually starts in Samara.
 */
let timezone = CLUB_TIMEZONE;

export function setTimezone(value: string): void {
  // A bad value from the settings row would throw on every render, so it is
  // tried once here and ignored if the runtime does not know it.
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: value });
    timezone = value;
  } catch {
    timezone = CLUB_TIMEZONE;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "25 августа, вт" */
export function clubDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    weekday: "short",
  }).format(new Date(iso));
}

/** "19:00" */
export function clubClock(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "25 авг, вт · 19:00" — compact enough to fit on a button. */
export function clubWhen(iso: string): string {
  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(iso));
  return `${date.replace(".", "")} · ${clubClock(iso)}`;
}

/** True when the timestamp falls on today's date in the club's timezone. */
export function isToday(iso: string): boolean {
  return clubDayKey(new Date(iso)) === clubDayKey(new Date());
}

/** "2026-09-04" on the club's wall clock, safe to compare and subtract. */
function clubDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

function daysUntil(iso: string, now: Date): number {
  const from = Date.parse(`${clubDayKey(now)}T00:00:00Z`);
  const to = Date.parse(`${clubDayKey(new Date(iso))}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * How a person would say it out loud: "сегодня в 19:00", "в пятницу, 19:00",
 * "4 октября, 19:00". Anything further out than a week gets the date, because
 * "в пятницу" stops being useful once there is more than one Friday left.
 */
export function clubMoment(iso: string, now = new Date()): string {
  const clock = clubClock(iso);
  const days = daysUntil(iso, now);

  if (days === 0) return `сегодня в ${clock}`;
  if (days === 1) return `завтра в ${clock}`;
  if (days === -1) return `вчера в ${clock}`;

  if (days > 1 && days < 7) {
    const weekday = new Intl.DateTimeFormat("ru-RU", {
      timeZone: timezone,
      weekday: "long",
    }).format(new Date(iso));
    return `${weekdayPrefix(weekday)}, ${clock}`;
  }

  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
  return `${date}, ${clock}`;
}

/** "среда" → "в среду": Russian wants the accusative after "в". */
function weekdayPrefix(weekday: string): string {
  const accusative = weekday.endsWith("а") ? `${weekday.slice(0, -1)}у` : weekday;
  return `в ${accusative}`;
}

/**
 * Seats as a bar: `▰▰▰▰▱▱▱▱`. A number tells you how full a game is only after
 * you have read both halves of it; the bar tells you before you read anything.
 */
export function gauge(taken: number, total: number, width = 10): string {
  if (total <= 0) return "";
  if (taken >= total) return "▰".repeat(width);
  // A lone sign-up still has to show, and a table with a seat left must not be
  // rounded up into looking full — that is the one thing the bar is read for.
  const shown = Math.min(width - 1, Math.max(taken > 0 ? 1 : 0, Math.round((taken / total) * width)));
  return `${"▰".repeat(shown)}${"▱".repeat(width - shown)}`;
}

/** Telegram's quote block: the cheapest way to group lines into a card. */
export function quote(lines: (string | null | undefined | false)[]): string {
  return `<blockquote>${lines.filter(Boolean).join("\n")}</blockquote>`;
}

/** 1234567 → "1 234 567", with a narrow space Telegram renders reliably. */
export function num(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function rub(value: number): string {
  return `${num(value)} ₽`;
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function points(value: number): string {
  return `${num(value)} ${plural(value, "очко", "очка", "очков")}`;
}

/** Buttons have a hard label limit; cutting mid-word is better than a rejected keyboard. */
export function fit(value: string, max = 60): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** 🥇 / 🥈 / 🥉 for the podium, then "4." */
export function rankMark(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}.`;
}

export function playerLabel(user: { nickname: string; displayName?: string | null }): string {
  return formatPlayerName(user.displayName, user.nickname);
}

const GREETINGS: ((name: string) => string)[] = [
  (name) => `Добрый вечер, <b>${name}</b>.`,
  (name) => `<b>${name}</b>, рады вас видеть.`,
  (name) => `Здравствуйте, <b>${name}</b>.`,
  (name) => `<b>${name}</b>, добро пожаловать за стол.`,
  (name) => `Приветствуем, <b>${name}</b>.`,
];

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * One of a handful of greetings, stable for a given person on a given club day
 * so tapping around the menu does not reshuffle the hello.
 */
export function clubGreeting(name: string, seed: string, now = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  const index = hashSeed(`${seed}:${day}`) % GREETINGS.length;
  return GREETINGS[index]!(escapeHtml(name));
}
