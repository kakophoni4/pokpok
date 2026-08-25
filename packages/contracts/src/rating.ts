import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";
import { RatingSourceType } from "./enums.js";
import { PublicUser } from "./user.js";

/**
 * Tunable per season, so the formula can be corrected without a deploy.
 * The engine that consumes this lives in @poker/rating.
 */
export const RatingConfig = z.object({
  /** points = basePoints * multiplier * sqrt(fieldSize) / place^placeExponent */
  basePoints: z.number().positive().default(10),
  placeExponent: z.number().min(0).max(2).default(0.5),
  /** Floor so that showing up is always worth something. */
  participationPoints: z.number().int().nonnegative().default(5),
  /** Extra flat bonus for finishing in the money-equivalent zone. */
  itmBonus: z.number().int().nonnegative().default(10),
  /** Share of the field that counts as "in the money", e.g. 0.2 = top 20%. */
  itmShare: z.number().min(0).max(1).default(0.2),
  /** Flat bonus per knockout, if the club tracks them. */
  knockoutPoints: z.number().int().nonnegative().default(0),
  /** Deducted when a player signs up and does not show. */
  noShowPenalty: z.number().int().nonnegative().default(10),
  /** Only the N best results count toward the season standings; 0 means all count. */
  bestOfCount: z.number().int().nonnegative().default(0),
});
export type RatingConfig = z.infer<typeof RatingConfig>;

export const DEFAULT_RATING_CONFIG: RatingConfig = RatingConfig.parse({});

export const Season = z.object({
  id: Id,
  title: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime.nullable(),
  isActive: z.boolean(),
  ratingConfig: RatingConfig,
});
export type Season = z.infer<typeof Season>;

export const CreateSeasonInput = z.object({
  title: z.string().trim().min(3).max(80),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime.nullish(),
  isActive: z.boolean().default(false),
  ratingConfig: RatingConfig.default(DEFAULT_RATING_CONFIG),
});
export type CreateSeasonInput = z.infer<typeof CreateSeasonInput>;

export const UpdateSeasonInput = CreateSeasonInput.partial();
export type UpdateSeasonInput = z.infer<typeof UpdateSeasonInput>;

export const LeaderboardRow = z.object({
  rank: z.number().int().positive(),
  user: PublicUser,
  points: z.number().int(),
  gamesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  top3: z.number().int().nonnegative(),
  itm: z.number().int().nonnegative(),
  avgPlace: z.number().nullable(),
  bestPlace: z.number().int().positive().nullable(),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRow>;

export const LeaderboardQuery = z.object({
  seasonId: Id.optional(),
  /** "all_time" ignores the season and sums every rating event ever. */
  scope: z.enum(["season", "all_time"]).default("season"),
  search: z.string().trim().max(64).optional(),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuery>;

/** One line in the player's personal history: what happened and what it was worth. */
export const RatingEventView = z.object({
  id: Id,
  createdAt: IsoDateTime,
  points: z.number().int(),
  sourceType: RatingSourceType,
  comment: z.string().nullable(),
  tournament: z
    .object({
      id: Id,
      title: z.string(),
      startsAt: IsoDateTime,
      /** 0 for events that are not tied to a finished standings table. */
      fieldSize: z.number().int().nonnegative(),
    })
    .nullable(),
  place: z.number().int().positive().nullable(),
  achievement: z.object({ id: Id, title: z.string(), icon: z.string().nullable() }).nullable(),
});
export type RatingEventView = z.infer<typeof RatingEventView>;

export const PlayerStats = z.object({
  user: PublicUser,
  seasonId: Id.nullable(),
  points: z.number().int(),
  rank: z.number().int().positive().nullable(),
  gamesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  top3: z.number().int().nonnegative(),
  itm: z.number().int().nonnegative(),
  avgPlace: z.number().nullable(),
  bestPlace: z.number().int().positive().nullable(),
  /** Cumulative points over time, for the profile chart. */
  progression: z.array(z.object({ date: IsoDateTime, points: z.number().int() })),
  history: z.array(RatingEventView),
});
export type PlayerStats = z.infer<typeof PlayerStats>;

export const ManualAdjustmentInput = z.object({
  userId: Id,
  seasonId: Id.nullish(),
  points: z.number().int(),
  comment: z.string().trim().min(3).max(200),
});
export type ManualAdjustmentInput = z.infer<typeof ManualAdjustmentInput>;
