/**
 * End-to-end smoke test against a running API with seeded data.
 *
 * Exercises the paths that matter most and are annoying to check by hand:
 * login, sign-up with a waiting list, the cash desk handing out chips, places
 * as players bust out, and finishing an evening — then taking it all back.
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
  // Its own event rather than a seeded one: repeated runs and the passage of time
  // both leave the demo schedule in states where nobody can sign up.
  const opened = await call("POST", "/tournaments", {
    token: admin.accessToken,
    body: {
      title: `Smoke Signup ${Date.now()}`,
      startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      capacity: 6,
      paidPlaces: 3,
      status: "reg_open",
    },
  });
  check("admin opens an event for sign-ups", Boolean(opened.payload?.id), JSON.stringify(opened.payload));
  const free = opened.payload;

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

  console.log("\nclub settings");
  const publicInfo = await call("GET", "/club/info");
  check("club info is public", typeof publicInfo.payload?.infoText === "string");
  check(
    "times are pinned to the club's timezone",
    publicInfo.payload?.timezone === "Europe/Samara",
    publicInfo.payload?.timezone,
  );
  const closedSettings = await call("GET", "/club/settings", { token: player.accessToken });
  check("prices are staff-only", closedSettings.status === 403, `status ${closedSettings.status}`);
  const prices = await call("GET", "/club/settings", { token: admin.accessToken });
  check("admin reads the price list", prices.payload?.entryPriceRub > 0);

  console.log("\ncash desk");
  const created = await call("POST", "/tournaments", {
    token: admin.accessToken,
    body: {
      title: `Smoke Test Cup ${Date.now()}`,
      startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      capacity: 8,
      paidPlaces: 3,
      ratingMultiplier: 1,
      status: "reg_open",
    },
  });
  check("admin creates a tournament", Boolean(created.payload?.id), JSON.stringify(created.payload));
  const tournamentId = created.payload.id;
  check("paid places are stored", created.payload?.paidPlaces === 3, created.payload?.paidPlaces);

  const board = await call("GET", "/rating/leaderboard");
  check("leaderboard is populated", (board.payload?.length ?? 0) > 0);
  const contenders = board.payload.slice(0, 4);
  const pointsBefore = new Map(contenders.map((row) => [row.user.id, row.points]));

  // Paying the entry is what makes somebody a participant.
  for (const row of contenders) {
    await call("POST", `/tournaments/${tournamentId}/payments`, {
      token: admin.accessToken,
      body: { userId: row.user.id, kind: "entry", amountRub: prices.payload.entryPriceRub },
    });
  }
  const afterEntries = await call("GET", `/tournaments/${tournamentId}`, {
    token: admin.accessToken,
  });
  check(
    "entries put chips on the table",
    afterEntries.payload?.chipsInPlay === 4 * afterEntries.payload?.startingStack,
    `${afterEntries.payload?.chipsInPlay} chips`,
  );
  check(
    "paying for the entry also signs the player up",
    afterEntries.payload?.registeredCount === 4,
    `${afterEntries.payload?.registeredCount} registered`,
  );
  check("first place is already worth something", afterEntries.payload?.ratingPool > 0);

  const addon = await call("POST", `/tournaments/${tournamentId}/payments`, {
    token: admin.accessToken,
    body: { userId: contenders[0].user.id, kind: "addon", amountRub: prices.payload.addonPriceRub },
  });
  check(
    "an add-on adds its own chips",
    addon.payload?.chips ===
      afterEntries.payload.startingStack + afterEntries.payload.addonChips,
    `${addon.payload?.chips} chips`,
  );

  const drink = await call("POST", `/tournaments/${tournamentId}/payments`, {
    token: admin.accessToken,
    body: { userId: contenders[0].user.id, kind: "drink", amountRub: prices.payload.drinkPriceRub },
  });
  const drinkLine = drink.payload.payments.find((row) => row.kind === "drink");
  check("a drink is money, not chips", drinkLine?.chips === 0, JSON.stringify(drinkLine));

  const tripleRebuy = await call("POST", `/tournaments/${tournamentId}/payments`, {
    token: admin.accessToken,
    body: {
      userId: contenders[1].user.id,
      kind: "rebuy",
      amountRub: prices.payload.rebuyPriceRub * 3,
      multiplier: 3,
    },
  });
  check(
    "a triple rebuy is one line with three stacks",
    tripleRebuy.payload?.payments.find((row) => row.kind === "rebuy")?.chips ===
      afterEntries.payload.startingStack * 3,
    JSON.stringify(tripleRebuy.payload?.payments),
  );

  const voided = await call(
    "DELETE",
    `/tournaments/${tournamentId}/payments/${drinkLine.id}`,
    { token: admin.accessToken },
  );
  check(
    "a mistaken line can be voided",
    !voided.payload.payments.some((row) => row.id === drinkLine.id),
    JSON.stringify(voided.payload.payments),
  );

  const money = await call("GET", `/tournaments/${tournamentId}`, { token: admin.accessToken });
  check(
    "the till counts only live lines",
    money.payload?.totalRub ===
      4 * prices.payload.entryPriceRub +
        prices.payload.addonPriceRub +
        3 * prices.payload.rebuyPriceRub,
    `${money.payload?.totalRub} ₽`,
  );
  const asPlayer = await call("GET", `/tournaments/${tournamentId}`, {
    token: player.accessToken,
  });
  check("players never see the money", asPlayer.payload?.totalRub == null);
  check("players never see the tab", asPlayer.payload?.players == null);

  console.log("\nplaces and finishing");
  for (const [index, row] of contenders.entries()) {
    await call("POST", `/tournaments/${tournamentId}/place`, {
      token: admin.accessToken,
      body: { userId: row.user.id, place: index + 1 },
    });
  }

  const taken = await call("POST", `/tournaments/${tournamentId}/place`, {
    token: admin.accessToken,
    body: { userId: contenders[3].user.id, place: 1 },
  });
  check("the same place cannot go to two players", taken.status === 409, `status ${taken.status}`);

  const finished = await call("POST", `/tournaments/${tournamentId}/finish`, {
    token: admin.accessToken,
  });
  check("the evening can be closed", finished.status === 201, JSON.stringify(finished.payload));

  const boardAfter = await call("GET", "/rating/leaderboard");
  const winnerAfter = boardAfter.payload.find((row) => row.user.id === contenders[0].user.id);
  check(
    "winner gained rating",
    winnerAfter.points > pointsBefore.get(contenders[0].user.id),
    `${pointsBefore.get(contenders[0].user.id)} -> ${winnerAfter?.points}`,
  );
  const outsidePrizes = boardAfter.payload.find((row) => row.user.id === contenders[3].user.id);
  check(
    "fourth place earns nothing when three places pay",
    outsidePrizes.points === pointsBefore.get(contenders[3].user.id),
    `${pointsBefore.get(contenders[3].user.id)} -> ${outsidePrizes?.points}`,
  );

  const winnerStats = await call("GET", `/rating/player/${contenders[0].user.id}`);
  check("player history records the finish", winnerStats.payload?.history?.[0]?.place === 1);
  check("rating curve has points", (winnerStats.payload?.progression?.length ?? 0) > 0);

  const lockedDesk = await call("POST", `/tournaments/${tournamentId}/payments`, {
    token: admin.accessToken,
    body: { userId: contenders[0].user.id, kind: "drink", amountRub: 100 },
  });
  check(
    "a closed evening will not take more money",
    lockedDesk.status === 409,
    `status ${lockedDesk.status}`,
  );

  console.log("\nundoing a mistake");
  const reopened = await call("POST", `/tournaments/${tournamentId}/reopen`, {
    token: admin.accessToken,
  });
  check("closing is reversible", reopened.status === 201, `status ${reopened.status}`);

  const rolledBack = await call("GET", "/rating/leaderboard");
  const winnerRolledBack = rolledBack.payload.find((row) => row.user.id === contenders[0].user.id);
  check(
    "reopening takes the rating back",
    winnerRolledBack.points === pointsBefore.get(contenders[0].user.id),
    `${winnerRolledBack?.points} vs ${pointsBefore.get(contenders[0].user.id)}`,
  );

  // Swap first and second, then close again: the ledger must not grow a second row.
  await call("POST", `/tournaments/${tournamentId}/results`, {
    token: admin.accessToken,
    body: {
      entries: contenders.map((row, index) => ({
        userId: row.user.id,
        place: index === 0 ? 2 : index === 1 ? 1 : index + 1,
      })),
    },
  });

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

  const doubleBooked = await call("POST", `/tournaments/${tournamentId}/results`, {
    token: admin.accessToken,
    body: {
      entries: [
        { userId: contenders[0].user.id, place: 1 },
        { userId: contenders[1].user.id, place: 1 },
      ],
    },
  });
  check(
    "a duplicated place is rejected",
    doubleBooked.status === 400,
    `status ${doubleBooked.status}`,
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

    console.log("\nlogin confirmed in the bot");
    const internal = (path, body) =>
      fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-token": internalToken },
        body: JSON.stringify(body),
      });
    const profile = {
      provider: "telegram",
      providerUserId: telegramId,
      username: "smoke_bot_user",
      firstName: "Смоук",
      lastName: null,
      photoUrl: null,
      raw: { source: "tg_bot" },
    };

    const ticket = await call("POST", "/auth/telegram/login");
    check(
      "site opens a login ticket with a deep link",
      ticket.status === 201 && ticket.payload?.url?.includes(`start=login_${ticket.payload?.code}`),
      JSON.stringify(ticket.payload),
    );

    const beforeTap = await call("GET", `/auth/telegram/login/${ticket.payload.code}`);
    check(
      "an untouched ticket keeps the browser waiting",
      beforeTap.payload?.state === "pending" && beforeTap.payload?.session === null,
      JSON.stringify(beforeTap.payload),
    );

    const prompt = await internal("/auth/internal/login/prompt", { code: ticket.payload.code });
    const promptBody = await prompt.json();
    check(
      "bot reads the same check phrase the site shows",
      promptBody.phrase === ticket.payload.phrase,
      `${ticket.payload.phrase} vs ${promptBody.phrase}`,
    );

    const settled = await internal("/auth/internal/login/settle", {
      code: ticket.payload.code,
      approve: true,
      profile,
    });
    check("bot confirms the login", settled.status === 201, `status ${settled.status}`);

    const afterTap = await call("GET", `/auth/telegram/login/${ticket.payload.code}`);
    check(
      "the waiting browser gets a session for the Telegram account",
      afterTap.payload?.state === "confirmed" &&
        afterTap.payload?.session?.user?.id === botSession.user.id,
      JSON.stringify(afterTap.payload?.state),
    );

    const replay = await call("GET", `/auth/telegram/login/${ticket.payload.code}`);
    check(
      "a spent ticket cannot be redeemed twice",
      replay.payload?.state === "expired" && replay.payload?.session === null,
      JSON.stringify(replay.payload),
    );

    const declinedTicket = await call("POST", "/auth/telegram/login");
    await internal("/auth/internal/login/settle", {
      code: declinedTicket.payload.code,
      approve: false,
      profile,
    });
    const refused = await call("GET", `/auth/telegram/login/${declinedTicket.payload.code}`);
    check(
      "«это не я» hands out nothing",
      refused.payload?.state === "declined" && refused.payload?.session === null,
      JSON.stringify(refused.payload),
    );

    const unknown = await call("GET", "/auth/telegram/login/deadbeefdeadbeefdeadbeef");
    check(
      "a made-up code looks exactly like an expired one",
      unknown.payload?.state === "expired",
      JSON.stringify(unknown.payload),
    );

    const settleWithoutSecret = await call("POST", "/auth/internal/login/settle", {
      body: { code: ticket.payload.code, approve: true, profile },
    });
    check(
      "confirming a login needs the internal secret",
      settleWithoutSecret.status === 401 || settleWithoutSecret.status === 403,
      `status ${settleWithoutSecret.status}`,
    );
  }

  console.log("\ncleanup");
  const signupGone = await call("DELETE", `/tournaments/${free.id}`, { token: admin.accessToken });
  check("the sign-up event is removed", signupGone.status === 200, `status ${signupGone.status}`);
  await call("DELETE", `/tournaments/${tournamentId}/results`, { token: admin.accessToken });
  // An evening the cash desk touched keeps its paper trail; cancelling is the way out.
  const removed = await call("DELETE", `/tournaments/${tournamentId}`, { token: admin.accessToken });
  check("an evening with a till is not deletable", removed.status === 409, `status ${removed.status}`);
  const archived = await call("PATCH", `/tournaments/${tournamentId}`, {
    token: admin.accessToken,
    body: { status: "cancelled" },
  });
  check("test tournament cancelled", archived.status === 200, `status ${archived.status}`);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("\nSmoke test crashed:", error.message);
  process.exitCode = 1;
});
