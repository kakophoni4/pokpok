import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AuthProvider,
  PaymentKind,
  RatingSourceType,
  RegistrationSource,
  RegistrationStatus,
  TournamentStatus,
  UserRole,
  UserStatus,
} from "./enums.js";

/**
 * Every enum exists twice: once as a Zod schema here, once as a Postgres enum in
 * the Prisma schema. That duplication is unavoidable — but silent drift is not.
 * If someone adds a tournament status in only one of the two places, this test
 * fails immediately instead of the mismatch surfacing as a runtime write error.
 */

const SCHEMA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../apps/api/prisma/schema.prisma",
);

function parsePrismaEnums(source: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  const blocks = source.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g);

  for (const [, name, body] of blocks) {
    const values = (body ?? "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((line) => line.length > 0 && !line.startsWith("@@"));
    enums.set(name!, values);
  }

  return enums;
}

const prismaEnums = parsePrismaEnums(readFileSync(SCHEMA_PATH, "utf8"));

const PAIRS = [
  ["AuthProvider", AuthProvider],
  ["UserRole", UserRole],
  ["UserStatus", UserStatus],
  ["TournamentStatus", TournamentStatus],
  ["RegistrationStatus", RegistrationStatus],
  ["PaymentKind", PaymentKind],
  ["RegistrationSource", RegistrationSource],
  ["RatingSourceType", RatingSourceType],
] as const;

describe("enum parity with the Prisma schema", () => {
  it("finds every declared enum in schema.prisma", () => {
    expect([...prismaEnums.keys()].sort()).toEqual(PAIRS.map(([name]) => name).sort());
  });

  for (const [name, schema] of PAIRS) {
    it(`${name} has the same values in both places`, () => {
      const fromPrisma = prismaEnums.get(name);
      expect(fromPrisma, `enum ${name} is missing from schema.prisma`).toBeDefined();
      expect([...(fromPrisma ?? [])].sort()).toEqual([...schema.options].sort());
    });
  }
});
