import type {
  Achievement,
  ClubSettings,
  PaymentKind,
  PublicUser,
  TournamentDetail,
  TournamentPlayer,
  TournamentSummary,
} from "@poker/contracts";
import { InlineKeyboard } from "grammy";
import type { Api, TelegramProfile } from "./api.js";
import { clubDate, clubClock, escapeHtml, fit, num, points, rub } from "./format.js";

export type Screen = { text: string; keyboard: InlineKeyboard };

/** A player as the game topic shows them: their tab, their place, their fate. */
type Seat = {
  user: PublicUser;
  totalRub: number;
  chips: number;
  place: number | null;
  ratingPoints: number | null;
  paid: { entry: boolean; addons: number; drinks: number };
  lastPaymentId: string | null;
};

/**
 * The admin side of the bot: one forum topic per evening, one card per player
 * inside it, and a board pinned on top.
 *
 * Everything is a button. Amounts come from the club's price list, places are
 * worked out from who is left, and achievements are picked from a list — so the
 * cash desk cannot be operated wrongly by typing the wrong thing. Text commands
 * still work for the odd non-standard amount.
 */
export class AdminScreens {
  constructor(private readonly api: Api) {}

  // ─── Data ───────────────────────────────────────────────────────────────────

  detail(profile: TelegramProfile, tournamentId: string): Promise<TournamentDetail> {
    return this.api.asUser<TournamentDetail>(profile, "GET", `/tournaments/${tournamentId}`);
  }

  byTopic(profile: TelegramProfile, topicId: number): Promise<TournamentDetail> {
    return this.api.asUser<TournamentDetail>(profile, "GET", `/tournaments/by-topic/${topicId}`);
  }

  settings(profile: TelegramProfile): Promise<ClubSettings> {
    return this.api.asUser<ClubSettings>(profile, "GET", "/club/settings");
  }

  achievements(profile: TelegramProfile): Promise<Achievement[]> {
    return this.api.asUser<Achievement[]>(profile, "GET", "/achievements");
  }

