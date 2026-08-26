import { z } from "zod";

/**
 * Club-wide settings: one row, edited by admins, read by everything.
 *
 * The timezone lives here rather than in the code because it is what every date
 * on the site and in the bot is rendered in. The club plays in Samara, and a
 * player opening the schedule from a phone set to another timezone must still
 * see the hour the game actually starts.
 */
export const ClubSettings = z.object({
  /** Free-form text behind the bot's "как нас найти" button. */
  infoText: z.string(),
  /** Defaults offered as buttons at the cash desk; the amount stays editable. */
  entryPriceRub: z.number().int().nonnegative(),
  addonPriceRub: z.number().int().nonnegative(),
  drinkPriceRub: z.number().int().nonnegative(),
  /** Supergroup the bot runs the live admin screens in. */
  adminChatId: z.string().nullable(),
  timezone: z.string(),
});
export type ClubSettings = z.infer<typeof ClubSettings>;

export const UpdateClubSettingsInput = z.object({
  infoText: z.string().trim().max(4000).optional(),
  entryPriceRub: z.number().int().min(0).max(1_000_000).optional(),
  addonPriceRub: z.number().int().min(0).max(1_000_000).optional(),
  drinkPriceRub: z.number().int().min(0).max(1_000_000).optional(),
  adminChatId: z.string().trim().max(64).nullish(),
  timezone: z.string().trim().max(64).optional(),
});
export type UpdateClubSettingsInput = z.infer<typeof UpdateClubSettingsInput>;

/**
 * Where the club plays, and therefore the only timezone dates are shown in.
 * Samara sits at UTC+4 with no daylight saving, and its IANA zone lives under
 * Europe despite the city being east of the Volga.
 */
export const CLUB_TIMEZONE = "Europe/Samara";
