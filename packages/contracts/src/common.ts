import { z } from "zod";

export const Id = z.cuid2();
export type Id = z.infer<typeof Id>;

/** Dates cross the wire as ISO-8601 strings and are parsed into Date on the client edge. */
export const IsoDateTime = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    perPage: z.number().int().min(1),
    hasNext: z.boolean(),
  });
}

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  hasNext: boolean;
};

type WithoutDefaults<S extends z.ZodRawShape> = {
  [K in keyof S]: S[K] extends z.ZodDefault<infer Inner> ? Inner : S[K];
};

/**
 * Strips `.default()` off every field of a create schema so it can be reused
 * for a PATCH.
 *
 * Zod 4 keeps the default underneath `.partial()`, so an omitted field arrives
 * as its create-time value instead of "leave this alone". That silently turned
 * every edited tournament back into a draft and wiped it from the schedule.
 */
export function patchShape<S extends z.ZodRawShape>(shape: S): WithoutDefaults<S> {
  const stripped: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(shape)) {
    stripped[key] = field instanceof z.ZodDefault ? field.def.innerType : field;
  }
  return stripped as unknown as WithoutDefaults<S>;
}

/** Shape of every non-2xx response, so clients have exactly one error branch to handle. */
export const ApiError = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
