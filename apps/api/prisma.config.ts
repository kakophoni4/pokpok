import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The monorepo keeps one .env at the root; the Prisma CLI does not look there on its own.
loadEnv({ path: "../../.env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Only `migrate dev` needs a shadow database. Production runs `migrate deploy`,
    // where demanding this variable would fail the deploy for no reason.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: env("SHADOW_DATABASE_URL") }
      : {}),
  },
});
