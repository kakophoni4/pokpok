import type { PendingNotification } from "@poker/contracts";
import { InlineKeyboard, type Bot } from "grammy";
import type { Api } from "./api.js";

const POLL_MS = 10_000;
const BATCH = 20;
/** Telegram's own limit is 30 messages a second; a club never needs that. */
const GAP_MS = 120;

/**
 * Delivers what the API queued.
 *
 * The API decides what to say and to whom; this only carries it. That split is
 * what lets a prize granted while the bot was restarting still arrive — the
 * message was written to the database in the same transaction as the prize, and
 * it waits there until somebody picks it up.
 */
export class Notifier {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly bot: Bot,
    private readonly api: Api,
    private readonly webUrl: string,
    private readonly log: (message: string) => void,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    // Anything queued while the bot was down should not wait for the first tick.
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Overlapping ticks would hand the same batch to two senders. */
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.api.internal<PendingNotification[]>(
        "/notifications/internal/claim",
        { limit: BATCH },
      );
      for (const message of pending) {
        await this.deliver(message);
        await sleep(GAP_MS);
      }
    } catch (error) {
      this.log(`не удалось забрать уведомления: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async deliver(message: PendingNotification): Promise<void> {
    try {
      await this.bot.api.sendMessage(message.telegramId, message.text, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().webApp("♠ Открыть клуб", this.webUrl),
        link_preview_options: { is_disabled: true },
      });
      await this.settle(message.id, true);
    } catch (error) {
      // A player who blocked the bot is not a fault worth shouting about, but
      // the row still has to stop being handed out for ever.
      this.log(`уведомление ${message.id} не доставлено: ${String(error)}`);
      await this.settle(message.id, false, String(error));
    }
  }

  private async settle(id: string, ok: boolean, error?: string): Promise<void> {
    try {
      await this.api.internal("/notifications/internal/settle", { id, ok, error: error ?? null });
    } catch (settleError) {
      // The attempt was already counted server-side, so a lost acknowledgement
      // costs one retry rather than a duplicate message.
      this.log(`не удалось отметить уведомление ${id}: ${String(settleError)}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
