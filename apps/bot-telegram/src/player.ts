import type {
  LeaderboardRow,
  PlayerStats,
  RegistrationView,
  TournamentSummary,
} from "@poker/contracts";
import { formatPlayerName } from "@poker/contracts";
import { InlineKeyboard } from "grammy";
import type { Api, TelegramProfile } from "./api.js";
import type { ClubInfo } from "./club.js";
import { clubGreeting, clubWhen, escapeHtml, fit, num, playerLabel, plural, points, rankMark } from "./format.js";

export type Screen = { text: string; keyboard: InlineKeyboard };

const BACK = "Назад";
const TOP_SIZE = 25;
const ROSTER_PAGE = 8;

/**
 * The player side of the bot is a single message that gets rewritten in place.
 * Every button either redraws this screen or shows a one-line toast, so pressing
 * things never leaves a trail of messages in the chat.
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
        return this.rating(profile);
      case "info":
        return this.info();
      case "who":
        return this.pickEvent(profile);
      default:
        return this.home(profile);
    }
  }

  private async home(profile: TelegramProfile): Promise<Screen> {
    const [session, club] = await Promise.all([this.api.session(profile), this.club.get()]);
    const hello = formatPlayerName(
      [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null,
      session.nickname,
    );
    const info = club.infoText.trim();

    return {
      text: [
        clubGreeting(hello, String(profile.id)),
        ...(info.length > 0 ? ["", escapeHtml(info)] : []),
      ].join("\n"),
      keyboard: new InlineKeyboard()
        .webApp("Открыть клуб", this.webUrl)
        .row()
        .text("Расписание", "nav:sched")
        .row()
        .text("Рейтинг", "nav:rate")
        .row()
        .text("Кто записан", "nav:who"),
    };
  }

  private async schedule(profile: TelegramProfile): Promise<Screen> {
    const tournaments = await this.upcoming(profile);

    if (tournaments.length === 0) {
      return {
        text: "<b>Расписание</b>\n\nПока ничего не назначено.",
        keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
      };
    }

    const keyboard = new InlineKeyboard();
    for (const tournament of tournaments.slice(0, 12)) {
      const mark = isSignedUp(tournament) ? "✓ " : "";
      keyboard
        .text(fit(`${mark}${clubWhen(tournament.startsAt)} · ${tournament.title}`), `tog:${tournament.id}`)
        .row();
    }
    keyboard.text(`← ${BACK}`, "nav:home");

    return {
      text: "<b>Расписание</b>",
      keyboard,
    };
  }

  private async rating(profile: TelegramProfile): Promise<Screen> {
    const [session, rows] = await Promise.all([
      this.api.session(profile),
      this.api.public<LeaderboardRow[]>("/rating/leaderboard?scope=season"),
    ]);

    if (rows.length === 0) {
      return {
        text: "🏆 <b>Топ игроков:</b>\n\nСезон только начинается.",
        keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
      };
    }

    const lines = rows.slice(0, TOP_SIZE).map((row) => {
      const name = escapeHtml(playerLabel(row.user));
      const score = num(row.points);
      const mark = rankMark(row.rank);
      const line = `${mark} ${name} — ${score}`;
      return row.user.id === session.userId ? `<b>${line}</b>` : line;
    });

    const me = rows.find((row) => row.user.id === session.userId);
    const footer = me
      ? `Вы — ${me.rank}-е место, ${points(me.points)}`
      : await this.myPlaceLine(profile);

    return {
      text: ["🏆 <b>Топ игроков:</b>", "", lines.join("\n"), "", `<b>${escapeHtml(footer)}</b>`].join("\n"),
      keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
    };
  }

  /** For a player who is outside the visible top: their own line, fetched separately. */
  private async myPlaceLine(profile: TelegramProfile): Promise<string> {
    const stats = await this.api.asUser<PlayerStats>(profile, "GET", "/rating/me");
    if (stats.rank == null) return "Вы ещё не в рейтинге";
    return `Вы — ${stats.rank}-е место, ${points(stats.points)}`;
  }

  private async info(): Promise<Screen> {
    const { infoText } = await this.club.get();

    return {
      text:
        infoText.trim().length > 0
          ? escapeHtml(infoText)
          : "Администратор пока не заполнил информацию о клубе.",
      keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
    };
  }

  private async pickEvent(profile: TelegramProfile): Promise<Screen> {
    const tournaments = await this.upcoming(profile);

    if (tournaments.length === 0) {
      return {
        text: "<b>Кто записан</b>\n\nПока нет назначенных событий.",
        keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
      };
    }

    const keyboard = new InlineKeyboard();
    for (const tournament of tournaments.slice(0, 12)) {
      keyboard
        .text(
          fit(`${clubWhen(tournament.startsAt)} · ${tournament.title} (${tournament.registeredCount})`),
          `nav:who:${tournament.id}`,
        )
        .row();
    }
    keyboard.text(`← ${BACK}`, "nav:home");

    return {
      text: "<b>Кто записан</b>",
      keyboard,
    };
  }

  private async roster(tournamentId: string, profile: TelegramProfile, page: number): Promise<Screen> {
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
    const from = playing.length === 0 ? 0 : safePage * ROSTER_PAGE + 1;
    const to = Math.min(playing.length, (safePage + 1) * ROSTER_PAGE);

    const keyboard = new InlineKeyboard();
    for (const row of slice) {
      keyboard.text(fit(playerLabel(row.user), 40), `plr:${row.user.id}`).row();
    }
    if (safePage > 0 || safePage < totalPages - 1) {
      if (safePage > 0) keyboard.text("Назад", `nav:who:${tournamentId}:${safePage - 1}`);
      if (safePage < totalPages - 1) keyboard.text("Ещё", `nav:who:${tournamentId}:${safePage + 1}`);
      keyboard.row();
    }
    keyboard.text(`← ${BACK}`, "nav:who");

    const header = tournament
      ? `<b>${escapeHtml(tournament.title)}</b>\n${clubWhen(tournament.startsAt)}`
      : "<b>Кто записан</b>";

    const counts =
      playing.length === 0
        ? "Пока никто не записался."
        : [
            `Записано: ${playing.length}`,
            playing.length > ROSTER_PAGE ? `${from}–${to}` : null,
            waiting.length > 0 ? `лист ожидания: ${waiting.length}` : null,
          ]
            .filter(Boolean)
            .join(" · ");

    return {
      text: [header, "", counts].join("\n"),
      keyboard,
    };
  }

  /** One-line summary of a player, shown as a toast over the roster. */
  async playerToast(userId: string): Promise<string> {
    const stats = await this.api.public<PlayerStats>(`/rating/player/${userId}`);
    if (stats.rank == null) return `${playerLabel(stats.user)} — ещё не в рейтинге`;

    const games = `${stats.gamesPlayed} ${plural(stats.gamesPlayed, "турнир", "турнира", "турниров")}`;
    return `${playerLabel(stats.user)}\n${stats.rank}-е место · ${points(stats.points)} · ${games}`;
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
      return `Вы отписались: ${tournament.title}`;
    }

    const result = await this.api.asUser<{ status: string; waitlistPosition: number | null }>(
      profile,
      "POST",
      `/tournaments/${tournamentId}/register`,
      { source: "tg_bot" },
    );

    return result.status === "waitlist"
      ? `Мест нет — вы в листе ожидания №${result.waitlistPosition}`
      : `Вы записаны: ${tournament.title}`;
  }

  private upcoming(profile: TelegramProfile): Promise<TournamentSummary[]> {
    return this.api.asUser<TournamentSummary[]>(profile, "GET", "/tournaments?scope=upcoming");
  }
}

function isSignedUp(tournament: TournamentSummary): boolean {
  const mine = tournament.myRegistration;
  return mine != null && mine.status !== "cancelled";
}
