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
  const asDay = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
  return asDay(new Date(iso)) === asDay(new Date());
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

export function playerLabel(user: { nickname: string; displayName?: string | null }): string {
  return formatPlayerName(user.displayName, user.nickname);
}

const GREETINGS: ((name: string) => string)[] = [
  (name) => `Добрый вечер, <b>${name}</b>.\nКлуб спортивного покера · Ульяновск.`,
  (name) => `<b>${name}</b>, рады вас видеть.\nИграем в Ульяновске.`,
  (name) => `Здравствуйте, <b>${name}</b>.\nУльяновск, клуб спортивного покера.`,
  (name) => `<b>${name}</b>, добро пожаловать.\nСтолы ждут в Ульяновске.`,
  (name) => `Приветствуем, <b>${name}</b>.\nВечер в Ульяновске начинается здесь.`,
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
