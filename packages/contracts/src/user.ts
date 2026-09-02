import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";
import { AuthProvider, UserRole, UserStatus } from "./enums.js";

/** Latin and Cyrillic letters, digits, underscore, dash, dot. No spaces, no lookalike tricks. */
export const NICKNAME_REGEX = /^[A-Za-zА-Яа-яЁё0-9._-]+$/u;

export const Nickname = z
  .string()
  .trim()
  .min(2, "Ник не короче 2 символов")
  .max(24, "Ник не длиннее 24 символов")
  .regex(NICKNAME_REGEX, "Разрешены буквы, цифры, точка, дефис и подчёркивание");
export type Nickname = z.infer<typeof Nickname>;

export const LinkedIdentity = z.object({
  provider: AuthProvider,
  username: z.string().nullable(),
  linkedAt: IsoDateTime,
});
export type LinkedIdentity = z.infer<typeof LinkedIdentity>;

/** What any visitor may see about a player. */
export const PublicUser = z.object({
  id: Id,
  nickname: Nickname,
  /** Telegram first+last name, when we have it. Format with `formatPlayerName`. */
  displayName: z.string().nullable(),
  /**
   * A path on this origin, not the photo's original home. Telegram hosts
   * avatars on t.me, which Russian ISPs block, so the API serves its own copy.
   */
  avatarUrl: z.string().nullable(),
  role: UserRole,
});
export type PublicUser = z.infer<typeof PublicUser>;

/**
 * What to put on a card instead of the Telegram handle.
 *
 * A real first+last name becomes "Дмитрий Т." so a username is not a public
 * link. A phrase like "рома рома мен вил" (Telegram first_name with no surname)
 * is shown in full - it is already the name they chose, not a handle.
 */
export function formatPlayerName(
  displayName: string | null | undefined,
  nickname: string,
): string {
  const raw = displayName?.trim();
  if (!raw) return nickname;

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && isSurname(parts[1] ?? "")) {
    const initial = (parts[1] ?? "").charAt(0).toLocaleUpperCase("ru-RU");
    return `${parts[0]} ${initial}.`;
  }
  return raw;
}

/** One alphabetic token: Ковалёв, Smith, Салтыкова-Щедрина. Not a nick or an initial. */
function isSurname(word: string): boolean {
  return /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё'-]{1,23}$/u.test(word);
}

/** What the authenticated user sees about themselves. */
export const MeUser = PublicUser.extend({
  status: UserStatus,
  identities: z.array(LinkedIdentity),
  createdAt: IsoDateTime,
});
export type MeUser = z.infer<typeof MeUser>;

/** Nickname is intentionally absent: only staff can change it (see AdminUpdateUserInput). */
export const UpdateMeInput = z.object({
  displayName: z.string().trim().max(64).nullish(),
  notifyBeforeTournament: z.boolean().optional(),
});
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;

export const AdminUpdateUserInput = z.object({
  nickname: Nickname.optional(),
  displayName: z.string().trim().max(64).nullish(),
  role: UserRole.optional(),
  status: UserStatus.optional(),
});
export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserInput>;

export const UserListQuery = z.object({
  search: z.string().trim().max(64).optional(),
  role: UserRole.optional(),
  status: UserStatus.optional(),
});
export type UserListQuery = z.infer<typeof UserListQuery>;
