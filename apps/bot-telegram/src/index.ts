import type { PaymentKind, TournamentDetail } from "@poker/contracts";
import { isStaff, nextPlace } from "@poker/contracts";
import { Bot, GrammyError } from "grammy";
import type { Context } from "grammy";
import { AdminScreens, seatFor, seats } from "./admin.js";
import { Api, ApiError, type TelegramProfile } from "./api.js";
import { ClubInfo } from "./club.js";
import { loadConfig } from "./config.js";
import { escapeHtml, playerLabel, points, rub } from "./format.js";
import { LOGIN_CALLBACK, LoginConfirm } from "./login.js";
import { Notifier } from "./notifier.js";
import { PlayerScreens, type Screen } from "./player.js";

const config = loadConfig();
const api = new Api(config);
const club = new ClubInfo(api);
const player = new PlayerScreens(api, club, config.miniAppUrl);
const admin = new AdminScreens(api);
const login = new LoginConfirm(api);
const bot = new Bot(config.botToken);
const notifier = new Notifier(bot, api, config.miniAppUrl, (message) =>
  console.error(`[bot] ${message}`),
);

function profileOf(ctx: Context): TelegramProfile | null {
  const from = ctx.from;
  if (!from || from.is_bot) return null;
  return {
    id: from.id,
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
  };
}

/**
 * Telegram rejects an edit that would not change anything, and there is nothing
 * useful to do about it: the screen already shows what it should.
 */
