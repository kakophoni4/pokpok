import { z } from "zod";
import { Id } from "./common.js";

/**
 * A message waiting to reach a player, with the chat already resolved.
 *
 * The text is composed by whichever service raised the event, not by the bot.
 * Wording belongs next to the thing that happened — otherwise every new kind of
 * notification means teaching the transport about a new part of the domain.
 */
export const PendingNotification = z.object({
  id: Id,
  kind: z.string(),
  telegramId: z.string(),
  /** Telegram HTML, ready to send. */
  text: z.string(),
});
export type PendingNotification = z.infer<typeof PendingNotification>;

export const NotificationResultInput = z.object({
  id: Id,
  ok: z.boolean(),
  error: z.string().trim().max(400).nullish(),
});
export type NotificationResultInput = z.infer<typeof NotificationResultInput>;

export const PendingNotificationsQuery = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});
export type PendingNotificationsQuery = z.infer<typeof PendingNotificationsQuery>;
