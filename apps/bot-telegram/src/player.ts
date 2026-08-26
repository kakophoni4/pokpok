import type {
  LeaderboardRow,
  PlayerStats,
  RegistrationView,
  TournamentSummary,
} from "@poker/contracts";
import { InlineKeyboard } from "grammy";
import type { Api, TelegramProfile } from "./api.js";
import type { ClubInfo } from "./club.js";
import { clubWhen, escapeHtml, fit, num, plural, points } from "./format.js";

export type Screen = { text: string; keyboard: InlineKeyboard };

const BACK = "Назад";
const TOP_SIZE = 25;

/**
 * The player side of the bot is a single message that gets rewritten in place.
 * Every button either redraws this screen or shows a one-line toast, so pressing
 * things never leaves a trail of messages in the chat.
 */
export class PlayerScreens {
  constructor(
    private readonly api: Api,
    private readonly club: ClubInfo,
  ) {}

  async render(route: string, profile: TelegramProfile): Promise<Screen> {
    if (route.startsWith("who:")) return this.roster(route.slice(4), profile);

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
    const session = await this.api.session(profile);

    return {
      text: [
        "🃏 <b>Клуб спортивного покера</b>",
        "",
        `Здравствуйте, ${escapeHtml(session.nickname)}.`,
        "Все игры и время — по Самаре.",
      ].join("\n"),
      keyboard: new InlineKeyboard()
        .text("📅 Расписание событий", "nav:sched")
        .row()
        .text("🏆 Рейтинг", "nav:rate")
        .row()
        .text("📍 Как нас найти", "nav:info")
        .row()
        .text("👥 Кто записан", "nav:who"),
    };
  }

  private async schedule(profile: TelegramProfile): Promise<Screen> {
    const tournaments = await this.upcoming(profile);

    if (tournaments.length === 0) {
      return {
        text: "📅 <b>Расписание событий</b>\n\nПока ничего не назначено. Заглядывайте позже.",
        keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
      };
    }

    const keyboard = new InlineKeyboard();
    for (const tournament of tournaments.slice(0, 12)) {
      const mark = isSignedUp(tournament) ? "✅" : "▫️";
      keyboard
        .text(fit(`${mark} ${clubWhen(tournament.startsAt)} — ${tournament.title}`), `tog:${tournament.id}`)
        .row();
    }
    keyboard.text(`← ${BACK}`, "nav:home");

    return {
      text: [
        "📅 <b>Расписание событий</b>",
        "",
        "Нажмите на событие, чтобы записаться. Нажмите ещё раз — запись снимется.",
        "✅ — вы записаны.",
      ].join("\n"),
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
        text: "🏆 <b>Рейтинг</b>\n\nСезон только начинается — сыгранных турниров пока нет.",
        keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
      };
    }

    const width = String(Math.min(rows.length, TOP_SIZE)).length;
    const lines = rows.slice(0, TOP_SIZE).map((row) => {
      const rank = String(row.rank).padStart(width, " ");
      const own = row.user.id === session.userId ? "👉 " : "";
      return `${own}${rank}. ${escapeHtml(row.user.nickname)} — ${num(row.points)}`;
    });

    const me = rows.find((row) => row.user.id === session.userId);
    const footer = me
      ? `Вы: ${me.rank}-е место, ${points(me.points)}`
      : await this.myPlaceLine(profile);

