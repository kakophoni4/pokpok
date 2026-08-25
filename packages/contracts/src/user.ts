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
  avatarUrl: z.url().nullable(),
  role: UserRole,
});
export type PublicUser = z.infer<typeof PublicUser>;

/** What the authenticated user sees about themselves. */
export const MeUser = PublicUser.extend({
  displayName: z.string().nullable(),
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
