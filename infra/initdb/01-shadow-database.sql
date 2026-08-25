-- Prisma's `migrate dev` diffs the schema in a throwaway "shadow" database.
-- SHADOW_DATABASE_URL in the root .env points here, and Prisma expects the
-- database to already exist, so it is created on the very first container boot.
CREATE DATABASE poker_league_shadow;
