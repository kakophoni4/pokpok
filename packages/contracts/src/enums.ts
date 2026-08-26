import { z } from "zod";

/**
 * These enums are mirrored in apps/api/prisma/schema.prisma.
 * The parity test in packages/contracts/src/enums.test.ts fails if they drift.
 */

export const AuthProvider = z.enum(["telegram", "vk"]);
export type AuthProvider = z.infer<typeof AuthProvider>;

/** The club runs on two roles: everyone plays, a few people run the evening. */
export const UserRole = z.enum(["player", "admin"]);
export type UserRole = z.infer<typeof UserRole>;

export const UserStatus = z.enum(["active", "blocked"]);
export type UserStatus = z.infer<typeof UserStatus>;

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

/**
 * Statuses a player can hold for a tournament. There is deliberately no
 * "arrived" or "no-show": whoever paid the entry fee played, and that is
 * recorded as a payment, not as an attendance flag.
 */
export const RegistrationStatus = z.enum(["registered", "waitlist", "cancelled"]);
export type RegistrationStatus = z.infer<typeof RegistrationStatus>;

/**
 * What the club took money for. Entry and add-on also hand out chips, which is
 * what the rating is computed from; a drink is money only.
 */
export const PaymentKind = z.enum(["entry", "addon", "drink", "other"]);
export type PaymentKind = z.infer<typeof PaymentKind>;

/**
 * A website login waiting on a tap in the bot. Expiry is a timestamp rather than
 * a state, so nothing has to sweep abandoned tickets into place.
 */
export const LoginTicketState = z.enum(["pending", "confirmed", "declined"]);
export type LoginTicketState = z.infer<typeof LoginTicketState>;

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
  admin: 1,
};

export function hasRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}

/** Statuses that occupy a seat at the table. */
export const OCCUPYING_STATUSES: RegistrationStatus[] = ["registered"];

/** Statuses in which a tournament accepts new sign-ups. */
export const REGISTRABLE_STATUSES: TournamentStatus[] = ["announced", "reg_open"];
