import type {
  LeaderboardRow,
  PlayerStats,
  RegistrationView,
  TournamentSummary,
  UserAchievementView,
} from "@poker/contracts";
import { formatPlayerName } from "@poker/contracts";
import { InlineKeyboard } from "grammy";
import type { Api, TelegramProfile } from "./api.js";
import type { ClubInfo } from "./club.js";
import {
  clubGreeting,
  clubMoment,
  clubWhen,
  escapeHtml,
  fit,
  gauge,
  num,
  playerLabel,
  plural,
  points,
  quote,
  rankMark,
} from "./format.js";

export type Screen = { text: string; keyboard: InlineKeyboard };

const BACK = "← Назад";
const SUIT = "♠";
const TOP_SIZE = 20;
const ROSTER_PAGE = 8;
const HISTORY_LINES = 4;

/**
 * The player side of the bot is a single message that gets rewritten in place.
 * Every button either redraws this screen or shows a one-line toast, so pressing
 * things never leaves a trail of messages in the chat.
 *
 * Each screen is built the same way: a title line, then quote blocks that each
 * answer one question. Telegram gives a bot almost no layout — bold, a quote bar
 * and monospace — so the structure has to come from what is on each line.
 */
export class PlayerScreens {
  constructor(
    private readonly api: Api,
    private readonly club: ClubInfo,
    private readonly webUrl: string,
  ) {}

  async render(route: string, profile: TelegramProfile): Promise<Screen> {
    if (route.startsWith("who:")) {
      const [tournamentId, pageRaw] = route.slice(4).split(":");
      const page = pageRaw && /^\d+$/.test(pageRaw) ? Number(pageRaw) : 0;
      return this.roster(tournamentId ?? "", profile, page);
    }

    switch (route) {
      case "sched":
        return this.schedule(profile);
      case "rate":
        return this.rating(profile, "season");
      case "rate:all":
        return this.rating(profile, "all_time");
      case "me":
        return this.profile(profile);
      case "info":
        return this.info();
      case "who":
        return this.pickEvent(profile);
      default:
        return this.home(profile);
    }
  }

  // ─── Home ───────────────────────────────────────────────────────────────────