    return {
      text: [
        "🏆 <b>Рейтинг сезона</b>",
        "",
        `<pre>${lines.join("\n")}</pre>`,
        `<b>${escapeHtml(footer)}</b>`,
      ].join("\n"),
      keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
    };
  }

  /** For a player who is outside the visible top: their own line, fetched separately. */
  private async myPlaceLine(profile: TelegramProfile): Promise<string> {
    const stats = await this.api.asUser<PlayerStats>(profile, "GET", "/rating/me");
    if (stats.rank == null) return "Вы ещё не в рейтинге — сыграйте первый турнир";
    return `Вы: ${stats.rank}-е место, ${points(stats.points)}`;
  }

  private async info(): Promise<Screen> {
    const { infoText } = await this.club.get();

    return {
      text: [
        "📍 <b>Как нас найти</b>",
        "",
        infoText.trim().length > 0
          ? escapeHtml(infoText)
          : "Администратор пока не заполнил информацию о клубе.",
      ].join("\n"),
      keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
    };
  }

  private async pickEvent(profile: TelegramProfile): Promise<Screen> {
    const tournaments = await this.upcoming(profile);

    if (tournaments.length === 0) {
      return {
        text: "👥 <b>Кто записан</b>\n\nПока нет назначенных событий.",
        keyboard: new InlineKeyboard().text(`← ${BACK}`, "nav:home"),
      };
    }

    const keyboard = new InlineKeyboard();
    for (const tournament of tournaments.slice(0, 12)) {
      keyboard
        .text(
          fit(`${clubWhen(tournament.startsAt)} — ${tournament.title} (${tournament.registeredCount})`),
          `nav:who:${tournament.id}`,
        )
        .row();
    }
    keyboard.text(`← ${BACK}`, "nav:home");

    return {
      text: "👥 <b>Кто записан</b>\n\nВыберите событие.",
      keyboard,
    };
  }

  private async roster(tournamentId: string, profile: TelegramProfile): Promise<Screen> {
    const [tournaments, registrations] = await Promise.all([
      this.upcoming(profile),
      this.api.public<RegistrationView[]>(`/tournaments/${tournamentId}/registrations`),
    ]);
    const tournament = tournaments.find((candidate) => candidate.id === tournamentId);

    const playing = registrations.filter((row) => row.status === "registered");
    const waiting = registrations.filter((row) => row.status === "waitlist");

    const keyboard = new InlineKeyboard();
    // Players are buttons: tapping one shows that player's standing as a toast,
    // which keeps the screen count at one.
    for (const row of playing.slice(0, 30)) {
      keyboard.text(fit(escapeHtml(row.user.nickname), 40), `plr:${row.user.id}`).row();
    }
    keyboard.text(`← ${BACK}`, "nav:who");

    const header = tournament
      ? `👥 <b>${escapeHtml(tournament.title)}</b>\n${clubWhen(tournament.startsAt)}`
      : "👥 <b>Кто записан</b>";

    const counts = [
      `Записано: ${playing.length}`,
      ...(waiting.length > 0 ? [`в листе ожидания: ${waiting.length}`] : []),
    ].join(", ");

    return {
      text: [
        header,
        "",
        playing.length > 0 ? counts : "Пока никто не записался.",
        ...(playing.length > 0 ? ["", "Нажмите на игрока, чтобы увидеть его место в рейтинге."] : []),
      ].join("\n"),
      keyboard,
    };
  }

  /** One-line summary of a player, shown as a toast over the roster. */
  async playerToast(userId: string): Promise<string> {
    const stats = await this.api.public<PlayerStats>(`/rating/player/${userId}`);
    if (stats.rank == null) return `${stats.user.nickname} — ещё не в рейтинге`;

    const games = `${stats.gamesPlayed} ${plural(stats.gamesPlayed, "турнир", "турнира", "турниров")}`;
    return `${stats.user.nickname}\n${stats.rank}-е место · ${points(stats.points)} · ${games}`;
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
      : `Вы успешно записаны: ${tournament.title}`;
  }

  private upcoming(profile: TelegramProfile): Promise<TournamentSummary[]> {
    return this.api.asUser<TournamentSummary[]>(profile, "GET", "/tournaments?scope=upcoming");
  }
}

function isSignedUp(tournament: TournamentSummary): boolean {
  const mine = tournament.myRegistration;
  return mine != null && mine.status !== "cancelled";
}