  /** The evening to run: today's game if there is one, otherwise the next one. */
  async pickTournament(profile: TelegramProfile): Promise<TournamentSummary | null> {
    const upcoming = await this.api.asUser<TournamentSummary[]>(
      profile,
      "GET",
      "/tournaments?scope=upcoming",
    );
    return upcoming[0] ?? null;
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  async charge(
    profile: TelegramProfile,
    tournamentId: string,
    userId: string,
    kind: PaymentKind,
    amountRub: number,
  ): Promise<TournamentPlayer> {
    return this.api.asUser<TournamentPlayer>(
      profile,
      "POST",
      `/tournaments/${tournamentId}/payments`,
      { userId, kind, amountRub },
    );
  }

  async voidPayment(
    profile: TelegramProfile,
    tournamentId: string,
    paymentId: string,
  ): Promise<TournamentPlayer> {
    return this.api.asUser<TournamentPlayer>(
      profile,
      "DELETE",
      `/tournaments/${tournamentId}/payments/${paymentId}`,
    );
  }

  async setPlace(
    profile: TelegramProfile,
    tournamentId: string,
    userId: string,
    place: number | null,
  ): Promise<TournamentPlayer> {
    return this.api.asUser<TournamentPlayer>(profile, "POST", `/tournaments/${tournamentId}/place`, {
      userId,
      place,
    });
  }

  async grant(
    profile: TelegramProfile,
    tournamentId: string,
    userId: string,
    achievementId: string,
  ): Promise<void> {
    await this.api.asUser(profile, "POST", "/achievements/grant", {
      userId,
      achievementId,
      tournamentId,
    });
  }

  async setPaidPlaces(
    profile: TelegramProfile,
    tournamentId: string,
    paidPlaces: number,
  ): Promise<void> {
    await this.api.asUser(profile, "PATCH", `/tournaments/${tournamentId}`, { paidPlaces });
  }

  async finish(
    profile: TelegramProfile,
    tournamentId: string,
  ): Promise<{ players: number; awarded: { points: number }[] }> {
    return this.api.asUser(profile, "POST", `/tournaments/${tournamentId}/finish`);
  }

  async reopen(profile: TelegramProfile, tournamentId: string): Promise<void> {
    await this.api.asUser(profile, "POST", `/tournaments/${tournamentId}/reopen`);
  }

  async saveScreens(
    profile: TelegramProfile,
    tournamentId: string,
    payload: {
      topicId?: number | null;
      boardMsgId?: number | null;
      cards?: { userId: string; msgId: number }[];
    },
  ): Promise<void> {
    await this.api.asUser(
      profile,
      "POST",
      `/tournaments/${tournamentId}/admin-screens`,
      payload,
    );
  }

  async findPlayer(profile: TelegramProfile, query: string): Promise<PublicUser | null> {
    const page = await this.api.asUser<{ items: PublicUser[] }>(
      profile,
      "GET",
      `/users?search=${encodeURIComponent(query)}&perPage=5`,
    );
    return page.items[0] ?? null;
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  board(detail: TournamentDetail, confirmFinish = false): Screen {
    const roster = seats(detail);
    const playing = roster.filter((seat) => seat.paid.entry);
    const placed = roster.filter((seat) => seat.place != null);
    const finished = detail.status === "finished";

    const text = [
      `🎲 <b>${escapeHtml(detail.title)}</b>`,
      `${clubDate(detail.startsAt)} · ${clubClock(detail.startsAt)}`,
      "",
      `Играют: <b>${playing.length}</b> · Фишек в игре: <b>${num(detail.chipsInPlay)}</b>`,
      `Касса: <b>${rub(detail.totalRub ?? 0)}</b>`,
      `Призовых мест: <b>${detail.paidPlaces}</b> · Первое место: <b>${points(detail.ratingPool)}</b>`,
      `Мест проставлено: <b>${placed.length}</b>`,
      ...(finished ? ["", "🏁 <b>Турнир завершён, рейтинг начислен.</b>"] : []),
      ...(confirmFinish
        ? ["", "Завершить турнир и начислить рейтинг? Это действие обратимо."]
        : []),
    ].join("\n");

    const keyboard = new InlineKeyboard();

    if (confirmFinish) {
      keyboard.text("✅ Да, завершить", "finyes").text("Отмена", "sync");
      return { text, keyboard };
    }

    if (finished) {
      keyboard.text("↩️ Вернуть в игру", "reopen").row().text("🔄 Обновить", "sync");
      return { text, keyboard };
    }

    keyboard
      .text(`🏅 Призовых мест: ${detail.paidPlaces}`, "pp")
      .row()
      .text("🔄 Обновить", "sync")
      .text("🏁 Завершить", "fin");
    return { text, keyboard };
  }

  paidPlacesChooser(detail: TournamentDetail): Screen {
    const keyboard = new InlineKeyboard()
      .text("9", "pp:9")
      .text("18", "pp:18")
      .text("27", "pp:27")
      .row()
      .text("−1", `pp:${Math.max(1, detail.paidPlaces - 1)}`)
      .text("+1", `pp:${detail.paidPlaces + 1}`)
      .row()
      .text("← Назад", "sync");

    return {
      text: [
        `🏅 <b>Призовых мест: ${detail.paidPlaces}</b>`,
        "",
        "Сколько мест получают рейтинг. Можно менять по ходу игры —",
        "рейтинг считается только в момент завершения турнира.",
      ].join("\n"),
      keyboard,
    };
  }

  card(seat: Seat, detail: TournamentDetail, prices: ClubSettings): Screen {
    const lines: string[] = [`👤 <b>${escapeHtml(seat.user.nickname)}</b>`];

    const tab: string[] = [];
    if (seat.paid.entry) tab.push("вход");
    if (seat.paid.addons > 0) tab.push(`адон ×${seat.paid.addons}`);
    if (seat.paid.drinks > 0) tab.push(`напиток ×${seat.paid.drinks}`);

    lines.push(
      tab.length > 0
        ? `${tab.join(", ")} — <b>${rub(seat.totalRub)}</b>`
        : "<i>ничего не оплачено</i>",
    );
    if (seat.chips > 0) lines.push(`Фишек: <b>${num(seat.chips)}</b>`);
    if (seat.place != null) {
      const earned = seat.ratingPoints != null ? ` · ${points(seat.ratingPoints)}` : "";
      lines.push(`Место: <b>${seat.place}</b>${earned}`);
    }

    const keyboard = new InlineKeyboard();

    if (detail.status !== "finished") {
      keyboard
        .text(`Вход ${prices.entryPriceRub}`, "p:entry")
        .text(`Адон ${prices.addonPriceRub}`, "p:addon")
        .text(`Напиток ${prices.drinkPriceRub}`, "p:drink")
        .row();

      if (seat.place == null) {
        keyboard.text(`🚪 Выбыл — ${nextPlace(detail)} место`, "bust");
      } else {
        keyboard.text("↩️ Вернуть в игру", "unbust");
      }

      keyboard.row().text("🏅 Ачивка", "ach");
      if (seat.lastPaymentId) keyboard.text("✖️ Отменить оплату", "undo");
    }

    return { text: lines.join("\n"), keyboard };
  }

  achievementChooser(seat: Seat, list: Achievement[]): Screen {
    const keyboard = new InlineKeyboard();
    for (const achievement of list.filter((row) => row.isActive).slice(0, 20)) {
      keyboard
        .text(
          fit(`${achievement.icon ?? "🏅"} ${achievement.title} (+${achievement.ratingPoints})`, 55),
          `a:${achievement.id}`,
        )
        .row();
    }
    keyboard.text("← Назад", "card");

    return {
      text: `🏅 <b>${escapeHtml(seat.user.nickname)}</b>\n\nЧто выдать?`,
      keyboard,
    };
  }
}

/**
 * One seat per player who is either signed up or has paid for something. Someone
 * who walked in without signing up appears as soon as their entry is charged.
 */
export function seats(detail: TournamentDetail): Seat[] {
  const placeByUser = new Map(detail.results.map((row) => [row.user.id, row.place]));
  const pointsByUser = new Map(detail.results.map((row) => [row.user.id, row.ratingPoints]));
  const byId = new Map<string, Seat>();

  for (const registration of detail.registrations) {
    if (registration.status !== "registered") continue;
    byId.set(registration.user.id, {
      user: registration.user,
      totalRub: 0,
      chips: 0,
      place: placeByUser.get(registration.user.id) ?? null,
      ratingPoints: pointsByUser.get(registration.user.id) ?? null,
      paid: { entry: false, addons: 0, drinks: 0 },
      lastPaymentId: null,
    });
  }

  for (const player of detail.players ?? []) {
    byId.set(player.user.id, {
      user: player.user,
      totalRub: player.totalRub,
      chips: player.chips,
      place: player.place ?? placeByUser.get(player.user.id) ?? null,
      ratingPoints: player.ratingPoints ?? null,
      paid: {
        entry: player.payments.some((payment) => payment.kind === "entry"),
        addons: player.payments.filter((payment) => payment.kind === "addon").length,
        drinks: player.payments.filter((payment) => payment.kind === "drink").length,
      },
      lastPaymentId: player.payments.at(-1)?.id ?? null,
    });
  }

  return [...byId.values()].sort((a, b) => {
    if (a.place != null && b.place != null) return a.place - b.place;
    if (a.place != null) return -1;
    if (b.place != null) return 1;
    return a.user.nickname.localeCompare(b.user.nickname, "ru");
  });
}

/**
 * The place the next player to bust out takes: the lowest one still free.
 *
 * Counting down from the field size is what a live table actually does — the
 * first player out of twelve finishes twelfth — and it means the admin never
 * types a number.
 */
export function nextPlace(detail: TournamentDetail): number {
  const taken = new Set(detail.results.map((row) => row.place));
  const playing = (detail.players ?? []).filter((player) =>
    player.payments.some((payment) => payment.kind === "entry"),
  ).length;

  const start = Math.max(playing, ...[...taken, 0]);
  for (let place = start; place >= 1; place -= 1) {
    if (!taken.has(place)) return place;
  }
  return 1;
}

/** Turns a seat back into the player it belongs to, for the card renderer. */
export function seatFor(detail: TournamentDetail, userId: string): Seat | null {
  return seats(detail).find((seat) => seat.user.id === userId) ?? null;
}
