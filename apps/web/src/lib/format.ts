const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long" });
const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const fullDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso));
}

export function formatWeekday(iso: string): string {
  return weekday.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return time.format(new Date(iso));
}

export function formatFullDate(iso: string): string {
  return fullDate.format(new Date(iso));
}

/** "сегодня" / "завтра" / "через 5 дней" / "12 марта" — whichever reads best. */
export function formatRelativeDay(iso: string): string {
  const target = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days === -1) return "вчера";
  if (days > 1 && days <= 7) return `через ${days} ${plural(days, "день", "дня", "дней")}`;
  if (days < -1 && days >= -7) return `${-days} ${plural(-days, "день", "дня", "дней")} назад`;
  return formatDayMonth(iso);
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
  return `${points > 0 ? "+" : ""}${points}`;
}

export function placeLabel(place: number): string {
  if (place === 1) return "🥇";
  if (place === 2) return "🥈";
  if (place === 3) return "🥉";
  return `${place}`;
}

export const GAME_TYPE_LABELS: Record<string, string> = {
  nlh: "NL Hold'em",
  plo: "PL Omaha",
  plo5: "PLO5",
  mixed: "Mixed",
  other: "Другое",
};

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
  checked_in: "Пришёл",
  cancelled: "Отменено",
  no_show: "Не явился",
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
