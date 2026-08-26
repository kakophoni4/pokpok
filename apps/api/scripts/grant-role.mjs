/**
 * Bootstraps staff on a fresh installation.
 *
 * A newly deployed database has no administrator, and roles are only editable by
 * an administrator — so the very first one has to be appointed from the server.
 * Everything afterwards happens in the admin panel.
 *
 *   docker compose -f infra/docker-compose.yml exec api node scripts/grant-role.mjs --list
 *   docker compose -f infra/docker-compose.yml exec api node scripts/grant-role.mjs "Ник" admin
 *
 * Locally, where DATABASE_URL lives in the root .env:
 *   node --env-file=../../.env scripts/grant-role.mjs "Ник" admin
 */

import pg from "pg";

const ROLES = ["player", "admin"];

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const [nickname, role = "admin"] = args.filter((arg) => !arg.startsWith("--"));

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is not set. Locally: node --env-file=../../.env scripts/grant-role.mjs ...");
}

if (!listOnly) {
  if (!nickname) fail('Usage: node scripts/grant-role.mjs "<nickname>" [player|admin]');
  if (!ROLES.includes(role)) fail(`Unknown role "${role}". Expected one of: ${ROLES.join(", ")}`);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  if (listOnly) {
    await printRoster();
  } else {
    await grant();
  }
} finally {
  await client.end();
}

async function printRoster() {
  const { rows } = await client.query(
    `SELECT nickname, role, status, "createdAt"
       FROM "User"
      ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, "createdAt"`,
  );

  if (rows.length === 0) {
    console.log("No players yet. Sign in through Telegram once, then run this script again.");
    return;
  }

  console.log(`${rows.length} player(s):\n`);
  for (const row of rows) {
    const flag = row.status === "blocked" ? " [blocked]" : "";
    console.log(`  ${row.role.padEnd(9)} ${row.nickname}${flag}`);
  }
}

async function grant() {
  // Nicknames come from Telegram, so the exact capitalisation is easy to get
  // wrong when typing one into a shell.
  const found = await client.query(`SELECT id, nickname, role FROM "User" WHERE lower(nickname) = lower($1)`, [
    nickname,
  ]);

  const user = found.rows[0];
  if (!user) {
    console.error(`No player named "${nickname}".`);
    console.error("Run with --list to see the exact spelling.");
    process.exit(1);
  }

  if (user.role === role) {
    console.log(`${user.nickname} already has the role "${role}". Nothing to do.`);
    return;
  }

  // One transaction: a role change that leaves no trace in the audit log is
  // exactly the kind of thing the audit log exists to prevent.
  await client.query("BEGIN");
  try {
    await client.query(`UPDATE "User" SET role = $1::"UserRole", "updatedAt" = now() WHERE id = $2`, [
      role,
      user.id,
    ]);
    await client.query(
      `INSERT INTO "AuditLog" (id, "actorId", action, entity, "entityId", before, after)
       VALUES (gen_random_uuid()::text, NULL, 'user.role.bootstrap', 'User', $1, $2, $3)`,
      [user.id, JSON.stringify({ role: user.role }), JSON.stringify({ role, via: "cli" })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  console.log(`${user.nickname}: ${user.role} → ${role}`);
  console.log("The new role applies on the next sign-in or token refresh (within 15 minutes).");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
