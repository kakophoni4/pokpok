import type {
  Achievement,
  ClubSettings,
  PaymentKind,
  PublicUser,
  TournamentDetail,
  TournamentPlayer,
  TournamentSummary,
} from "@poker/contracts";
import { fieldSize, freePlaces, isEveningHand, nextPlace, stacksOf } from "@poker/contracts";
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
  paid: { entry: boolean; rebuys: number; addons: number; drinks: number };
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

  async till(profile: TelegramProfile): Promise<{ prices: ClubSettings; achievements: Achievement[] }> {
    const [prices, achievements] = await Promise.all([this.settings(profile), this.achievements(profile)]);
    return { prices, achievements };
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
    multiplier = 1,
    menuItemId?: string,
  ): Promise<TournamentPlayer> {
    return this.api.asUser<TournamentPlayer>(
      profile,
      "POST",
      `/tournaments/${tournamentId}/payments`,
      { userId, kind, amountRub, multiplier, ...(menuItemId ? { menuItemId } : {}) },
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

  async revokeLast(
    profile: TelegramProfile,
    tournamentId: string,
    userId: string,
    achievementId: string,
  ): Promise<boolean> {
    const detail = await this.detail(profile, tournamentId);
    const last = (detail.eveningGrants ?? [])
      .filter((row) => row.userId === userId && row.achievementId === achievementId)
      .at(-1);
    if (!last?.id) return false;
    await this.api.asUser(profile, "DELETE", `/achievements/grant/${last.id}`);
    return true;
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
      `Мест проставлено: <b>${placed.length}</b> из <b>${fieldSize(detail)}</b>`,
      ...(finished || nextPlace(detail) == null
        ? []
        : [`Следующий выбывший займёт <b>${nextPlace(detail)}</b> место`]),
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
        "Сколько мест получают рейтинг. Можно менять по ходу игры -",
        "рейтинг считается только в момент завершения турнира.",
      ].join("\n"),
      keyboard,
    };
  }

  card(seat: Seat, detail: TournamentDetail, prices: ClubSettings, achievements: Achievement[] = []): Screen {
    const lines: string[] = [`👤 <b>${escapeHtml(seat.user.nickname)}</b>`];

    const tab: string[] = [];
    if (seat.paid.entry) tab.push("вход");
    if (seat.paid.rebuys > 0) tab.push(`ребай ×${seat.paid.rebuys}`);
    if (seat.paid.addons > 0) tab.push(`адон ×${seat.paid.addons}`);
    if (seat.paid.drinks > 0) tab.push(`напиток ×${seat.paid.drinks}`);

    lines.push(
      tab.length > 0
        ? `${tab.join(", ")} - <b>${rub(seat.totalRub)}</b>`
        : "<i>ничего не оплачено</i>",
    );
    if (seat.chips > 0) lines.push(`Фишек: <b>${num(seat.chips)}</b>`);
    if (seat.place != null && seat.place <= detail.paidPlaces) {
      const earned = seat.ratingPoints != null ? ` · ${points(seat.ratingPoints)}` : "";
      lines.push(`Место: <b>${seat.place}</b>${earned}`);
    } else if (seat.place != null) {
      lines.push("<i>-</i>");
    } else {
      const upcoming = nextPlace(detail);
      lines.push(upcoming != null ? `<i>в игре · следующий: ${upcoming} место</i>` : "<i>в игре</i>");
    }

    const keyboard = new InlineKeyboard();

    if (detail.status !== "finished") {
      const extras = (prices.menuItems ?? []).filter((item) => item.isActive && !item.isFixed);
      const entry = prices.menuItems?.find((item) => item.isFixed && item.kind === "entry");

      keyboard.text(`Вход ${entry?.priceRub ?? prices.entryPriceRub}`, "p:entry:1").row();
      keyboard
        .text("Ребай ×1", "p:rebuy:1")
        .text("×2", "p:rebuy:2")
        .text("×3", "p:rebuy:3")
        .row();
      keyboard
        .text("Адон ×1", "p:addon:1")
        .text("×2", "p:addon:2")
        .text("×3", "p:addon:3")
        .row();

      for (const item of extras) {
        const label = item.isPromo
          ? item.title
          : item.priceRub > 0
            ? `${item.title} ${item.priceRub}`
            : item.title;
        keyboard.text(fit(label, 40), `m:${item.id}`).row();
      }

      const upcoming = nextPlace(detail);
      if (seat.place == null && upcoming != null) {
        keyboard.text(`Выбыл - ${upcoming} место`, "bust").row();
        keyboard.text("Другое место", "place");
      } else if (seat.place == null) {
        keyboard.text("Место", "place");
      } else {
        keyboard.text("Изменить место", "place").text("Вернуть в игру", "unbust");
      }

      keyboard.row();
      const grants = (detail.eveningGrants ?? []).filter((row) => row.userId === seat.user.id);
      const hands = achievements
        .filter(isEveningHand)
        .sort((a, b) => b.ratingPoints - a.ratingPoints)
        .slice(0, 6);
      hands.forEach((hand) => {
        const count = grants.filter((row) => row.achievementId === hand.id).length;
        const mark = count > 0 ? `×${count} ` : "";
        keyboard.text(fit(`${mark}${hand.icon ?? "🏅"} ${hand.title}`, 22), `a:${hand.id}`);
        if (count > 0) keyboard.text("−", `ar:${hand.id}`);
        keyboard.row();
      });
      keyboard.text("🏅 Другие ачивки", "ach");
      if (seat.lastPaymentId) keyboard.text("✖️ Отменить оплату", "undo");
    }

    return { text: lines.join("\n"), keyboard };
  }

  /**
   * Every place still free, deepest first, so a correction is a tap rather than
   * a retyped number. The player's current place is offered too — reselecting it
   * is harmless, and leaving it out would make the grid jump around.
   */
  placeChooser(seat: Seat, detail: TournamentDetail): Screen {
    const open = freePlaces(detail);
    const offered = seat.place == null ? open : [seat.place, ...open].sort((a, b) => b - a);

    const keyboard = new InlineKeyboard();
    offered.forEach((place, index) => {
      keyboard.text(`${place}`, `pl:${place}`);
      if (index % 5 === 4) keyboard.row();
    });

    keyboard.row().text("← Назад", "card");

    return {
      text: [`<b>${escapeHtml(seat.user.nickname)}</b>`, "", "Призовое место."].join("\n"),
      keyboard,
    };
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
      paid: { entry: false, rebuys: 0, addons: 0, drinks: 0 },
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
        rebuys: stacksOf(player.payments, "rebuy", detail.startingStack),
        addons: stacksOf(player.payments, "addon", detail.addonChips),
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

/** Turns a seat back into the player it belongs to, for the card renderer. */
export function seatFor(detail: TournamentDetail, userId: string): Seat | null {
  return seats(detail).find((seat) => seat.user.id === userId) ?? null;
}
