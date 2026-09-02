import { Injectable, Logger } from "@nestjs/common";
import type { PendingNotification } from "@poker/contracts";
import { PrismaService } from "../common/prisma/prisma.service";
import type { Prisma } from "../generated/prisma/client";

/** After this many tries a message is not going to arrive, and retrying is noise. */
const MAX_ATTEMPTS = 5;
const RETRY_AFTER_MS = 60_000;

export type QueuedMessage = {
  userId: string;
  /** Machine name of the event, e.g. "prize.granted". */
  kind: string;
  /** Makes a retry of the same event reuse the row instead of writing a second one. */
  dedupeKey: string;
  /** Telegram HTML. */
  text: string;
  /** Anything worth keeping about the event besides the rendered text. */
  context?: Record<string, unknown>;
};

/**
 * The outbox.
 *
 * Messages are written in the same transaction as the change that causes them,
 * so a prize that exists is always a prize the player was told about — even if
 * the bot was down at that second. Delivery is the bot's job; it claims batches
 * from here and reports back.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async queue(db: Prisma.TransactionClient, message: QueuedMessage): Promise<void> {
    await db.outbox.upsert({
      where: {
        userId_kind_dedupeKey: {
          userId: message.userId,
          kind: message.kind,
          dedupeKey: message.dedupeKey,
        },
      },
      create: {
        userId: message.userId,
        channel: "telegram",
        kind: message.kind,
        dedupeKey: message.dedupeKey,
        payload: { text: message.text, ...(message.context ?? {}) } as never,
        scheduledAt: new Date(),
      },
      update: {},
    });
  }

  /**
   * Hands the bot a batch to send, counting the attempt as it goes.
   *
   * The attempt is booked here rather than on the way back so a message that
   * kills the bot mid-send still runs out of tries instead of being redelivered
   * for ever.
   */
  async claim(limit: number): Promise<PendingNotification[]> {
    const rows = await this.prisma.outbox.findMany({
      where: {
        sentAt: null,
        scheduledAt: { lte: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
        channel: "telegram",
      },
      orderBy: { scheduledAt: "asc" },
      take: limit,
      include: {
        user: {
          select: {
            identities: {
              where: { provider: "telegram" },
              select: { providerUserId: true },
              take: 1,
            },
          },
        },
      },
    });
    if (rows.length === 0) return [];

    await this.prisma.outbox.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { attempts: { increment: 1 } },
    });

    const ready: PendingNotification[] = [];
    const undeliverable: string[] = [];

    for (const row of rows) {
      const telegramId = row.user.identities[0]?.providerUserId;
      if (!telegramId) {
        undeliverable.push(row.id);
        continue;
      }
      const payload = row.payload as { text?: unknown } | null;
      const text = typeof payload?.text === "string" ? payload.text : null;
      if (!text) {
        undeliverable.push(row.id);
        continue;
      }
      ready.push({ id: row.id, kind: row.kind, telegramId, text });
    }

    if (undeliverable.length > 0) {
      // A player who never opened the bot has no chat to write to. Retrying
      // that for ever would bury the queue under messages nobody can receive.
      await this.prisma.outbox.updateMany({
        where: { id: { in: undeliverable } },
        data: { sentAt: new Date(), lastError: "Нет Telegram, доставить некуда" },
      });
    }

    return ready;
  }

  async settle(id: string, ok: boolean, error?: string | null): Promise<void> {
    if (ok) {
      await this.prisma.outbox.update({ where: { id }, data: { sentAt: new Date(), lastError: null } });
      return;
    }

    this.logger.warn(`Notification ${id} was not delivered: ${error ?? "unknown"}`);
    await this.prisma.outbox.update({
      where: { id },
      data: {
        lastError: (error ?? "unknown").slice(0, 400),
        scheduledAt: new Date(Date.now() + RETRY_AFTER_MS),
      },
    });
  }
}

/** Telegram's HTML parser is strict about these three, and only these three. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
