import type {
  LeaderboardRow,
  PlayerStats,
  RegistrationView,
  TournamentSummary,
} from "@poker/contracts";

/**
 * Message rendering, kept as pure functions so it can be unit-tested without a
 * Telegram connection. Everything uses HTML parse mode; user-supplied text
 * (nicknames, tournament titles) must go through `escapeHtml`.
 */

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  weekday: "short",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

export function formatWhen(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatSchedule(tournaments: TournamentSummary[]): string {
  if (tournaments.length === 0) {
    return "Пока нет запланированных турниров. Как только появятся — сообщу.";
  }

  const lines = tournaments.map((tournament) => {
    const seats =
      tournament.capacity == null
        ? `${tournament.registeredCount} записались`
        : `${tournament.registeredCount}/${tournament.capacity} мест`;

    const marks = [
      tournament.waitlistCount > 0 ? `+${tournament.waitlistCount} в ожидании` : null,
      tournament.ratingMultiplier > 1 ? `×${tournament.ratingMultiplier} рейтинг` : null,
      myMark(tournament),
    ].filter(Boolean);

    return [
      `<b>${escapeHtml(tournament.title)}</b>`,
      `${formatWhen(tournament.startsAt)} · ${seats}`,
      marks.length > 0 ? marks.join(" · ") : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return `<b>Ближайшие турниры</b>\n\n${lines.join("\n\n")}`;
}

function myMark(tournament: TournamentSummary): string | null {
  const registration = tournament.myRegistration;
  if (!registration || registration.status === "cancelled") return null;
  if (registration.status === "waitlist") {
    return `🕓 вы в ожидании №${registration.waitlistPosition}`;
  }
  return "✅ вы записаны";
}

export function formatRoster(
  tournament: TournamentSummary,
  registrations: RegistrationView[],
): string {
  const seated = registrations.filter((row) => row.status !== "waitlist");
  const waiting = registrations.filter((row) => row.status === "waitlist");

  const header = `<b>${escapeHtml(tournament.title)}</b>\n${formatWhen(tournament.startsAt)}`;

  if (registrations.length === 0) {
    return `${header}\n\nПока никто не записался.`;
  }

  const list = seated
    .map((row, index) => `${index + 1}. ${escapeHtml(row.user.nickname)}${checkMark(row)}`)
    .join("\n");

  const waitingList =
    waiting.length > 0
      ? `\n\n<b>Лист ожидания</b>\n${waiting
          .map((row) => `${row.waitlistPosition}. ${escapeHtml(row.user.nickname)}`)
          .join("\n")}`
      : "";

  return `${header}\n\n<b>Записались (${seated.length})</b>\n${list}${waitingList}`;
}

function checkMark(row: RegistrationView): string {
  if (row.status === "checked_in") return " ✅";
  if (row.status === "no_show") return " ❌";
  return "";
}

export function formatLeaderboard(rows: LeaderboardRow[], meId?: string): string {
  if (rows.length === 0) return "Рейтинг пока пуст — очки появятся после первого турнира.";

  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.slice(0, 15).map((row) => {
    const rank = medals[row.rank - 1] ?? `${row.rank}.`;
    const you = row.user.id === meId ? " ← вы" : "";
    return `${rank} ${escapeHtml(row.user.nickname)} — <b>${row.points}</b> (${row.gamesPlayed} ${plural(row.gamesPlayed, "игра", "игры", "игр")})${you}`;
  });

  const outside =
    meId && !rows.slice(0, 15).some((row) => row.user.id === meId)
      ? rows.find((row) => row.user.id === meId)
      : undefined;

  const tail = outside
    ? `\n…\n${outside.rank}. ${escapeHtml(outside.user.nickname)} — <b>${outside.points}</b> ← вы`
    : "";

  return `<b>Рейтинг сезона</b>\n\n${lines.join("\n")}${tail}`;
}

export function formatMyStats(stats: PlayerStats): string {
  const lines = [
    `<b>${escapeHtml(stats.user.nickname)}</b>`,
    stats.rank ? `Место в сезоне: <b>${stats.rank}</b>` : null,
    `Очки: <b>${stats.points}</b>`,
    `Турниров: ${stats.gamesPlayed} · побед: ${stats.wins} · топ-3: ${stats.top3}`,
    stats.avgPlace != null
      ? `Среднее место: ${stats.avgPlace.toFixed(1)}${stats.bestPlace ? ` · лучшее: ${stats.bestPlace}` : ""}`
      : null,
  ].filter(Boolean);

  const recent = stats.history.slice(0, 5).map((event) => {
    const sign = event.points >= 0 ? "+" : "";
    const what = event.tournament
      ? `${escapeHtml(event.tournament.title)}${event.place ? `, ${event.place} место` : ""}`
      : escapeHtml(event.achievement?.title ?? event.comment ?? "корректировка");
    return `• ${what}: <b>${sign}${event.points}</b>`;
  });

  const history = recent.length > 0 ? `\n\n<b>Последнее</b>\n${recent.join("\n")}` : "";
  return `${lines.join("\n")}${history}`;
}

export const HELP_TEXT = [
  "<b>Что я умею</b>",
  "",
  "/schedule — ближайшие турниры и запись",
  "/rating — рейтинг сезона",
  "/me — ваша статистика",
  "/who — кто записан на турнир",
  "/help — эта справка",
  "",
  "Ник берётся из вашего Telegram. Изменить его может организатор клуба.",
].join("\n");
