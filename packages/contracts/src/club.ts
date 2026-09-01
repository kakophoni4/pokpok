import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";
import { PaymentKind } from "./enums.js";

/**
 * One thing a promo hands out: a stack (адон / ребай) or a bar SKU, any count.
 * Several grants make a combo — addon + hookah, two hookahs, whatever the
 * evening needs.
 */
export const PromoGrant = z.object({
  kind: PaymentKind,
  quantity: z.number().int().min(1).max(20),
  menuItemId: Id.optional(),
  title: z.string().trim().min(1).max(80).optional(),
});
export type PromoGrant = z.infer<typeof PromoGrant>;

export const PromoBundle = z.array(PromoGrant).max(8);
export type PromoBundle = z.infer<typeof PromoBundle>;

/**
 * One button on the till: a fixed fee (вход / адон / ребай), an extra SKU
 * such as a drink, or a promo that still hands out chips.
 */
export const ClubMenuItem = z.object({
  id: Id,
  title: z.string(),
  kind: PaymentKind,
  priceRub: z.number().int().nonnegative(),
  /** Extra chips this purchase adds. 0 means "use the tournament stack". */
  chips: z.number().int().nonnegative(),
  isFixed: z.boolean(),
  isPromo: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  /** Promo contents. Empty/null means the line is just `kind` (legacy). */
  bundle: PromoBundle.nullable(),
});
export type ClubMenuItem = z.infer<typeof ClubMenuItem>;

export const CreateClubMenuItemInput = z.object({
  title: z.string().trim().min(2).max(80),
  kind: PaymentKind.default("other"),
  priceRub: z.number().int().min(0).max(1_000_000).default(0),
  chips: z.number().int().min(0).max(10_000_000).default(0),
  isPromo: z.boolean().default(false),
  isActive: z.boolean().default(true),
  bundle: PromoBundle.optional(),
});
export type CreateClubMenuItemInput = z.infer<typeof CreateClubMenuItemInput>;

export const UpdateClubMenuItemInput = z.object({
  title: z.string().trim().min(2).max(80).optional(),
  kind: PaymentKind.optional(),
  priceRub: z.number().int().min(0).max(1_000_000).optional(),
  chips: z.number().int().min(0).max(10_000_000).optional(),
  isPromo: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  bundle: PromoBundle.nullable().optional(),
});
export type UpdateClubMenuItemInput = z.infer<typeof UpdateClubMenuItemInput>;

const KIND_TITLE: Record<PaymentKind, string> = {
  entry: "Вход",
  rebuy: "Ребай",
  addon: "Адон",
  drink: "Напиток",
  other: "Прочее",
};

export function parsePromoBundle(raw: unknown): PromoGrant[] {
  const parsed = PromoBundle.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function promoKindFromBundle(bundle: PromoGrant[]): PaymentKind {
  if (bundle.length === 0) return "other";
  const first = bundle[0]!.kind;
  return bundle.every((grant) => grant.kind === first) ? first : "other";
}

export function promoGrantLabel(grant: PromoGrant): string {
  const title = grant.title?.trim() || KIND_TITLE[grant.kind];
  return grant.quantity > 1 ? `${title} ×${grant.quantity}` : title;
}

export function promoBundleLabel(
  bundle: PromoGrant[] | null | undefined,
  fallbackKind: PaymentKind,
): string {
  if (!bundle || bundle.length === 0) return KIND_TITLE[fallbackKind];
  return bundle.map(promoGrantLabel).join(" + ");
}

/**
 * Club-wide settings: one row, edited by admins, read by everything.
 *
 * Dates are always rendered in Samara time. The timezone field stays on the
 * payload so older clients keep working; the site no longer lets anyone change it.
 */
export const ClubSettings = z.object({
  infoText: z.string(),
  entryPriceRub: z.number().int().nonnegative(),
  rebuyPriceRub: z.number().int().nonnegative(),
  addonPriceRub: z.number().int().nonnegative(),
  drinkPriceRub: z.number().int().nonnegative(),
  adminChatId: z.string().nullable(),
  timezone: z.string(),
  menuItems: z.array(ClubMenuItem),
});
export type ClubSettings = z.infer<typeof ClubSettings>;

export const UpdateClubSettingsInput = z.object({
  infoText: z.string().trim().max(4000).optional(),
  entryPriceRub: z.number().int().min(0).max(1_000_000).optional(),
  rebuyPriceRub: z.number().int().min(0).max(1_000_000).optional(),
  addonPriceRub: z.number().int().min(0).max(1_000_000).optional(),
  drinkPriceRub: z.number().int().min(0).max(1_000_000).optional(),
  adminChatId: z.string().trim().max(64).nullish(),
});
export type UpdateClubSettingsInput = z.infer<typeof UpdateClubSettingsInput>;

/**
 * Where the club plays, and therefore the only timezone dates are shown in.
 * Samara sits at UTC+4 with no daylight saving, and its IANA zone lives under
 * Europe despite the city being east of the Volga.
 */
export const CLUB_TIMEZONE = "Europe/Samara";

export const SalesPeriod = z.enum(["week", "month", "season", "all"]);
export type SalesPeriod = z.infer<typeof SalesPeriod>;

export const SalesQuery = z.object({
  period: SalesPeriod.default("month"),
  seasonId: Id.optional(),
});
export type SalesQuery = z.infer<typeof SalesQuery>;

export const SalesLine = z.object({
  title: z.string(),
  kind: PaymentKind,
  count: z.number().int().nonnegative(),
  amountRub: z.number().int().nonnegative(),
  chips: z.number().int().nonnegative(),
});
export type SalesLine = z.infer<typeof SalesLine>;

export const SalesReport = z.object({
  period: SalesPeriod,
  from: IsoDateTime.nullable(),
  to: IsoDateTime,
  seasonId: Id.nullable(),
  seasonTitle: z.string().nullable(),
  tournamentCount: z.number().int().nonnegative(),
  paymentCount: z.number().int().nonnegative(),
  totalRub: z.number().int().nonnegative(),
  totalChips: z.number().int().nonnegative(),
  lines: z.array(SalesLine),
});
export type SalesReport = z.infer<typeof SalesReport>;
