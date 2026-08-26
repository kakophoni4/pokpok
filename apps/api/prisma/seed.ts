/**
 * Demo data for local development.
 *
 * Produces a season that already looks lived-in: past evenings with a full cash
 * desk, places, and rating computed by the same engine the API uses; upcoming
 * events with sign-ups and a waiting list; an achievement catalogue.
 *
 * Run with: pnpm db:seed
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { CLUB_TIMEZONE, DEFAULT_RATING_CONFIG, RatingConfig } from "@poker/contracts";
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

/** Samara is UTC+4 all year, so the club's wall clock never shifts. */
const CLUB_UTC_OFFSET_HOURS = 4;

const PLAYERS = [
  { nickname: "Ferz", displayName: "Артём Фёдоров", role: "admin" as const },
  { nickname: "Kate_AA", displayName: "Екатерина Лапина", role: "admin" as const },
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
    code: "hand_of_the_day",
    title: "Рука дня",
    description: "Собрал руку дня — ту, что выиграла финал прошлого турнира",
    icon: "🃏",
    ratingPoints: 100,
    isRepeatable: true,
    rule: null,
  },
  {
    code: "royal_flush",
    title: "Роял-флеш",
    description: "Собрал роял-флеш за столом",
    icon: "👑",
    ratingPoints: 200,
    isRepeatable: true,
    rule: null,
  },
  {
    code: "quads",
    title: "Каре",
    description: "Собрал каре",
    icon: "🎰",
    ratingPoints: 50,
    isRepeatable: true,
    rule: null,
  },
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
    code: "season_champion",
    title: "Чемпион сезона",
    description: "Первое место в итоговом рейтинге сезона",
    icon: "🌟",
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
  { title: "Вечерний турнир #12", daysAgo: 42, multiplier: 1, field: 14, paidPlaces: 9 },
  { title: "Вечерний турнир #13", daysAgo: 35, multiplier: 1, field: 12, paidPlaces: 9 },
  { title: "Дипстек по воскресеньям", daysAgo: 28, multiplier: 1.5, field: 13, paidPlaces: 9 },
  { title: "Вечерний турнир #14", daysAgo: 21, multiplier: 1, field: 11, paidPlaces: 9 },
  { title: "Клубный мейджор «Осень»", daysAgo: 14, multiplier: 2, field: 14, paidPlaces: 18 },
  { title: "Вечерний турнир #15", daysAgo: 7, multiplier: 1, field: 12, paidPlaces: 9 },
];

const UPCOMING_TOURNAMENTS = [
  { title: "Вечерний турнир #16", inDays: 2, capacity: 12, multiplier: 1, signUps: 9 },
  { title: "Дипстек по воскресеньям", inDays: 5, capacity: 8, multiplier: 1, signUps: 10 },
  { title: "Вечерний турнир #17", inDays: 9, capacity: 16, multiplier: 1, signUps: 5 },
  { title: "Клубный мейджор «Зима»", inDays: 23, capacity: 24, multiplier: 2, signUps: 3 },
];

const ENTRY_PRICE = 500;
const ADDON_PRICE = 500;
const DRINK_PRICE = 200;