async function edit(ctx: Context, screen: Screen): Promise<void> {
  try {
    await ctx.editMessageText(screen.text, {
      parse_mode: "HTML",
      reply_markup: screen.keyboard,
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    if (error instanceof GrammyError && error.description.includes("not modified")) return;
    throw error;
  }
}

async function editById(
  chatId: number,
  messageId: number,
  screen: Screen,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await bot.api.editMessageText(chatId, messageId, screen.text, {
        parse_mode: "HTML",
        reply_markup: screen.keyboard,
      });
      return;
    } catch (error) {
      if (error instanceof GrammyError && error.description.includes("not modified")) return;
      if (error instanceof GrammyError && error.description.includes("message to edit not found")) {
        return;
      }
      if (error instanceof GrammyError && error.error_code === 429) {
        const wait = Math.max(1, error.parameters.retry_after ?? 1);
        await delay(wait * 1000);
        continue;
      }
      console.error(`[bot] could not edit message ${messageId}:`, error);
      return;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Player: one screen, rewritten in place ───────────────────────────────────

async function sendScreen(ctx: Context, profile: TelegramProfile, route: string): Promise<void> {
  const screen = await player.render(route, profile);
  await ctx.reply(screen.text, {
    parse_mode: "HTML",
    reply_markup: screen.keyboard,
    link_preview_options: { is_disabled: true },
  });
}

async function sendHome(ctx: Context, profile: TelegramProfile): Promise<void> {
  await sendScreen(ctx, profile, "home");
}

bot.chatType("private").command(["start", "menu"], async (ctx) => {
  const profile = profileOf(ctx);
  if (!profile) return;

  // The website sends people here with a ticket to confirm.
  const payload = (typeof ctx.match === "string" ? ctx.match : "").trim();
  if (payload.startsWith("login_")) {
    const screen = await login.ask(payload.slice("login_".length));
    await ctx.reply(screen.text, { parse_mode: "HTML", reply_markup: screen.keyboard });
    return;
  }

  await sendHome(ctx, profile);
});

/** Typed shortcuts to the same screens the buttons open. */
const SHORTCUTS: Record<string, string> = {
  schedule: "sched",
  rating: "rate",
  me: "me",
  who: "who",
  club: "info",
};

bot
  .chatType("private")
  .command(Object.keys(SHORTCUTS), async (ctx) => {
    const profile = profileOf(ctx);
    const verb = ctx.message?.text?.slice(1).split(/[\s@]/)[0]?.toLowerCase();
    if (!profile || !verb) return;
    await sendScreen(ctx, profile, SHORTCUTS[verb] ?? "home");
  });

bot.chatType("private").callbackQuery(LOGIN_CALLBACK, async (ctx) => {
  const profile = profileOf(ctx);
  const code = ctx.match?.[2];
  if (!profile || !code) return;

  const approve = ctx.match?.[1] === "y";
  await login.settle(code, profile, approve);
  await ctx.answerCallbackQuery({ text: approve ? "Вход подтверждён" : "Вход отклонён" });
  await edit(ctx, login.answered(approve));
});

bot.chatType("private").callbackQuery(/^nav:(.+)$/, async (ctx) => {
  const profile = profileOf(ctx);
  const route = ctx.match?.[1];
  if (!profile || !route) return;

  await ctx.answerCallbackQuery();
  await edit(ctx, await player.render(route, profile));
});

bot.chatType("private").callbackQuery(/^tog:(.+)$/, async (ctx) => {
  const profile = profileOf(ctx);
  const tournamentId = ctx.match?.[1];
  if (!profile || !tournamentId) return;

  const toast = await player.toggleRegistration(tournamentId, profile);
  await ctx.answerCallbackQuery({ text: toast });
  await edit(ctx, await player.render("sched", profile));
});

bot.chatType("private").callbackQuery(/^plr:(.+)$/, async (ctx) => {
  const userId = ctx.match?.[1];
  if (!userId) return;

  await ctx.answerCallbackQuery({ text: await player.playerToast(userId), show_alert: true });
});

// Anything else typed in a private chat simply reopens the menu.
bot.chatType("private").on("message:text", async (ctx) => {
  const profile = profileOf(ctx);
  if (profile) await sendHome(ctx, profile);
});

// ─── Admin: the game topic in the supergroup ──────────────────────────────────

const GROUP: ("group" | "supergroup")[] = ["group", "supergroup"];

async function requireStaff(profile: TelegramProfile): Promise<void> {
  const session = await api.session(profile);
  if (!isStaff(session.role)) {
    throw new ApiError(403, "FORBIDDEN", "Этот раздел для персонала клуба");
  }
}

/**
 * Evening desk lives on the site. Telegram groups are not a second cash desk.
 */
async function openGame(ctx: Context, profile: TelegramProfile): Promise<void> {
  await requireStaff(profile);
  await ctx.reply(
    [
      "Вечер ведётся на сайте — топики в Telegram больше не открываем.",
      "",
      `Хостес: ${config.webUrl}/admin`,
    ].join("\n"),
  );
}

/** Adds a card for every player who does not have one yet. */
async function postMissingCards(
  chatId: number,
  profile: TelegramProfile,
  detail: TournamentDetail,
  topicId: number | null,
): Promise<number> {
  const { prices, achievements } = await admin.till(profile);
  const known = new Set((detail.adminScreens?.cards ?? []).map((card) => card.userId));
  const fresh: { userId: string; msgId: number }[] = [];

  for (const seat of seats(detail)) {
    if (known.has(seat.user.id)) continue;

    const card = admin.card(seat, detail, prices, achievements);
    const posted = await bot.api.sendMessage(chatId, card.text, {
      parse_mode: "HTML",
      reply_markup: card.keyboard,
      ...(topicId == null ? {} : { message_thread_id: topicId }),
    });
    fresh.push({ userId: seat.user.id, msgId: posted.message_id });
  }

  if (fresh.length > 0) await admin.saveScreens(profile, detail.id, { cards: fresh });
  return fresh.length;
}

/** Redraws the board and, optionally, every card — the "Обновить" escape hatch. */
async function refresh(
  chatId: number,
  profile: TelegramProfile,
  detail: TournamentDetail,
  cardsToo: boolean,
): Promise<void> {
  const boardMsgId = detail.adminScreens?.boardMsgId;
  if (boardMsgId != null) await editById(chatId, boardMsgId, admin.board(detail));

  if (!cardsToo) return;

  const { prices, achievements } = await admin.till(profile);
  for (const card of detail.adminScreens?.cards ?? []) {
    const seat = seatFor(detail, card.userId);
    if (seat) await editById(chatId, card.msgId, admin.card(seat, detail, prices, achievements));
    await delay(50);
  }
}

type Target =
  | { kind: "board"; detail: TournamentDetail }
  | { kind: "card"; detail: TournamentDetail; userId: string; msgId: number };

/**
 * Works out what was pressed from where it was pressed: the topic identifies the
 * evening and the message identifies the player. That keeps callback data down to
 * the action itself, well inside Telegram's 64-byte budget, and keeps working
 * after a restart because both live in the database.
 */
async function resolve(ctx: Context, profile: TelegramProfile): Promise<Target | null> {
  const message = ctx.callbackQuery?.message;
  const topicId = message?.message_thread_id;
  if (!message || topicId == null) return null;

  const detail = await admin.byTopic(profile, topicId);
  if (message.message_id === detail.adminScreens?.boardMsgId) return { kind: "board", detail };

  const card = detail.adminScreens?.cards.find((row) => row.msgId === message.message_id);
  if (!card) return null;
  return { kind: "card", detail, userId: card.userId, msgId: card.msgId };
}

const PRICE_OF: Record<
  PaymentKind,
  (prices: {
    entryPriceRub: number;
    rebuyPriceRub: number;
    addonPriceRub: number;
    drinkPriceRub: number;
  }) => number
> = {
  entry: (prices) => prices.entryPriceRub,
  rebuy: (prices) => prices.rebuyPriceRub,
  addon: (prices) => prices.addonPriceRub,
  drink: (prices) => prices.drinkPriceRub,
  other: () => 0,
};

const KIND_LABEL: Record<PaymentKind, string> = {
  entry: "Вход",
  rebuy: "Ребай",
  addon: "Адон",
  drink: "Напиток",
  other: "Прочее",
};

bot.chatType(GROUP).on("callback_query:data", async (ctx) => {
  const profile = profileOf(ctx);
  if (!profile) return;

  await requireStaff(profile);

  const data = ctx.callbackQuery.data;
  const target = await resolve(ctx, profile);
  if (!target) {
    await ctx.answerCallbackQuery({
      text: "Этот экран больше не привязан к турниру. Ведите вечер на сайте клуба.",
      show_alert: true,
    });
    return;
  }

  const chatId = ctx.chat!.id;
  const { detail } = target;

  // ── Board ──
  if (target.kind === "board") {
    if (data === "sync") {
      const fresh = await admin.detail(profile, detail.id);
      await ctx.answerCallbackQuery({ text: "Обновлено" });
      await postMissingCards(chatId, profile, fresh, fresh.adminScreens?.topicId ?? null);
      await refresh(chatId, profile, await admin.detail(profile, detail.id), true);
      return;
    }

    if (data === "pp") {
      await ctx.answerCallbackQuery();
      await edit(ctx, admin.paidPlacesChooser(detail));
      return;
    }

    if (data.startsWith("pp:")) {
      const places = Number(data.slice(3));
      await admin.setPaidPlaces(profile, detail.id, places);
      await ctx.answerCallbackQuery({ text: `Призовых мест: ${places}` });
      await edit(ctx, admin.board(await admin.detail(profile, detail.id)));
      return;
    }

    if (data === "fin") {
      await ctx.answerCallbackQuery();
      await edit(ctx, admin.board(detail, true));
      return;
    }

    if (data === "finyes") {
      const summary = await admin.finish(profile, detail.id);
      const top = summary.awarded.reduce((best, row) => Math.max(best, row.points), 0);
      await ctx.answerCallbackQuery({
        text: `Турнир завершён. Игроков: ${summary.players}, первое место: ${points(top)}`,
        show_alert: true,
      });
      await refresh(chatId, profile, await admin.detail(profile, detail.id), true);
      return;
    }

    if (data === "reopen") {
      await admin.reopen(profile, detail.id);
      await ctx.answerCallbackQuery({ text: "Рейтинг снят, турнир снова в игре" });
      await refresh(chatId, profile, await admin.detail(profile, detail.id), true);
      return;
    }

    await ctx.answerCallbackQuery();
    return;
  }

  // ── Player card ──
  const { userId } = target;

  if (data.startsWith("p:")) {
    const match = data.match(/^p:(entry|rebuy|addon|drink)(?::([1-3]))?$/);
    if (!match) {
      await ctx.answerCallbackQuery();
      return;
    }
    const kind = match[1] as PaymentKind;
    const multiplier = Number(match[2] ?? 1);
    const prices = await admin.settings(profile);
    const amount = PRICE_OF[kind](prices) * multiplier;

    await admin.charge(profile, detail.id, userId, kind, amount, multiplier);
    const toast =
      multiplier > 1 ? `${KIND_LABEL[kind]} ×${multiplier}: ${rub(amount)}` : `${KIND_LABEL[kind]}: ${rub(amount)}`;
    await ctx.answerCallbackQuery({ text: toast });
    await redrawEvening(chatId, profile, detail.id);
    return;
  }

  if (data.startsWith("m:")) {
    const itemId = data.slice(2);
    const prices = await admin.settings(profile);
    const item = prices.menuItems?.find((row) => row.id === itemId);
    if (!item) {
      await ctx.answerCallbackQuery({ text: "Позиция больше не в меню" });
      return;
    }
    await admin.charge(profile, detail.id, userId, item.kind, item.priceRub, 1, item.id);
    await ctx.answerCallbackQuery({ text: `${item.title}: ${rub(item.priceRub)}` });
    await redrawEvening(chatId, profile, detail.id);
    return;
  }

  if (data === "bust") {
    const place = nextPlace(detail);
    if (place == null) {
      await ctx.answerCallbackQuery({ text: "Призовые места уже заняты" });
      return;
    }
    await admin.setPlace(profile, detail.id, userId, place);
    await ctx.answerCallbackQuery({ text: `Место ${place} записано` });
    const fresh = await admin.detail(profile, detail.id);
    const { prices, achievements } = await admin.till(profile);
    const seat = seatFor(fresh, userId);
    if (seat) await edit(ctx, admin.card(seat, fresh, prices, achievements));
    await refresh(chatId, profile, fresh, true);
    return;
  }

  if (data === "unbust") {
    await admin.setPlace(profile, detail.id, userId, null);
    await ctx.answerCallbackQuery({ text: "Место снято" });
    await redrawEvening(chatId, profile, detail.id);
    return;
  }

  if (data === "place") {
    const seat = seatFor(detail, userId);
    if (!seat) return;
    await ctx.answerCallbackQuery();
    await edit(ctx, admin.placeChooser(seat, detail));
    return;
  }

  const chosenPlace = data.match(/^pl:(\d+)$/);
  if (chosenPlace) {
    const place = Number(chosenPlace[1]);
    await admin.setPlace(profile, detail.id, userId, place);
    await ctx.answerCallbackQuery({ text: `Место ${place} записано` });
    const fresh = await admin.detail(profile, detail.id);
    const { prices, achievements } = await admin.till(profile);
    const seat = seatFor(fresh, userId);
    if (seat) await edit(ctx, admin.card(seat, fresh, prices, achievements));
    await refresh(chatId, profile, fresh, true);
    return;
  }

  if (data === "ach") {
    const seat = seatFor(detail, userId);
    if (!seat) return;
    await ctx.answerCallbackQuery();
    await edit(ctx, admin.achievementChooser(seat, await admin.achievements(profile)));
    return;
  }

  if (data.startsWith("ar:")) {
    const achievementId = data.slice(3);
    const removed = await admin.revokeLast(profile, detail.id, userId, achievementId);
    await ctx.answerCallbackQuery({ text: removed ? "Ачивка снята" : "Снимать нечего" });
    await redrawEvening(chatId, profile, detail.id);
    return;
  }

  if (data.startsWith("a:")) {
    const achievementId = data.slice(2);
    await admin.grant(profile, detail.id, userId, achievementId);
    await ctx.answerCallbackQuery({ text: "Ачивка выдана" });
    await redrawEvening(chatId, profile, detail.id);
    return;
  }

  if (data === "undo") {
    const seat = seatFor(detail, userId);
    if (!seat?.lastPaymentId) {
      await ctx.answerCallbackQuery({ text: "Отменять нечего" });
      return;
    }
    await admin.voidPayment(profile, detail.id, seat.lastPaymentId);
    await ctx.answerCallbackQuery({ text: "Последняя оплата отменена" });
    await redrawEvening(chatId, profile, detail.id);
    return;
  }

  if (data === "card") {
    await ctx.answerCallbackQuery();
    await redrawEvening(chatId, profile, detail.id);
    return;
  }

  await ctx.answerCallbackQuery();
});

async function redrawEvening(
  chatId: number,
  profile: TelegramProfile,
  tournamentId: string,
): Promise<void> {
  await refresh(chatId, profile, await admin.detail(profile, tournamentId), true);
}

/**
 * Typed commands, for the amounts and places the buttons do not cover.
 *
 * Parsed by hand rather than through grammY's command router: Telegram only marks
 * Latin words after a slash as commands, and the club's admins write in Russian.
 */
const COMMAND = /^\/(вход|адон|ребай|напиток|место|ачивка|игрок|игра|обновить|entry|addon|rebuy|drink|place|ach|player|game|sync)(?:@\S+)?\s*(.*)$/is;

bot.chatType(GROUP).on("message:text", async (ctx) => {
  const profile = profileOf(ctx);
  if (!profile) return;

  const match = COMMAND.exec(ctx.message.text.trim());
  if (!match) return;

  const verb = match[1]!.toLowerCase();
  const rest = (match[2] ?? "").trim();

  if (verb === "игра" || verb === "game") {
    await openGame(ctx, profile);
    return;
  }

  await requireStaff(profile);

  const topicId = ctx.message.message_thread_id;
  if (topicId == null) {
    await ctx.reply("Эту команду нужно писать в теме турнира.");
    return;
  }
  const detail = await admin.byTopic(profile, topicId);

  if (verb === "обновить" || verb === "sync") {
    await postMissingCards(ctx.chat.id, profile, detail, topicId);
    await refresh(ctx.chat.id, profile, await admin.detail(profile, detail.id), true);
    await ctx.reply("Обновил доску и карточки.");
    return;
  }

  if (verb === "игрок" || verb === "player") {
    const found = await admin.findPlayer(profile, rest.replace(/^@/, ""));
    if (!found) {
      await ctx.reply(`Не нашёл игрока «${rest}». Он должен хотя бы раз открыть бота.`);
      return;
    }
    await api.asUser(profile, "POST", `/tournaments/${detail.id}/register`, {
      userId: found.id,
      source: "admin",
    }).catch(() => undefined);

    const fresh = await admin.detail(profile, detail.id);
    const added = await postMissingCards(ctx.chat.id, profile, fresh, topicId);
    await ctx.reply(
      added > 0
        ? `Добавил ${playerLabel(found)} - карточка ниже.`
        : `${playerLabel(found)} уже в теме турнира.`,
    );
    await refresh(ctx.chat.id, profile, await admin.detail(profile, detail.id), false);
    return;
  }

  // The remaining commands act on a player, named by replying to their card.
  const replyTo = ctx.message.reply_to_message?.message_id;
  const card = detail.adminScreens?.cards.find((row) => row.msgId === replyTo);
  const byMention = rest.match(/@([\w\d_]+)/);

  let userId = card?.userId ?? null;
  if (userId == null && byMention) {
    const found = await admin.findPlayer(profile, byMention[1]!);
    userId = found?.id ?? null;
  }

  if (userId == null) {
    await ctx.reply("Ответьте этой командой на карточку игрока или укажите его через @ник.");
    return;
  }

  const amount = Number((rest.match(/-?\d+/) ?? [])[0] ?? Number.NaN);

  if (verb === "место" || verb === "place") {
    const place = Number.isFinite(amount) ? amount : nextPlace(detail);
    if (place == null) {
      await ctx.reply("Призовые места уже заняты.");
      return;
    }
    await admin.setPlace(profile, detail.id, userId, place);
    await ctx.reply(`Записал ${place} место.`);
  } else if (verb === "ачивка" || verb === "ach") {
    const wanted = rest.replace(/@[\w\d_]+/g, "").trim().toLowerCase();
    const list = await admin.achievements(profile);
    const found = list.find((row) => row.title.toLowerCase().includes(wanted) && wanted.length > 0);
    if (!found) {
      await ctx.reply(
        `Не нашёл ачивку «${wanted}». Доступны: ${list.map((row) => row.title).join(", ")}`,
      );
      return;
    }
    await admin.grant(profile, detail.id, userId, found.id);
    await ctx.reply(`Выдал «${found.title}».`);
  } else {
    const kind: PaymentKind =
      verb === "вход" || verb === "entry"
        ? "entry"
        : verb === "ребай" || verb === "rebuy"
          ? "rebuy"
          : verb === "адон" || verb === "addon"
            ? "addon"
            : "drink";

    const prices = await admin.settings(profile);
    const times = Number((rest.match(/[x×]\s*([1-9]|10)/i) ?? [])[1] ?? 1);
    const value =
      Number.isFinite(amount) && amount >= 0 ? amount : PRICE_OF[kind](prices) * times;
    await admin.charge(profile, detail.id, userId, kind, value, times);
    await ctx.reply(
      times > 1
        ? `${KIND_LABEL[kind]} ×${times}: ${rub(value)}.`
        : `${KIND_LABEL[kind]}: ${rub(value)}.`,
    );
  }

  await redrawEvening(ctx.chat.id, profile, detail.id);
});

bot.catch(async ({ ctx, error }) => {
  const message =
    error instanceof ApiError
      ? error.message
      : "Что-то пошло не так. Попробуйте ещё раз или откройте сайт клуба.";

  console.error("[bot] handler failed:", error);

  try {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: message, show_alert: true });
    else await ctx.reply(escapeHtml(message));
  } catch {
    // The user may have blocked the bot; swallow to keep the process alive.
  }
});

await bot.api.setMyCommands([
  { command: "start", description: "Меню клуба" },
  { command: "schedule", description: "Расписание игр" },
  { command: "rating", description: "Рейтинг сезона" },
  { command: "me", description: "Мой профиль" },
  { command: "who", description: "Кто записан" },
  { command: "club", description: "О клубе" },
]);
await bot.api.setMyCommands([], { scope: { type: "all_group_chats" } });

/**
 * The bot's own profile text. It is the first thing a new player sees — before
 * any button exists to press — so it is worth setting from code rather than
 * leaving whatever was typed into BotFather once.
 */
const PROFILE_TEXTS = {
  short: "Клуб спортивного покера: расписание, запись за стол и рейтинг сезона.",
  full: [
    "Клуб спортивного покера.",
    "",
    "Здесь вы записываетесь на турниры, смотрите состав вечера и следите за рейтингом сезона.",
    "Нажмите «Начать» — меню откроется само.",
  ].join("\n"),
};

for (const [what, set] of [
  ["short description", () => bot.api.setMyShortDescription(PROFILE_TEXTS.short)],
  ["description", () => bot.api.setMyDescription(PROFILE_TEXTS.full)],
  [
    "Mini App menu button",
    () =>
      bot.api.setChatMenuButton({
        menu_button: { type: "web_app", text: "Клуб", web_app: { url: config.miniAppUrl } },
      }),
  ],
] as const) {
  try {
    await set();
  } catch (error) {
    // Telegram rate-limits profile edits; a restart must not die over cosmetics.
    console.error(`[bot] could not set ${what}:`, error);
  }
}

const stop = () => {
  notifier.stop();
  void bot.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

console.log(`[bot] starting, API at ${config.apiBase}`);
await bot.start({
  onStart: (info) => {
    console.log(`[bot] @${info.username} is listening`);
    notifier.start();
  },
});
