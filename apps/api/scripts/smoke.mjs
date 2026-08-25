/**
 * End-to-end smoke test against a running API with seeded data.
 *
 * Exercises the paths that matter most and are annoying to check by hand:
 * login, sign-up with a waiting list, submitting standings, and the rating
 * actually moving afterwards.
 *
 * Usage: node scripts/smoke.mjs   (API must be running, database seeded)
 */
const BASE = process.env.SMOKE_API_URL ?? "http://localhost:3000/api";

let failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { status: response.status, payload };
}

async function login(nickname) {
  const { status, payload } = await call("POST", "/auth/dev/login", { body: { nickname } });
  if (status !== 201 && status !== 200) {
    throw new Error(`dev login failed for ${nickname}: ${status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  console.log("health");
  const health = await call("GET", "/health");
  check("health responds ok", health.payload?.status === "ok", JSON.stringify(health.payload));

  console.log("\nauth");
  const admin = await login("Ferz");
  check("admin logs in", admin.user.role === "admin", admin.user.role);
  const player = await login("Sanya_River");
  check("player logs in", player.user.role === "player", player.user.role);

  const me = await call("GET", "/auth/me", { token: player.accessToken });
  check("me returns the same player", me.payload?.id === player.user.id);

  const noToken = await call("GET", "/auth/me");
  check("me rejects anonymous callers", noToken.status === 401, `status ${noToken.status}`);

  console.log("\nrbac");
  const forbidden = await call("POST", "/achievements", {
    token: player.accessToken,
    body: { code: "hack_attempt", title: "Nope" },
  });
  check("player cannot create achievements", forbidden.status === 403, `status ${forbidden.status}`);

  console.log("\nschedule");
  const upcoming = await call("GET", "/tournaments?scope=upcoming", { token: player.accessToken });
  check("upcoming tournaments are listed", (upcoming.payload?.length ?? 0) > 0);
  const withWaitlist = upcoming.payload.find((t) => t.waitlistCount > 0);
  check("a waiting list exists in the seed", Boolean(withWaitlist), "no oversubscribed event");

  console.log("\nregistration");
  const free = upcoming.payload.find((t) => !t.myRegistration && t.waitlistCount === 0);
  if (!free) throw new Error("seed has no tournament this player can join");

  const registered = await call("POST", `/tournaments/${free.id}/register`, {
    token: player.accessToken,
    body: { source: "web" },
  });
  check("player registers", registered.payload?.status === "registered", JSON.stringify(registered.payload));

  const duplicate = await call("POST", `/tournaments/${free.id}/register`, {
    token: player.accessToken,
    body: { source: "web" },
  });
  check("double registration is rejected", duplicate.status === 409, `status ${duplicate.status}`);

  const detail = await call("GET", `/tournaments/${free.id}`, { token: player.accessToken });
  check("tournament card shows my registration", detail.payload?.myRegistration?.status === "registered");
  check(
    "participants list includes me",
    detail.payload?.registrations?.some((row) => row.user.id === player.user.id),
  );

  const cancelled = await call("DELETE", `/tournaments/${free.id}/register`, {
    token: player.accessToken,
  });
  check("player cancels", cancelled.status === 200, `status ${cancelled.status}`);

  console.log("\nresults and rating");
  const created = await call("POST", "/tournaments", {
    token: admin.accessToken,
    body: {
      title: `Smoke Test Cup ${Date.now()}`,
      startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      capacity: 8,
      ratingMultiplier: 1,
      status: "reg_open",
    },
  });
  check("admin creates a tournament", Boolean(created.payload?.id), JSON.stringify(created.payload));
  const tournamentId = created.payload.id;

  const board = await call("GET", "/rating/leaderboard");
  check("leaderboard is populated", (board.payload?.length ?? 0) > 0);
  const contenders = board.payload.slice(0, 4);
  const pointsBefore = new Map(contenders.map((row) => [row.user.id, row.points]));

  const submitted = await call("POST", `/tournaments/${tournamentId}/results`, {
    token: admin.accessToken,
    body: {
      entries: contenders.map((row, index) => ({ userId: row.user.id, place: index + 1 })),
    },
  });
  check("standings are accepted", submitted.status === 201, JSON.stringify(submitted.payload));

  const badStandings = await call("POST", `/tournaments/${tournamentId}/results`, {
    token: admin.accessToken,
    body: {
      entries: [
        { userId: contenders[0].user.id, place: 1 },
        { userId: contenders[1].user.id, place: 3 },
      ],
    },
  });
  check("gaps in places are rejected", badStandings.status === 400, `status ${badStandings.status}`);

  const boardAfter = await call("GET", "/rating/leaderboard");
  const winnerAfter = boardAfter.payload.find((row) => row.user.id === contenders[0].user.id);
  check(
    "winner gained rating",
    winnerAfter.points > pointsBefore.get(contenders[0].user.id),
    `${pointsBefore.get(contenders[0].user.id)} -> ${winnerAfter?.points}`,
  );

  const winnerStats = await call("GET", `/rating/player/${contenders[0].user.id}`);
  check("player history records the finish", winnerStats.payload?.history?.[0]?.place === 1);
  check("rating curve has points", (winnerStats.payload?.progression?.length ?? 0) > 0);

  console.log("\nre-submitting corrected standings");
  const corrected = await call("POST", `/tournaments/${tournamentId}/results`, {
    token: admin.accessToken,
    body: {
      entries: contenders.map((row, index) => ({
        userId: row.user.id,
        // Swap first and second place.
        place: index === 0 ? 2 : index === 1 ? 1 : index + 1,
      })),
    },
  });
  check("correction is accepted", corrected.status === 201);

  const afterFix = await call("GET", `/rating/player/${contenders[1].user.id}`);
  check(
    "corrected winner now has a first place",
    afterFix.payload?.history?.some((row) => row.place === 1),
  );

  const eventsForTournament = afterFix.payload.history.filter(
    (row) => row.tournament?.id === tournamentId,
  );
  check(
    "correction did not duplicate ledger rows",
    eventsForTournament.length === 1,
    `found ${eventsForTournament.length}`,
  );

  console.log("\nachievements");
  const catalogue = await call("GET", "/achievements");
  check("achievement catalogue is available", (catalogue.payload?.length ?? 0) > 0);
  const manual = catalogue.payload.find((row) => row.rule === null);
  check("a manual achievement exists", Boolean(manual));

  const granted = await call("POST", "/achievements/grant", {
    token: admin.accessToken,
    body: { userId: player.user.id, achievementId: manual.id },
  });
  check("achievement is granted", granted.status === 201, JSON.stringify(granted.payload));

  const playerRating = await call("GET", `/rating/player/${player.user.id}`);
  check(
    "granted achievement shows up in the ledger",
    playerRating.payload?.history?.some((row) => row.sourceType === "achievement"),
  );

  await call("DELETE", `/achievements/grant/${granted.payload.id}`, { token: admin.accessToken });

  console.log("\nbot path (internal session exchange)");
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!internalToken) {
    console.log("  skip INTERNAL_API_TOKEN not set (run with node --env-file=../../.env)");
  } else {
    const unauthorised = await fetch(`${BASE}/auth/internal/provider-session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "telegram", providerUserId: "1", raw: {} }),
    });
    check(
      "internal endpoint rejects callers without the secret",
      unauthorised.status === 401 || unauthorised.status === 403,
      `status ${unauthorised.status}`,
    );

    // A Telegram id nobody has used before: the bot must create the account.
    const telegramId = `99${Date.now()}`.slice(0, 12);
    const exchange = await fetch(`${BASE}/auth/internal/provider-session`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": internalToken },
      body: JSON.stringify({
        provider: "telegram",
        providerUserId: telegramId,
        username: "smoke_bot_user",
        firstName: "Смоук",
        lastName: null,
        photoUrl: null,
        raw: { source: "tg_bot" },
      }),
    });
    const botSession = await exchange.json();
    check("bot exchanges a Telegram identity for a session", exchange.status === 201, `status ${exchange.status}`);
    check("new Telegram user gets an account", botSession.isNewUser === true);
    check(
      "nickname is derived from the Telegram username",
      typeof botSession.user?.nickname === "string" && botSession.user.nickname.length > 1,
      JSON.stringify(botSession.user?.nickname),
    );

    const botMe = await call("GET", "/auth/me", { token: botSession.accessToken });
    check("session issued to the bot works on the public API", botMe.status === 200);

    // Signing up through the bot must go through the very same endpoint the site uses.
    const openEvent = (await call("GET", "/tournaments?scope=upcoming", { token: botSession.accessToken }))
      .payload.find((row) => !row.myRegistration && row.status === "reg_open");

    if (openEvent) {
      const botJoin = await call("POST", `/tournaments/${openEvent.id}/register`, {
        token: botSession.accessToken,
        body: { source: "tg_bot" },
      });
      check(
        "bot registration is accepted",
        botJoin.status === 201,
        JSON.stringify(botJoin.payload),
      );

      const roster = await call("GET", `/tournaments/${openEvent.id}/registrations`);
      check(
        "bot sign-up appears in the public roster",
        roster.payload.some((row) => row.user.id === botSession.user.id),
      );

      await call("DELETE", `/tournaments/${openEvent.id}/register`, {
        token: botSession.accessToken,
      });
    }

    const repeat = await fetch(`${BASE}/auth/internal/provider-session`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": internalToken },
      body: JSON.stringify({
        provider: "telegram",
        providerUserId: telegramId,
        username: "smoke_bot_user",
        firstName: "Смоук",
        lastName: null,
        photoUrl: null,
        raw: { source: "tg_bot" },
      }),
    });
    const again = await repeat.json();
    check(
      "the same Telegram id maps to the same account, not a duplicate",
      again.user?.id === botSession.user?.id && again.isNewUser === false,
      `${botSession.user?.id} vs ${again.user?.id}`,
    );
  }

  console.log("\ncleanup");
  await call("DELETE", `/tournaments/${tournamentId}/results`, { token: admin.accessToken });
  const removed = await call("DELETE", `/tournaments/${tournamentId}`, { token: admin.accessToken });
  check("test tournament removed", removed.status === 200, `status ${removed.status}`);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("\nSmoke test crashed:", error.message);
  process.exitCode = 1;
});