async function main(): Promise<void> {
  console.log("Cleaning previous demo data…");
  // Order matters: children before parents, since not everything cascades.
  await prisma.outbox.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.ratingEvent.deleteMany();
  await prisma.userSeasonStats.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.payment.deleteMany();
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
  };

  await prisma.clubSettings.upsert({
    where: { id: "club" },
    create: {
      id: "club",
      timezone: CLUB_TIMEZONE,
      entryPriceRub: ENTRY_PRICE,
      addonPriceRub: ADDON_PRICE,
      drinkPriceRub: DRINK_PRICE,
      infoText: [
        "Самара, ул. Молодогвардейская, 204, второй этаж, вход со двора.",
        "",
        "Играем по вторникам и воскресеньям, сбор в 18:30, старт в 19:00 по Самаре.",
        "Вход 500 ₽, адон 500 ₽. Ставки не денежные — играем на рейтинг клуба.",
        "",
        "Вопросы: @poker_samara_admin",
      ].join("\n"),
    },
    update: {},
  });

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
      address: "Самара, ул. Молодогвардейская, 204",
      geoLat: 53.201,
      geoLon: 50.117,
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

  console.log("Playing out past evenings…");
  const admin = users[0]!;

  for (const template of PAST_TOURNAMENTS) {
    const startsAt = clubTime(-template.daysAgo, 19);
    const tournament = await prisma.tournament.create({
      data: {
        seasonId: season.id,
        venueId: venue.id,
        title: template.title,
        description: "Спортивный покер без денежных ставок. Регистрация до старта.",
        startsAt,
        regOpensAt: clubTime(-template.daysAgo - 7, 12),
        regClosesAt: startsAt,
        capacity: 16,
        paidPlaces: template.paidPlaces,
        ratingMultiplier: template.multiplier,
        status: "finished",
      },
    });

    const field = pickPlayers(users, template.field);
    const standings = shuffle(field).map((user, index) => ({
      userId: user.id,
      place: index + 1,
    }));

    await prisma.registration.createMany({
      data: standings.map((entry) => ({
        tournamentId: tournament.id,
        userId: entry.userId,
        status: "registered" as const,
        source: "web" as const,
      })),
    });

    // The cash desk as it would have looked: everyone paid an entry, roughly a
    // third took an add-on, a few bought a drink.
    const cashDesk: {
      tournamentId: string;
      userId: string;
      kind: "entry" | "addon" | "drink";
      amountRub: number;
      chips: number;
      createdById: string;
      createdAt: Date;
    }[] = [];

    for (const entry of standings) {
      cashDesk.push({
        tournamentId: tournament.id,
        userId: entry.userId,
        kind: "entry",
        amountRub: ENTRY_PRICE,
        chips: ratingConfig.startingStack,
        createdById: admin.id,
        createdAt: startsAt,
      });
      if (random() < 0.35) {
        cashDesk.push({
          tournamentId: tournament.id,
          userId: entry.userId,
          kind: "addon",
          amountRub: ADDON_PRICE,
          chips: ratingConfig.addonChips,
          createdById: admin.id,
          createdAt: new Date(startsAt.getTime() + 90 * 60 * 1000),
        });
      }
      if (random() < 0.4) {
        cashDesk.push({
          tournamentId: tournament.id,
          userId: entry.userId,
          kind: "drink",
          amountRub: DRINK_PRICE,
          chips: 0,
          createdById: admin.id,
          createdAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        });
      }
    }

    await prisma.payment.createMany({ data: cashDesk });
    await prisma.result.createMany({
      data: standings.map((entry) => ({
        tournamentId: tournament.id,
        userId: entry.userId,
        place: entry.place,
      })),
    });

    const chipsInPlay = cashDesk.reduce((sum, line) => sum + line.chips, 0);
    const scored = scoreTournament({
      standings,
      chipsInPlay,
      paidPlaces: template.paidPlaces,
      multiplier: template.multiplier,
      config: ratingConfig,
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
  const handOfTheDay = achievements.find((a) => a.code === "hand_of_the_day")!;

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

  // Two grants made by hand at the table, the way the bot will do it.
  for (const [index, achievement] of [helper, handOfTheDay].entries()) {
    const holder = users[index + 1]!;
    const granted = await prisma.userAchievement.create({
      data: {
        userId: holder.id,
        achievementId: achievement.id,
        grantedById: admin.id,
        comment: achievement.code === "club_helper" ? "Помогает вести расписание" : "Ac-Ac",
        dedupeKey: `manual_${achievement.code}_${index}`,
      },
    });
    await prisma.ratingEvent.create({
      data: {
        userId: holder.id,
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

  console.log("Scheduling upcoming evenings…");
  for (const template of UPCOMING_TOURNAMENTS) {
    const startsAt = clubTime(template.inDays, 19);
    const tournament = await prisma.tournament.create({
      data: {
        seasonId: season.id,
        venueId: venue.id,
        title: template.title,
        description:
          "Спортивный покер без денежных ставок. Приходите за 30 минут до старта на регистрацию.",
        startsAt,
        regOpensAt: clubTime(template.inDays - 10, 12),
        regClosesAt: new Date(startsAt.getTime() - 60 * 60 * 1000),
        capacity: template.capacity,
        ratingMultiplier: template.multiplier,
        status: "reg_open",
      },
    });

    // Deliberately oversubscribe one evening so the waiting list is visible.
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
      `  ${index + 1}. ${row.user.nickname.padEnd(14)} ${String(row.points).padStart(6)} очков` +
        `  (игр: ${row.gamesPlayed}, побед: ${row.wins})`,
    );
  }
  console.log(`\nАдмины для входа: ${PLAYERS[0]!.nickname}, ${PLAYERS[1]!.nickname}`);
  console.log("Вход в дев-режиме: POST /api/auth/dev/login { nickname }\n");
}

/**
 * A date `days` from today at `hour` on the club's wall clock. Built through UTC
 * on purpose: a developer machine set to another timezone must still seed games
 * that start at 19:00 in Samara.
 */
function clubTime(days: number, hour: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + days,
      hour - CLUB_UTC_OFFSET_HOURS,
      0,
      0,
      0,
    ),
  );
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
