import { z } from "zod";
import { Id, IsoDateTime, patchShape } from "./common.js";
import { RatingSourceType } from "./enums.js";
import { PublicUser } from "./user.js";

/**
 * The rating follows the chips, the way a prize pool does: every entry and every
 * add-on adds chips to the table, the total divided by `divisor` is what the
 * winner takes, and each paid place below takes a share of that.
 *
 * Tunable per season, so the numbers can be corrected without a deploy. The
 * engine that consumes this lives in @poker/rating.
 */
export const RatingConfig = z.object({
  /** Chips handed out for the entry fee. */
  startingStack: z.number().int().positive().default(40_000),
  /** Chips an add-on adds. */
  addonChips: z.number().int().positive().default(80_000),
  /** Chips in play divided by this is what first place is worth. */
  divisor: z.number().positive().default(200),
  /** How many places earn rating, unless the tournament overrides it. */
  defaultPaidPlaces: z.number().int().positive().default(9),
  /** The last paid place gets this fraction of the winner's award. */
  lastPlaceShare: z.number().min(0).max(1).default(0.1),
  /** Above 1 the top places pull ahead; at 1 the shares fall in even steps. */
  shareCurve: z.number().min(0.2).max(5).default(2),
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

export const UpdateSeasonInput = z.object(patchShape(CreateSeasonInput.shape)).partial();
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
      paidPlaces: z.number().int().positive(),
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