  private async home(profile: TelegramProfile): Promise<Screen> {
    // The club info is fetched for its timezone, which every date below depends on.
    const [session, , tournaments, stats] = await Promise.all([
      this.api.session(profile),
      this.club.get(),
      this.upcoming(profile).catch(() => [] as TournamentSummary[]),
      this.api.asUser<PlayerStats>(profile, "GET", "/rating/me").catch(() => null),
    ]);

    const name = formatPlayerName(
      [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null,
      session.nickname,
    );
    const next = tournaments[0];

    const blocks = [
      `${SUIT} <b>Клуб спортивного покера</b>`,
      "",
      clubGreeting(name, String(profile.id)),
      "",
      quote(
        next
          ? ["<b>Ближайшая игра</b>", ...eventLines(next)]
          : ["<b>Ближайшая игра</b>", "Расписание пока пустое — заглядывайте позже."],
      ),
    ];

    if (stats) blocks.push(quote(standingLines(stats)));

    const keyboard = new InlineKeyboard()
      .webApp(`${SUIT} Открыть клуб`, this.webUrl)
      .row()
      .text("Расписание", "nav:sched")
      .text("Рейтинг", "nav:rate")
      .row()
      .text("Мой профиль", "nav:me")
      .text("Кто записан", "nav:who")
      .row()
      .text("О клубе", "nav:info");

    return { text: blocks.join("\n"), keyboard };
  }

  // ─── Schedule ───────────────────────────────────────────────────────────────

  private async schedule(profile: TelegramProfile): Promise<Screen> {
    const tournaments = await this.upcoming(profile);

    if (tournaments.length === 0) {
      return {
        text: [`${SUIT} <b>Расписание</b>`, "", "Пока ничего не назначено."].join("\n"),
        keyboard: new InlineKeyboard().text(BACK, "nav:home"),
      };
    }

    const shown = tournaments.slice(0, 6);
    const mine = shown.filter(isSignedUp).length;

    // The cards above already name every game, so the buttons carry the action
    // and just enough of the date to say which card they belong to.
    const keyboard = new InlineKeyboard();
    for (const tournament of shown) {
      keyboard
        .text(fit(`${signUpLabel(tournament)} · ${clubWhen(tournament.startsAt)}`), `tog:${tournament.id}`)
        .row();
    }
    keyboard.text(BACK, "nav:home");

    const text = [
      `${SUIT} <b>Расписание</b>`,
      `<i>${mine > 0 ? `Вы записаны на ${mine} ${plural(mine, "игру", "игры", "игр")}` : "Ближайшие игры клуба"}</i>`,
      "",
      ...shown.map((tournament) => quote(eventLines(tournament))),
    ];

    return { text: text.join("\n"), keyboard };
  }

  // ─── Rating ─────────────────────────────────────────────────────────────────

  private async rating(
    profile: TelegramProfile,
    scope: "season" | "all_time",
  ): Promise<Screen> {
    const [session, rows] = await Promise.all([
      this.api.session(profile),
      this.api.public<LeaderboardRow[]>(`/rating/leaderboard?scope=${scope}`),
    ]);

    const title = scope === "season" ? "Рейтинг сезона" : "Рейтинг за всё время";
    const keyboard = new InlineKeyboard()
      .text(scope === "season" ? "· Сезон ·" : "Сезон", "nav:rate")
      .text(scope === "all_time" ? "· За всё время ·" : "За всё время", "nav:rate:all")
      .row()
      .text("Мой профиль", "nav:me")
      .row()
      .text(BACK, "nav:home");

    if (rows.length === 0) {
      return {
        text: [`${SUIT} <b>${title}</b>`, "", "Сезон только начинается."].join("\n"),
        keyboard,
      };
    }

    const table = rows.slice(0, TOP_SIZE).map((row) => {
      const name = escapeHtml(playerLabel(row.user));
      const line = `${rankMark(row.rank)} ${name} — ${num(row.points)}`;
      return row.user.id === session.userId ? `<b>▸ ${line}</b>` : line;
    });

    const me = rows.find((row) => row.user.id === session.userId);
    const footer = me ? chaseLines(rows, me) : [escapeHtml(await this.myPlaceLine(profile))];

    return {
      text: [
        `${SUIT} <b>${title}</b>`,
        `<i>${rows.length} ${plural(rows.length, "игрок", "игрока", "игроков")} в зачёте</i>`,
        "",
        quote(table),
        quote(footer),
      ].join("\n"),
      keyboard,
    };
  }

  /** For a player who is outside the visible top: their own line, fetched separately. */
  private async myPlaceLine(profile: TelegramProfile): Promise<string> {
    const stats = await this.api.asUser<PlayerStats>(profile, "GET", "/rating/me");
    if (stats.rank == null) return "Вы ещё не в рейтинге — сыграйте первый турнир";
    return `Вы — ${stats.rank}-е место, ${points(stats.points)}`;
  }

  // ─── Personal profile ───────────────────────────────────────────────────────

  private async profile(profile: TelegramProfile): Promise<Screen> {
    const session = await this.api.session(profile);
    const [stats, awards] = await Promise.all([
      this.api.asUser<PlayerStats>(profile, "GET", "/rating/me"),
      this.api
        .public<UserAchievementView[]>(`/achievements/user/${session.userId}`)
        .catch(() => [] as UserAchievementView[]),
    ]);

    const keyboard = new InlineKeyboard()
      .webApp(`${SUIT} Открыть клуб`, this.webUrl)
      .row()
      .text("Рейтинг", "nav:rate")
      .text("Расписание", "nav:sched")
      .row()
      .text(BACK, "nav:home");

    const blocks = [
      `${SUIT} <b>${escapeHtml(playerLabel(stats.user))}</b>`,
      "",
      quote(standingLines(stats)),
      quote([
        `Турниров сыграно: <b>${stats.gamesPlayed}</b>`,
        `Побед: <b>${stats.wins}</b> · Топ-3: <b>${stats.top3}</b> · В призах: <b>${stats.itm}</b>`,
        stats.bestPlace != null ? `Лучший финиш: <b>${stats.bestPlace} место</b>` : null,
        stats.avgPlace != null ? `Средний финиш: <b>${stats.avgPlace.toFixed(1)}</b>` : null,
      ]),
    ];

    if (awards.length > 0) {
      const names = awards
        .slice(0, 8)
        .map((row) => escapeHtml(row.achievement.title))
        .join(" · ");
      const more = awards.length > 8 ? ` и ещё ${awards.length - 8}` : "";
      blocks.push(quote(["<b>Ачивки</b>", `${names}${more}`]));
    }

    const recent = stats.history.filter((row) => row.tournament != null).slice(0, HISTORY_LINES);
    if (recent.length > 0) {
      blocks.push(
        quote([
          "<b>Последние игры</b>",
          ...recent.map((row) => {
            const where = row.place != null ? `${row.place} место` : "участие";
            const sign = row.points >= 0 ? "+" : "−";
            return `${escapeHtml(row.tournament!.title)} — ${where}, ${sign}${num(Math.abs(row.points))}`;
          }),
        ]),
      );
    }

    return { text: blocks.join("\n"), keyboard };
  }

  // ─── Who is coming ──────────────────────────────────────────────────────────

  private async info(): Promise<Screen> {
    const { infoText } = await this.club.get();
    const body =
      infoText.trim().length > 0
        ? escapeHtml(infoText.trim())
        : "Администратор пока не заполнил информацию о клубе.";

    return {
      text: [`${SUIT} <b>О клубе</b>`, "", quote([body])].join("\n"),
      keyboard: new InlineKeyboard()
        .webApp(`${SUIT} Открыть клуб`, this.webUrl)
        .row()
        .text(BACK, "nav:home"),
    };
  }

  private async pickEvent(profile: TelegramProfile): Promise<Screen> {
    const tournaments = await this.upcoming(profile);

    if (tournaments.length === 0) {
      return {
        text: [`${SUIT} <b>Кто записан</b>`, "", "Пока нет назначенных событий."].join("\n"),
        keyboard: new InlineKeyboard().text(BACK, "nav:home"),
      };
    }

    const keyboard = new InlineKeyboard();
    for (const tournament of tournaments.slice(0, 10)) {
      keyboard
        .text(
          fit(
            `${clubWhen(tournament.startsAt)} · ${tournament.title} · ${tournament.registeredCount}`,
          ),
          `nav:who:${tournament.id}`,
        )
        .row();
    }
    keyboard.text(BACK, "nav:home");

    return {
      text: [
        `${SUIT} <b>Кто записан</b>`,
        "<i>Выберите игру — покажем состав</i>",
      ].join("\n"),
      keyboard,
    };
  }

  private async roster(
    tournamentId: string,
    profile: TelegramProfile,
    page: number,
  ): Promise<Screen> {
    const [tournaments, registrations] = await Promise.all([
      this.upcoming(profile),
      this.api.public<RegistrationView[]>(`/tournaments/${tournamentId}/registrations`),
    ]);
    const tournament = tournaments.find((candidate) => candidate.id === tournamentId);

    const playing = registrations.filter((row) => row.status === "registered");
    const waiting = registrations.filter((row) => row.status === "waitlist");

    const totalPages = Math.max(1, Math.ceil(playing.length / ROSTER_PAGE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const slice = playing.slice(safePage * ROSTER_PAGE, (safePage + 1) * ROSTER_PAGE);

    const keyboard = new InlineKeyboard();
    slice.forEach((row, index) => {
      const seat = safePage * ROSTER_PAGE + index + 1;
      keyboard.text(fit(`${seat}. ${playerLabel(row.user)}`, 40), `plr:${row.user.id}`).row();
    });
    if (totalPages > 1) {
      if (safePage > 0) keyboard.text("‹ Раньше", `nav:who:${tournamentId}:${safePage - 1}`);
      if (safePage < totalPages - 1) keyboard.text("Дальше ›", `nav:who:${tournamentId}:${safePage + 1}`);
      keyboard.row();
    }
    keyboard.text(BACK, "nav:who");

    const header = tournament
      ? [`${SUIT} <b>${escapeHtml(tournament.title)}</b>`, `<i>${clubMoment(tournament.startsAt)}</i>`]
      : [`${SUIT} <b>Кто записан</b>`];

    const body =
      playing.length === 0
        ? quote(["Пока никто не записался.", "Будьте первым — это всегда заметно."])
        : quote([
            tournament?.capacity != null
              ? `${gauge(playing.length, tournament.capacity)}  <b>${playing.length}</b> / ${tournament.capacity}`
              : `Записано: <b>${playing.length}</b>`,
            tournament?.capacity != null && tournament.capacity > playing.length
              ? `Свободно мест: ${tournament.capacity - playing.length}`
              : null,
            waiting.length > 0 ? `Лист ожидания: ${waiting.length}` : null,
            totalPages > 1 ? `Страница ${safePage + 1} из ${totalPages}` : null,
          ]);

    return {
      text: [...header, "", body, "", "<i>Нажмите на игрока, чтобы увидеть его статистику.</i>"].join(
        "\n",
      ),
      keyboard,
    };
  }

  /** One-line summary of a player, shown as a toast over the roster. */
  async playerToast(userId: string): Promise<string> {
    const stats = await this.api.public<PlayerStats>(`/rating/player/${userId}`);
    const name = playerLabel(stats.user);
    if (stats.rank == null) return `${name}\n\nЕщё не в рейтинге — всё впереди.`;

    const games = `${stats.gamesPlayed} ${plural(stats.gamesPlayed, "турнир", "турнира", "турниров")}`;
    return [
      name,
      "",
      `${stats.rank}-е место · ${points(stats.points)}`,
      `${games} · побед: ${stats.wins} · в призах: ${stats.itm}`,
      stats.bestPlace != null ? `Лучший финиш: ${stats.bestPlace} место` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Signs the player up, or cancels an existing sign-up. Returns the toast to
   * show; the caller redraws the schedule so the checkmark matches.
   */
  async toggleRegistration(tournamentId: string, profile: TelegramProfile): Promise<string> {
    const tournaments = await this.upcoming(profile);
    const tournament = tournaments.find((candidate) => candidate.id === tournamentId);

    if (!tournament) return "Это событие больше не в расписании";

    if (isSignedUp(tournament)) {
      await this.api.asUser(profile, "DELETE", `/tournaments/${tournamentId}/register`);
      return `Запись отменена · ${tournament.title}`;
    }

    const result = await this.api.asUser<{ status: string; waitlistPosition: number | null }>(
      profile,
      "POST",
      `/tournaments/${tournamentId}/register`,
      { source: "tg_bot" },
    );

    return result.status === "waitlist"
      ? `Мест нет — вы в листе ожидания №${result.waitlistPosition}`
      : `Вы в игре · ${tournament.title}\n${clubMoment(tournament.startsAt)}`;
  }

  private upcoming(profile: TelegramProfile): Promise<TournamentSummary[]> {
    return this.api.asUser<TournamentSummary[]>(profile, "GET", "/tournaments?scope=upcoming");
  }
}

/** The card body shared by the home screen and the schedule. */
function eventLines(tournament: TournamentSummary): string[] {
  const place = tournament.venue?.address ?? tournament.venue?.title ?? null;
  const seats =
    tournament.capacity != null
      ? `${gauge(tournament.registeredCount, tournament.capacity)}  <b>${tournament.registeredCount}</b> / ${tournament.capacity}`
      : `Записано: <b>${tournament.registeredCount}</b>`;

  const extras = [
    tournament.ratingMultiplier !== 1 ? `×${tournament.ratingMultiplier} рейтинг` : null,
    `${tournament.paidPlaces} ${plural(tournament.paidPlaces, "призовое", "призовых", "призовых")}`,
    tournament.waitlistCount > 0 ? `+${tournament.waitlistCount} в ожидании` : null,
  ].filter(Boolean);

  return [
    `<b>${escapeHtml(tournament.title)}</b>`,
    clubMoment(tournament.startsAt),
    place ? escapeHtml(place) : null,
    seats,
    extras.join(" · "),
    isSignedUp(tournament) ? "✓ <b>Вы записаны</b>" : null,
  ].filter((line) => line !== null) as string[];
}

function standingLines(stats: PlayerStats): string[] {
  if (stats.rank == null) {
    return ["<b>Вы ещё не в рейтинге</b>", "Первый сыгранный турнир откроет счёт."];
  }
  return [
    `<b>${stats.rank}-е место</b> в клубе`,
    `${points(stats.points)} · ${stats.gamesPlayed} ${plural(stats.gamesPlayed, "турнир", "турнира", "турниров")}`,
  ];
}

/** How far the player is from the rung above — the reason to come back. */
function chaseLines(rows: LeaderboardRow[], me: LeaderboardRow): string[] {
  const lines = [`<b>Вы — ${me.rank}-е место</b>`, `${points(me.points)}`];
  const ahead = rows.find((row) => row.rank === me.rank - 1);
  if (ahead) {
    const gap = ahead.points - me.points;
    lines.push(
      gap > 0
        ? `До ${ahead.rank}-го места: ${points(gap)}`
        : `Вы вплотную к ${ahead.rank}-му месту`,
    );
  }
  return lines;
}

function signUpLabel(tournament: TournamentSummary): string {
  if (isSignedUp(tournament)) return "✓ Отменить запись";
  if (tournament.capacity != null && tournament.registeredCount >= tournament.capacity) {
    return "→ В лист ожидания";
  }
  return "+ Записаться";
}

function isSignedUp(tournament: TournamentSummary): boolean {
  const mine = tournament.myRegistration;
  return mine != null && mine.status !== "cancelled";
}
