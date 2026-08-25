/**
 * Creates the first season on a freshly deployed database.
 *
 * Tournaments attach to a season, and the season carries the rating formula, so
 * an empty seasons table means every result lands outside the standings. There is
 * no admin screen for seasons yet, hence this script — infra/bootstrap.sh runs it
 * automatically after the API comes up.
 *
 * Idempotent: it does nothing at all once any season exists.
 */

import { DEFAULT_RATING_CONFIG } from "@poker/contracts";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const { rows } = await client.query(`SELECT title, "isActive" FROM "Season" ORDER BY "startsAt"`);

  if (rows.length > 0) {
    const active = rows.find((row) => row.isActive);
    console.log(
      `${rows.length} season(s) already exist. Active: ${active ? active.title : "none"}.`,
    );
  } else {
    const year = new Date().getFullYear();
    const title = `Сезон ${year}`;

    await client.query(
      `INSERT INTO "Season" (id, title, "startsAt", "endsAt", "isActive", "ratingConfig", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, NULL, true, $3, now())`,
      [title, new Date(Date.UTC(year, 0, 1)), JSON.stringify(DEFAULT_RATING_CONFIG)],
    );

    console.log(`Created "${title}" and made it active, with the default rating formula.`);
  }
} finally {
  await client.end();
}
