import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";
import {
  GameType,
  RegistrationSource,
  RegistrationStatus,
  TournamentStatus,
} from "./enums.js";
import { PublicUser } from "./user.js";

export const Venue = z.object({
  id: Id,
  title: z.string(),
  address: z.string().nullable(),
});
export type Venue = z.infer<typeof Venue>;

export const MyRegistration = z.object({
  id: Id,
  status: RegistrationStatus,
  waitlistPosition: z.number().int().positive().nullable(),
  createdAt: IsoDateTime,
});
export type MyRegistration = z.infer<typeof MyRegistration>;

export const TournamentSummary = z.object({
  id: Id,
  title: z.string(),
  gameType: GameType,
  status: TournamentStatus,
  startsAt: IsoDateTime,
  regOpensAt: IsoDateTime.nullable(),
  regClosesAt: IsoDateTime.nullable(),
  capacity: z.number().int().positive().nullable(),
  ratingMultiplier: z.number().positive(),
  venue: Venue.nullable(),
  registeredCount: z.number().int().nonnegative(),
  waitlistCount: z.number().int().nonnegative(),
  /** Present only for authenticated requests. */
  myRegistration: MyRegistration.nullish(),
});
export type TournamentSummary = z.infer<typeof TournamentSummary>;

export const RegistrationView = z.object({
  id: Id,
  user: PublicUser,
  status: RegistrationStatus,
  source: RegistrationSource,
  waitlistPosition: z.number().int().positive().nullable(),
  createdAt: IsoDateTime,
});
export type RegistrationView = z.infer<typeof RegistrationView>;

export const ResultView = z.object({
  place: z.number().int().positive(),
  user: PublicUser,
  knockouts: z.number().int().nonnegative().nullable(),
  rebuys: z.number().int().nonnegative().nullable(),
  ratingPoints: z.number().int(),
});
export type ResultView = z.infer<typeof ResultView>;

export const TournamentDetail = TournamentSummary.extend({
  description: z.string().nullable(),
  buyinChips: z.number().int().positive().nullable(),
  seasonId: Id.nullable(),
  registrations: z.array(RegistrationView),
  results: z.array(ResultView),
});
export type TournamentDetail = z.infer<typeof TournamentDetail>;

export const TournamentListQuery = z.object({
  status: z.union([TournamentStatus, z.array(TournamentStatus)]).optional(),
  seasonId: Id.optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  /** Convenience filter used by the schedule page and both bots. */
  scope: z.enum(["upcoming", "past", "all"]).default("upcoming"),
});
export type TournamentListQuery = z.infer<typeof TournamentListQuery>;

const TournamentInputShape = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000).nullish(),
  gameType: GameType.default("nlh"),
  seasonId: Id.nullish(),
  venueId: Id.nullish(),
  startsAt: IsoDateTime,
  regOpensAt: IsoDateTime.nullish(),
  regClosesAt: IsoDateTime.nullish(),
  capacity: z.number().int().min(2).max(1000).nullish(),
  buyinChips: z.number().int().positive().nullish(),
  ratingMultiplier: z.number().min(0.1).max(10).default(1),
  status: TournamentStatus.default("draft"),
});

type TournamentWindow = {
  startsAt?: string | undefined;
  regOpensAt?: string | null | undefined;
  regClosesAt?: string | null | undefined;
};

/**
 * Applied to both create and update. Kept as a helper because Zod refuses
 * `.partial()` on a schema that already carries refinements.
 */
function withScheduleChecks<T extends z.ZodType<TournamentWindow>>(schema: T) {
  return schema
    .refine((v) => !v.regClosesAt || !v.regOpensAt || v.regOpensAt <= v.regClosesAt, {
      message: "Регистрация не может закрываться раньше, чем открывается",
      path: ["regClosesAt"],
    })
    .refine((v) => !v.regOpensAt || !v.startsAt || v.regOpensAt <= v.startsAt, {
      message: "Регистрация должна открываться до старта турнира",
      path: ["regOpensAt"],
    });
}

export const CreateTournamentInput = withScheduleChecks(TournamentInputShape);
export type CreateTournamentInput = z.infer<typeof CreateTournamentInput>;

export const UpdateTournamentInput = withScheduleChecks(TournamentInputShape.partial());
export type UpdateTournamentInput = z.infer<typeof UpdateTournamentInput>;

export const RegisterInput = z.object({
  /** Staff may sign somebody else up; players may only sign up themselves. */
  userId: Id.optional(),
  source: RegistrationSource.default("web"),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const ResultEntry = z.object({
  userId: Id,
  place: z.number().int().positive(),
  knockouts: z.number().int().nonnegative().nullish(),
  rebuys: z.number().int().nonnegative().nullish(),
});
export type ResultEntry = z.infer<typeof ResultEntry>;

/**
 * Results are submitted as a full standings table, never row by row: the rating
 * of every participant depends on the field size, so a partial table is meaningless.
 */
export const SubmitResultsInput = z
  .object({
    entries: z.array(ResultEntry).min(2, "Нужно минимум два участника"),
  })
  .superRefine(({ entries }, ctx) => {
    const userIds = new Set(entries.map((e) => e.userId));
    if (userIds.size !== entries.length) {
      ctx.addIssue({ code: "custom", message: "Игрок встречается дважды", path: ["entries"] });
    }

    const places = entries.map((e) => e.place).sort((a, b) => a - b);
    const expected = places.every((place, index) => place === index + 1);
    if (!expected) {
      ctx.addIssue({
        code: "custom",
        message: `Места должны идти без пропусков от 1 до ${entries.length}`,
        path: ["entries"],
      });
    }
  });
export type SubmitResultsInput = z.infer<typeof SubmitResultsInput>;
