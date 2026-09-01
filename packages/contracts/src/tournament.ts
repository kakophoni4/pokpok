import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";
import { PaymentKind, RegistrationSource, RegistrationStatus, TournamentStatus } from "./enums.js";
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
  status: TournamentStatus,
  startsAt: IsoDateTime,
  regOpensAt: IsoDateTime.nullable(),
  regClosesAt: IsoDateTime.nullable(),
  capacity: z.number().int().positive().nullable(),
  ratingMultiplier: z.number().positive(),
  /** How many places earn rating. Editable while the game is running. */
  paidPlaces: z.number().int().positive(),
  /** Season points needed to sign up. Null means anyone may register. */
  minRating: z.number().int().nonnegative().nullable(),
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
  ratingPoints: z.number().int(),
});
export type ResultView = z.infer<typeof ResultView>;

/** One line on a player's tab: what was paid for and what chips it bought. */
export const PaymentView = z.object({
  id: Id,
  kind: PaymentKind,
  amountRub: z.number().int().nonnegative(),
  chips: z.number().int().nonnegative(),
  note: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type PaymentView = z.infer<typeof PaymentView>;

/**
 * A player as the cash desk sees them. Having an entry payment is what makes
 * somebody a participant — there is no separate attendance mark.
 */
export const TournamentPlayer = z.object({
  user: PublicUser,
  payments: z.array(PaymentView),
  totalRub: z.number().int().nonnegative(),
  chips: z.number().int().nonnegative(),
  place: z.number().int().positive().nullable(),
  /** Filled in once the tournament is finished. */
  ratingPoints: z.number().int().nullable(),
});
export type TournamentPlayer = z.infer<typeof TournamentPlayer>;

/**
 * Where the bot's live screens live in the admin supergroup. Persisted so a bot
 * restart keeps editing the same topic and the same player cards instead of
 * posting a second set of them.
 */
export const AdminScreens = z.object({
  topicId: z.number().int().nullable(),
  boardMsgId: z.number().int().nullable(),
  cards: z.array(z.object({ userId: Id, msgId: z.number().int() })),
});
export type AdminScreens = z.infer<typeof AdminScreens>;

export const SaveAdminScreensInput = z.object({
  topicId: z.number().int().nullish(),
  boardMsgId: z.number().int().nullish(),
  cards: z.array(z.object({ userId: Id, msgId: z.number().int() })).optional(),
});
export type SaveAdminScreensInput = z.infer<typeof SaveAdminScreensInput>;

export const TournamentDetail = TournamentSummary.extend({
  description: z.string().nullable(),
  seasonId: Id.nullable(),
  /** Effective values: the tournament's own, or the season's defaults. */
  startingStack: z.number().int().positive(),
  addonChips: z.number().int().positive(),
  /** Sum of the chips every payment handed out. Drives the rating. */
  chipsInPlay: z.number().int().nonnegative(),
  /** What first place is worth as things stand. */
  ratingPool: z.number().int().nonnegative(),
  registrations: z.array(RegistrationView),
  results: z.array(ResultView),
  /** Money is staff-only, so this is absent for everybody else. */
  players: z.array(TournamentPlayer).nullish(),
  totalRub: z.number().int().nonnegative().nullish(),
  adminScreens: AdminScreens.nullish(),
  /** Combo awards handed out this evening. Staff-only. */
  eveningGrants: z.array(z.object({ id: Id, userId: Id, achievementId: Id })).nullish(),
});
export type TournamentDetail = z.infer<typeof TournamentDetail>;

export const TournamentListQuery = z.object({
  status: z.union([TournamentStatus, z.array(TournamentStatus)]).optional(),
  seasonId: Id.optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  /** Convenience filter used by the schedule page and the bot. */
  scope: z.enum(["upcoming", "past", "all"]).default("upcoming"),
});
export type TournamentListQuery = z.infer<typeof TournamentListQuery>;

const TournamentInputShape = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000).nullish(),
  seasonId: Id.nullish(),
  venueId: Id.nullish(),
  startsAt: IsoDateTime,
  regOpensAt: IsoDateTime.nullish(),
  regClosesAt: IsoDateTime.nullish(),
  capacity: z.number().int().min(2).max(1000).nullish(),
  /** Null falls back to the season's default. */
  paidPlaces: z.number().int().min(1).max(500).nullish(),
  startingStack: z.number().int().positive().nullish(),
  addonChips: z.number().int().positive().nullish(),
  ratingMultiplier: z.number().min(0.1).max(10).default(1),
  minRating: z.number().int().min(0).max(1_000_000).nullish(),
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
  /** Admins may sign somebody else up; players may only sign up themselves. */
  userId: Id.optional(),
  source: RegistrationSource.default("web"),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

/**
 * Adding a line to a player's tab. `chips` is optional: entry and add-on default
 * to the tournament's stack sizes, and anything else hands out no chips.
 */
export const AddPaymentInput = z.object({
  userId: Id,
  kind: PaymentKind,
  /** When set, price and chips come from this till item. */
  menuItemId: Id.optional(),
  amountRub: z.number().int().min(0).max(1_000_000),
  /**
   * Double or triple stack in one tap. Multiplies the chips that kind would
   * normally hand out; the amount is whatever the till already sent.
   */
  multiplier: z.number().int().min(1).max(3).optional(),
  chips: z.number().int().nonnegative().nullish(),
  note: z.string().trim().max(200).nullish(),
});
export type AddPaymentInput = z.infer<typeof AddPaymentInput>;

/** Assigning a finishing place as players bust out. Null clears it. */
export const SetPlaceInput = z.object({
  userId: Id,
  place: z.number().int().positive().max(1000).nullable(),
});
export type SetPlaceInput = z.infer<typeof SetPlaceInput>;

export const ResultEntry = z.object({
  userId: Id,
  place: z.number().int().positive(),
});
export type ResultEntry = z.infer<typeof ResultEntry>;

/**
 * The whole standings table at once, for entering an evening from the website.
 * Places have to be unique but may have gaps: only the paid places earn anything,
 * so arguing about who was exactly 14th of 20 is not worth anyone's evening.
 */
export const SubmitResultsInput = z
  .object({
    entries: z.array(ResultEntry).min(1, "Нужен хотя бы один участник"),
  })
  .superRefine(({ entries }, ctx) => {
    if (new Set(entries.map((e) => e.userId)).size !== entries.length) {
      ctx.addIssue({ code: "custom", message: "Игрок встречается дважды", path: ["entries"] });
    }

    if (new Set(entries.map((e) => e.place)).size !== entries.length) {
      ctx.addIssue({ code: "custom", message: "Место занято дважды", path: ["entries"] });
    }
  });
export type SubmitResultsInput = z.infer<typeof SubmitResultsInput>;
