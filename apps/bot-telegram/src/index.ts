import type {
  LeaderboardRow,
  PlayerStats,
  RegistrationView,
  TournamentSummary,
} from "@poker/contracts";
import { Bot, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { Api, ApiError, type TelegramProfile } from "./api.js";
import { loadConfig } from "./config.js";
import {
  escapeHtml,
  formatLeaderboard,
  formatMyStats,
  formatRoster,
  formatSchedule,
  formatWhen,
  HELP_TEXT,
} from "./format.js";

const config = loadConfig();
const api = new Api(config);
const bot = new Bot(config.botToken);

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

/** Buttons for signing up straight from the schedule message. */
function scheduleKeyboard(tournaments: TournamentSummary[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const tournament of tournaments.slice(0, 6)) {
    const signedUp =
      tournament.myRegistration != null && tournament.myRegistration.status !== "cancelled";
    const label = signedUp
      ? `❌ Отменить: ${tournament.title}`
      : `✅ Записаться: ${tournament.title}`;

    keyboard
      .text(trim(label, 60), `${signedUp ? "cancel" : "join"}:${tournament.id}`)
      .row();
  }

  keyboard.url("Открыть сайт клуба", config.webUrl);
  return keyboard;
}

function trim(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

async function upcoming(profile: TelegramProfile): Promise<TournamentSummary[]> {
  return api.asUser<TournamentSummary[]>(profile, "GET", "/tournaments?scope=upcoming");
}

bot.command("start", async (ctx) => {
  const profile = profileOf(ctx);
  if (!profile) return;

  const session = await api.session(profile);
  await ctx.reply(
    [
      `Привет, ${escapeHtml(session.nickname)}!`,
      "",
      "Это бот клуба спортивного покера: расписание, запись на турниры и рейтинг.",
      "Игра ведётся без денежных ставок.",
      "",
      HELP_TEXT,
    ].join("\n"),
    { parse_mode: "HTML" },
  );
});

bot.command("help", (ctx) => ctx.reply(HELP_TEXT, { parse_mode: "HTML" }));

bot.command(["schedule", "games"], async (ctx) => {
  const profile = profileOf(ctx);
  if (!profile) return;

  const tournaments = await upcoming(profile);
  await ctx.reply(formatSchedule(tournaments), {
    parse_mode: "HTML",
    reply_markup: tournaments.length > 0 ? scheduleKeyboard(tournaments) : undefined,
  });
});

bot.command("rating", async (ctx) => {
  const profile = profileOf(ctx);
  if (!profile) return;

  const [session, rows] = await Promise.all([
    api.session(profile),
    api.public<LeaderboardRow[]>("/rating/leaderboard?scope=season"),
  ]);

  await ctx.reply(formatLeaderboard(rows, session.userId), { parse_mode: "HTML" });
});

bot.command(["me", "stats"], async (ctx) => {
  const profile = profileOf(ctx);
  if (!profile) return;

  const stats = await api.asUser<PlayerStats>(profile, "GET", "/rating/me");
  await ctx.reply(formatMyStats(stats), { parse_mode: "HTML" });
});

bot.command(["who", "roster"], async (ctx) => {
  const profile = profileOf(ctx);
  if (!profile) return;

  const tournaments = await upcoming(profile);
  if (tournaments.length === 0) {
    await ctx.reply("Пока нет запланированных турниров.");
    return;
  }

  // One tournament: answer straight away instead of asking which one.
  if (tournaments.length === 1) {
    await replyWithRoster(ctx, tournaments[0]!);
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const tournament of tournaments.slice(0, 8)) {
    keyboard
      .text(trim(`${tournament.title} — ${formatWhen(tournament.startsAt)}`, 60), `who:${tournament.id}`)
      .row();
  }

  await ctx.reply("Кто записан — выберите турнир:", { reply_markup: keyboard });
});

bot.callbackQuery(/^join:(.+)$/, async (ctx) => {
  const profile = profileOf(ctx);
  const tournamentId = ctx.match?.[1];
  if (!profile || !tournamentId) return;

  const result = await api.asUser<{ status: string; waitlistPosition: number | null }>(
    profile,
    "POST",
    `/tournaments/${tournamentId}/register`,
    { source: "tg_bot" },
  );

  await ctx.answerCallbackQuery(
    result.status === "waitlist"
      ? `Мест нет — вы в листе ожидания №${result.waitlistPosition}`
      : "Готово, вы записаны",
  );
  await refreshSchedule(ctx, profile);
});

bot.callbackQuery(/^cancel:(.+)$/, async (ctx) => {
  const profile = profileOf(ctx);
  const tournamentId = ctx.match?.[1];
  if (!profile || !tournamentId) return;

  await api.asUser(profile, "DELETE", `/tournaments/${tournamentId}/register`);
  await ctx.answerCallbackQuery("Запись отменена");
  await refreshSchedule(ctx, profile);
});

bot.callbackQuery(/^who:(.+)$/, async (ctx) => {
  const profile = profileOf(ctx);
  const tournamentId = ctx.match?.[1];
  if (!profile || !tournamentId) return;

  await ctx.answerCallbackQuery();

  const tournaments = await upcoming(profile);
  const tournament = tournaments.find((candidate) => candidate.id === tournamentId);
  if (!tournament) {
    await ctx.reply("Турнир не найден — возможно, он уже прошёл.");
    return;
  }

  await replyWithRoster(ctx, tournament);
});

async function replyWithRoster(ctx: Context, tournament: TournamentSummary): Promise<void> {
  const registrations = await api.public<RegistrationView[]>(
    `/tournaments/${tournament.id}/registrations`,
  );
  await ctx.reply(formatRoster(tournament, registrations), { parse_mode: "HTML" });
}

/** Rewrites the schedule message in place so the buttons match reality. */
async function refreshSchedule(ctx: Context, profile: TelegramProfile): Promise<void> {
  const tournaments = await upcoming(profile);

  try {
    await ctx.editMessageText(formatSchedule(tournaments), {
      parse_mode: "HTML",
      reply_markup: scheduleKeyboard(tournaments),
    });
  } catch {
    // Telegram rejects an edit when nothing changed; nothing to do about it.
  }
}

bot.catch(async ({ ctx, error }) => {
  const message =
    error instanceof ApiError
      ? error.message
      : "Что-то пошло не так. Попробуйте позже или откройте сайт клуба.";

  console.error("[bot] handler failed:", error);

  try {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: message, show_alert: true });
    else await ctx.reply(message);
  } catch {
    // The user may have blocked the bot; swallow to keep the process alive.
  }
});

await bot.api.setMyCommands([
  { command: "schedule", description: "Расписание и запись на турниры" },
  { command: "rating", description: "Рейтинг сезона" },
  { command: "me", description: "Моя статистика" },
  { command: "who", description: "Кто записан на турнир" },
  { command: "help", description: "Справка" },
]);

const stop = () => void bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

console.log(`[bot] starting, API at ${config.apiBase}`);
await bot.start({
  onStart: (info) => console.log(`[bot] @${info.username} is listening`),
});
