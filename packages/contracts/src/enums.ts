import { z } from "zod";

/**
 * These enums are mirrored in apps/api/prisma/schema.prisma.
 * The parity test in packages/contracts/src/enums.test.ts fails if they drift.
 */

export const AuthProvider = z.enum(["telegram", "vk"]);
export type AuthProvider = z.infer<typeof AuthProvider>;

export const UserRole = z.enum(["player", "moderator", "admin"]);
export type UserRole = z.infer<typeof UserRole>;

export const UserStatus = z.enum(["active", "blocked"]);
export type UserStatus = z.infer<typeof UserStatus>;

export const GameType = z.enum(["nlh", "plo", "plo5", "mixed", "other"]);
export type GameType = z.infer<typeof GameType>;

export const TournamentStatus = z.enum([
  "draft",
  "announced",
  "reg_open",
  "reg_closed",
  "running",
  "finished",
  "cancelled",
]);
export type TournamentStatus = z.infer<typeof TournamentStatus>;

/** Statuses a player can hold for a tournament. */
export const RegistrationStatus = z.enum([
  "registered",
  "waitlist",
  "checked_in",
  "cancelled",
  "no_show",
]);
export type RegistrationStatus = z.infer<typeof RegistrationStatus>;

/** Which client created the registration; used for analytics and audit. */
export const RegistrationSource = z.enum(["web", "miniapp", "tg_bot", "vk_bot", "admin"]);
export type RegistrationSource = z.infer<typeof RegistrationSource>;

export const RatingSourceType = z.enum([
  "tournament_result",
  "achievement",
  "manual_adjustment",
  "penalty",
]);
export type RatingSourceType = z.infer<typeof RatingSourceType>;

export const ROLE_LEVEL: Record<UserRole, number> = {
  player: 0,
  moderator: 1,
  admin: 2,
};

export function hasRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}

/** Statuses that occupy a seat at the table. */
export const OCCUPYING_STATUSES: RegistrationStatus[] = ["registered", "checked_in", "no_show"];

/** Statuses in which a tournament accepts new sign-ups. */
export const REGISTRABLE_STATUSES: TournamentStatus[] = ["announced", "reg_open"];
