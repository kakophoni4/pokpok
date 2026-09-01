import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";
import { PublicUser } from "./user.js";

/**
 * Rules for achievements the system grants on its own. Manual achievements
 * leave `rule` null and are handed out by staff.
 */
export const AchievementRule = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("wins_count"), threshold: z.number().int().positive() }),
  z.object({ kind: z.literal("games_played"), threshold: z.number().int().positive() }),
  z.object({ kind: z.literal("top3_count"), threshold: z.number().int().positive() }),
  z.object({ kind: z.literal("attendance_streak"), threshold: z.number().int().positive() }),
  z.object({ kind: z.literal("season_rank"), maxRank: z.number().int().positive() }),
]);
export type AchievementRule = z.infer<typeof AchievementRule>;

export const Achievement = z.object({
  id: Id,
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  ratingPoints: z.number().int(),
  isActive: z.boolean(),
  isRepeatable: z.boolean(),
  rule: AchievementRule.nullable(),
  /** How many players hold it — cheap social proof on the achievements page. */
  holdersCount: z.number().int().nonnegative().optional(),
});
export type Achievement = z.infer<typeof Achievement>;

export const CreateAchievementInput = z.object({
  /** Optional: the server mints a unique code from the title if omitted. */
  code: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9_]+$/, "Только латиница в нижнем регистре, цифры и подчёркивание")
    .optional(),
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullish(),
  /** Emoji or a URL to an uploaded image. */
  icon: z.string().trim().max(300).nullish(),
  ratingPoints: z.number().int().min(-1000).max(1000).default(0),
  isActive: z.boolean().default(true),
  isRepeatable: z.boolean().default(false),
  rule: AchievementRule.nullish(),
});
export type CreateAchievementInput = z.infer<typeof CreateAchievementInput>;

export const UpdateAchievementInput = CreateAchievementInput.partial().omit({ code: true });
export type UpdateAchievementInput = z.infer<typeof UpdateAchievementInput>;

export const UserAchievementView = z.object({
  id: Id,
  achievement: Achievement,
  grantedAt: IsoDateTime,
  grantedBy: PublicUser.nullable(),
  tournamentId: Id.nullable(),
  comment: z.string().nullable(),
});
export type UserAchievementView = z.infer<typeof UserAchievementView>;

export const GrantAchievementInput = z.object({
  userId: Id,
  achievementId: Id,
  tournamentId: Id.nullish(),
  comment: z.string().trim().max(200).nullish(),
});
export type GrantAchievementInput = z.infer<typeof GrantAchievementInput>;
