import { CLUB_TIMEZONE } from "@poker/contracts";

/**
 * Dates are rendered on the club's wall clock, never on the visitor's.
 *
 * The games happen in one physical room in Samara, so a schedule that shifts
 * because somebody opened it from a phone set to another timezone is simply
 * wrong. The zone is a club setting, so it can be corrected without a deploy.
 */
let timezone = CLUB_TIMEZONE;

export function setTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: value });
    timezone = value;
  } catch {
    timezone = CLUB_TIMEZONE;
  }
}

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: timezone });
}

export function formatDayMonth(iso: string): string {
  return formatter({ day: "numeric", month: "long" }).format(new Date(iso));
}

export function formatWeekday(iso: string): string {
  return formatter({ weekday: "long" }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return formatter({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatFullDate(iso: string): string {
  return formatter({ day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

/** "сегодня" / "завтра" / "через 5 дней" / "12 марта" — whichever reads best. */
export function formatRelativeDay(iso: string): string {
  const days = clubDaysUntil(iso);

  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days === -1) return "вчера";
  if (days > 1 && days <= 7) return `через ${days} ${plural(days, "день", "дня", "дней")}`;
  if (days < -1 && days >= -7) return `${-days} ${plural(-days, "день", "дня", "дней")} назад`;
  return formatDayMonth(iso);
}

/**
 * Whole days between today and a date, both taken on the club's calendar. Days
 * are compared as calendar dates rather than by subtracting timestamps, so an
 * evening game is "сегодня" until midnight in Samara and not a moment longer.
 */
export function clubDaysUntil(iso: string): number {
  const key = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
  const asUtc = (day: string) => Date.parse(`${day}T00:00:00Z`);

  return Math.round((asUtc(key(new Date(iso))) - asUtc(key(new Date()))) / 86_400_000);
}

/**
 * The club's offset from UTC at a given moment, in milliseconds.
 *
 * Derived from Intl rather than hard-coded: Samara does not observe daylight
 * saving today, but a club that moves — or a zone whose rules change, which
 * Russian zones have done before — must not silently shift every game by an hour.
 */
function offsetAt(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    // Intl renders midnight as hour 24 in some locales.
    get("hour") % 24,
    get("minute"),
    get("second"),
  );

  return asIfUtc - date.getTime();
}

/** Splits a timestamp into the date and time inputs of an edit form. */
export function toClubParts(iso: string): { date: string; time: string } {
  const shifted = new Date(new Date(iso).getTime() + offsetAt(new Date(iso)));
  const text = shifted.toISOString();
  return { date: text.slice(0, 10), time: text.slice(11, 16) };
}

/** The reverse: "2026-08-25" plus "19:00" on the club's clock, as an instant. */
export function fromClubParts(date: string, time: string): Date {
  const naive = Date.parse(`${date}T${time}:00Z`);
  // The offset is looked up at roughly the right instant, which is exact for any
  // zone whose rules do not change within a few hours of the game.
  return new Date(naive - offsetAt(new Date(naive)));
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatPoints(points: number): string {
  return `${points > 0 ? "+" : ""}${points.toLocaleString("ru-RU")}`;
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

export function formatRub(value: number): string {
  return `${formatNumber(value)} ₽`;
}

export function placeLabel(place: number): string {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return `${place}`;
}

export const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  announced: "Анонсирован",
  reg_open: "Запись открыта",
  reg_closed: "Запись закрыта",
  running: "Идёт",
  finished: "Завершён",
  cancelled: "Отменён",
};

export const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  registered: "Записан",
  waitlist: "В листе ожидания",
  cancelled: "Отменено",
};

export const PAYMENT_KIND_LABELS: Record<string, string> = {
  entry: "Вход",
  rebuy: "Ребай",
  addon: "Адон",
  drink: "Напиток",
  other: "Прочее",
};
