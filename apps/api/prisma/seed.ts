/**
 * Demo data for local development.
 *
 * Produces a season that already looks lived-in: past tournaments with real
 * standings, rating computed by the same engine the API uses, upcoming events
 * with sign-ups and a waiting list, plus an achievement catalogue.
 *
 * Run with: pnpm db:seed
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_RATING_CONFIG, RatingConfig } from "@poker/contracts";
import { scoreTournament, summarizeLedger } from "@poker/rating";
import { PrismaClient } from "../src/generated/prisma/client";

loadEnv({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Fixed seed so repeated runs produce identical standings. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const random = makeRandom(20260824);

const PLAYERS = [
  { nickname: "Ferz", displayName: "Артём Фёдоров", role: "admin" as const },
  { nickname: "Kate_AA", displayName: "Екатерина Лапина", role: "moderator" as const },
  { nickname: "Sanya_River", displayName: "Александр Крылов", role: "player" as const },
  { nickname: "Nikita_NL", displayName: "Никита Орлов", role: "player" as const },
  { nickname: "MashaBluff", displayName: "Мария Гущина", role: "player" as const },
  { nickname: "DenisPro", displayName: "Денис Ковалёв", role: "player" as const },
  { nickname: "OlegFold", displayName: "Олег Ситников", role: "player" as const },
  { nickname: "Ira_Chips", displayName: "Ирина Белова", role: "player" as const },
  { nickname: "PavelShark", displayName: "Павел Дроздов", role: "player" as const },
  { nickname: "Timur_TT", displayName: "Тимур Аскаров", role: "player" as const },
  { nickname: "LenaFlush", displayName: "Елена Кириллова", role: "player" as const },
  { nickname: "Grisha_UTG", displayName: "Григорий Ланин", role: "player" as const },
  { nickname: "Vika_Nuts", displayName: "Виктория Панова", role: "player" as const },
  { nickname: "Roma_Allin", displayName: "Роман Ефимов", role: "player" as const },
];

const ACHIEVEMENTS = [
  {
    code: "first_win",
    title: "Первая победа",
    description: "Выиграть свой первый турнир клуба",
    icon: "🥇",
    ratingPoints: 50,
    isRepeatable: false,
    rule: { kind: "wins_count", threshold: 1 } as const,
  },
  {
    code: "three_wins",
    title: "Триумфатор",
    description: "Три победы в турнирах за сезон",
    icon: "🏆",
    ratingPoints: 120,
    isRepeatable: false,
    rule: { kind: "wins_count", threshold: 3 } as const,
  },
  {
    code: "regular_10",
    title: "Постоянный игрок",
    description: "Сыграть 10 турниров",
    icon: "🎯",
    ratingPoints: 40,
    isRepeatable: false,
    rule: { kind: "games_played", threshold: 10 } as const,
  },
  {
    code: "podium_5",
    title: "Хозяин подиума",
    description: "Пять раз попасть в топ-3",
    icon: "🥈",
    ratingPoints: 80,
    isRepeatable: false,
    rule: { kind: "top3_count", threshold: 5 } as const,
  },
  {
    code: "streak_5",
    title: "Ни одной пропущенной",
    description: "Пять турниров подряд без пропусков",
    icon: "🔥",
    ratingPoints: 60,
    isRepeatable: true,
    rule: { kind: "attendance_streak", threshold: 5 } as const,
  },
  {
    code: "bounty_hunter",
    title: "Охотник за головами",
    description: "20 нокаутов суммарно",
    icon: "🎣",
    ratingPoints: 70,
    isRepeatable: false,
    rule: { kind: "knockouts_total", threshold: 20 } as const,
  },
  {
    code: "season_champion",
    title: "Чемпион сезона",
    description: "Первое место в итоговом рейтинге сезона",
    icon: "👑",
    ratingPoints: 300,
    isRepeatable: true,
    rule: { kind: "season_rank", maxRank: 1 } as const,
  },
  {
    code: "club_helper",
    title: "Душа клуба",
    description: "Выдаётся вручную за помощь в организации игр",
    icon: "🤝",
    ratingPoints: 100,
    isRepeatable: true,
    rule: null,
  },
];

const PAST_TOURNAMENTS = [
  { title: "Weekly Freezeout #12", daysAgo: 42, multiplier: 1, field: 14 },
  { title: "Weekly Freezeout #13", daysAgo: 35, multiplier: 1, field: 12 },
  { title: "Deepstack Sunday", daysAgo: 28, multiplier: 1.5, field: 13 },
  { title: "Weekly Freezeout #14", daysAgo: 21, multiplier: 1, field: 11 },
  { title: "Клубный мейджор «Осень»", daysAgo: 14, multiplier: 2, field: 14 },
  { title: "Weekly Freezeout #15", daysAgo: 7, multiplier: 1, field: 12 },
];

const UPCOMING_TOURNAMENTS = [
  { title: "Weekly Freezeout #16", inDays: 2, capacity: 12, multiplier: 1, signUps: 9 },
  { title: "PLO Night", inDays: 5, capacity: 8, multiplier: 1, signUps: 10, gameType: "plo" as const },
  { title: "Deepstack Sunday", inDays: 9, capacity: 16, multiplier: 1.5, signUps: 5 },
  { title: "Клубный мейджор «Зима»", inDays: 23, capacity: 24, multiplier: 2, signUps: 3 },
];

async function main(): Promise<void> {
  console.log("Cleaning previous demo data…");
  // Order matters: children before parents, since not everything cascades.
  await prisma.outbox.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ratingEvent.deleteMany();
  await prisma.userSeasonStats.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.result.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.season.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.linkToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.identity.deleteMany();
  await prisma.user.deleteMany();

  const ratingConfig: RatingConfig = {
    ...DEFAULT_RATING_CONFIG,
    // Only the ten strongest results count, so missing a week is survivable.
    bestOfCount: 10,
    knockoutPoints: 2,
  };

  const season = await prisma.season.create({
    data: {
      title: "Сезон 2026",
      startsAt: new Date("2026-01-15T00:00:00Z"),
      endsAt: new Date("2026-12-20T00:00:00Z"),
      isActive: true,
      ratingConfig: ratingConfig as never,
    },
  });

  const venue = await prisma.venue.create({
    data: {
      title: "Покер-клуб «Роял»",
      address: "Москва, ул. Тверская, 18",
      geoLat: 55.764,
      geoLon: 37.606,
    },
  });

  console.log("Creating players…");
  const users = [];
  for (const [index, player] of PLAYERS.entries()) {
    users.push(
      await prisma.user.create({
        data: {
          nickname: player.nickname,
          displayName: player.displayName,
          role: player.role,
          identities: {
            create: {
              provider: "telegram",
              // Synthetic ids: a real Telegram login overwrites nothing here.
              providerUserId: String(900_000_000 + index),
              providerUsername: player.nickname.toLowerCase(),
            },
          },
        },
      }),
    );
  }

  console.log("Creating achievements…");
  const achievements = [];
  for (const achievement of ACHIEVEMENTS) {
    achievements.push(
      await prisma.achievement.create({
        data: {
          code: achievement.code,
          title: achievement.title,
          description: achievement.description,
          icon: achievement.icon,
          ratingPoints: achievement.ratingPoints,
          isRepeatable: achievement.isRepeatable,
          rule: achievement.rule as never,
        },
      }),
    );
  }

  console.log("Playing out past tournaments…");
  const admin = users[0]!;

  for (const template of PAST_TOURNAMENTS) {
    const startsAt = daysFromNow(-template.daysAgo, 19);
    const tournament = await prisma.tournament.create({
      data: {
        seasonId: season.id,
        venueId: venue.id,
        title: template.title,
        description: "Спортивный покер без денежных ставок. Регистрация до старта.",
        gameType: "nlh",
        startsAt,
        regOpensAt: daysFromNow(-template.daysAgo - 7, 12),
        regClosesAt: startsAt,
        capacity: 16,
        buyinChips: 20_000,
        ratingMultiplier: template.multiplier,
        status: "finished",
      },
    });

    const field = pickPlayers(users, template.field);
    const standings = shuffle(field).map((user, index) => ({
      userId: user.id,
      place: index + 1,
      knockouts: index < 4 ? Math.round(random() * 4) : Math.round(random() * 2),
    }));

    const scored = scoreTournament({
      standings,
      multiplier: template.multiplier,
      config: ratingConfig,
    });

    await prisma.registration.createMany({
      data: standings.map((entry) => ({
        tournamentId: tournament.id,
        userId: entry.userId,
        status: "checked_in" as const,
        source: "web" as const,
      })),
    });
    await prisma.result.createMany({
      data: standings.map((entry) => ({
        tournamentId: tournament.id,
        userId: entry.userId,
        place: entry.place,
        knockouts: entry.knockouts,
      })),
    });
    await prisma.ratingEvent.createMany({
      data: scored.map((row) => ({
        userId: row.userId,
        seasonId: season.id,
        sourceType: "tournament_result" as const,
        points: row.points,
        tournamentId: tournament.id,
        place: row.place,
        fieldSize: scored.length,
        createdBy: admin.id,
        // Spread over time so the profile chart has a shape.
        createdAt: new Date(startsAt.getTime() + 4 * 60 * 60 * 1000),
      })),
    });
  }

  console.log("Granting achievements…");
  const finishes = await prisma.ratingEvent.findMany({
    where: { sourceType: "tournament_result" },
    select: { userId: true, place: true },
  });

  const winsByUser = new Map<string, number>();
  const gamesByUser = new Map<string, number>();
  for (const row of finishes) {
    gamesByUser.set(row.userId, (gamesByUser.get(row.userId) ?? 0) + 1);
    if (row.place === 1) winsByUser.set(row.userId, (winsByUser.get(row.userId) ?? 0) + 1);
  }

  const firstWin = achievements.find((a) => a.code === "first_win")!;
  const regular10 = achievements.find((a) => a.code === "regular_10")!;
  const helper = achievements.find((a) => a.code === "club_helper")!;

  for (const user of users) {
    const grants = [];
    if ((winsByUser.get(user.id) ?? 0) >= 1) grants.push(firstWin);
    if ((gamesByUser.get(user.id) ?? 0) >= 10) grants.push(regular10);

    for (const achievement of grants) {
      const granted = await prisma.userAchievement.create({
        data: {
          userId: user.id,
          achievementId: achievement.id,
          grantedById: admin.id,
          dedupeKey: "",
        },
      });
      await prisma.ratingEvent.create({
        data: {
          userId: user.id,
          seasonId: season.id,
          sourceType: "achievement",
          points: achievement.ratingPoints,
          achievementId: achievement.id,
          userAchievementId: granted.id,
          comment: achievement.title,
          createdBy: admin.id,
        },
      });
    }
  }

  // One hand-picked manual achievement, to show the non-automatic path.
  const helperGrant = await prisma.userAchievement.create({
    data: {
      userId: users[1]!.id,
      achievementId: helper.id,
      grantedById: admin.id,
      comment: "Помогает вести расписание и считать результаты",
      dedupeKey: `manual_${Date.now()}`,
    },
  });
  await prisma.ratingEvent.create({
    data: {
      userId: users[1]!.id,
      seasonId: season.id,
      sourceType: "achievement",
      points: helper.ratingPoints,
      achievementId: helper.id,
      userAchievementId: helperGrant.id,
      comment: helper.title,
      createdBy: admin.id,
    },
  });

  console.log("Scheduling upcoming tournaments…");
  for (const template of UPCOMING_TOURNAMENTS) {
    const startsAt = daysFromNow(template.inDays, 19);
    const tournament = await prisma.tournament.create({
      data: {
        seasonId: season.id,
        venueId: venue.id,
        title: template.title,
        description:
          "Спортивный покер без денежных ставок. Приходите за 15 минут до старта на регистрацию.",
        gameType: template.gameType ?? "nlh",
        startsAt,
        regOpensAt: daysFromNow(template.inDays - 10, 12),
        regClosesAt: new Date(startsAt.getTime() - 60 * 60 * 1000),
        capacity: template.capacity,
        buyinChips: 20_000,
        ratingMultiplier: template.multiplier,
        status: "reg_open",
      },
    });

    // Deliberately oversubscribe PLO Night so the waiting list is visible.
    const signUps = pickPlayers(users, Math.min(template.signUps, users.length));
    let waitlistPosition = 0;

    for (const [index, user] of signUps.entries()) {
      const overflow = index >= template.capacity;
      if (overflow) waitlistPosition += 1;

      await prisma.registration.create({
        data: {
          tournamentId: tournament.id,
          userId: user.id,
          status: overflow ? "waitlist" : "registered",
          source: index % 3 === 0 ? "tg_bot" : "web",
          waitlistPosition: overflow ? waitlistPosition : null,
        },
      });
    }
  }

  console.log("Recomputing season standings…");
  const events = await prisma.ratingEvent.findMany({
    where: { seasonId: season.id },
    select: { userId: true, sourceType: true, points: true, place: true, fieldSize: true },
  });

  const byUser = new Map<string, typeof events>();
  for (const event of events) {
    const list = byUser.get(event.userId) ?? [];
    list.push(event);
    byUser.set(event.userId, list);
  }

  for (const [userId, userEvents] of byUser) {
    const stats = summarizeLedger(userEvents, ratingConfig);
    await prisma.userSeasonStats.upsert({
      where: { userId_seasonId: { userId, seasonId: season.id } },
      create: { userId, seasonId: season.id, ...stats },
      update: stats,
    });
  }

  const standings = await prisma.userSeasonStats.findMany({
    where: { seasonId: season.id },
    include: { user: { select: { nickname: true } } },
    orderBy: { points: "desc" },
    take: 5,
  });

  console.log("\nDone. Top of the season:");
  for (const [index, row] of standings.entries()) {
    console.log(
      `  ${index + 1}. ${row.user.nickname.padEnd(14)} ${String(row.points).padStart(5)} очков` +
        `  (игр: ${row.gamesPlayed}, побед: ${row.wins})`,
    );
  }
  console.log(`\nАдмин для входа: ${PLAYERS[0]!.nickname}`);
  console.log(`Модератор:       ${PLAYERS[1]!.nickname}`);
  console.log("Вход в дев-режиме: POST /api/auth/dev/login { nickname }\n");
}

function daysFromNow(days: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function pickPlayers<T>(pool: T[], count: number): T[] {
  return shuffle(pool).slice(0, count);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
