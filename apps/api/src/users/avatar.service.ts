import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

export type AvatarImage = { body: Buffer; contentType: string };

type Entry = { image: AvatarImage | null; expiresAt: number };

/** A hit is good for a day; Telegram userpic URLs change rarely. */
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
/** A miss is retried sooner, in case the player just set a photo. */
const MISS_TTL_MS = 10 * 60 * 1000;
/** A whole club's worth of avatars, at a few dozen kB each. */
const MAX_ENTRIES = 300;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5000;

/**
 * Serves player avatars from our own origin.
 *
 * Telegram hosts them on t.me, which Russian ISPs block: players without a VPN
 * saw broken images all over the site. The server has no such problem, so it
 * fetches each photo once and hands out its own copy. Keeping the bytes in
 * memory rather than on disk means there is nothing to migrate or clean up —
 * a restart just refetches.
 */
@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);
  private readonly cache = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<AvatarImage | null>>();

  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<AvatarImage | null> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.image;

    // Two players opening the same roster must not start two downloads.
    const running = this.inFlight.get(userId);
    if (running) return running;

    const pending = this.load(userId).finally(() => this.inFlight.delete(userId));
    this.inFlight.set(userId, pending);
    return pending;
  }

  private async load(userId: string): Promise<AvatarImage | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    const image = user?.avatarUrl ? await this.download(user.avatarUrl) : null;
    this.remember(userId, image);
    return image;
  }

  private async download(url: string): Promise<AvatarImage | null> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) return null;

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) return null;

      const body = Buffer.from(await response.arrayBuffer());
      // An avatar is small; anything larger is not one, whatever it claims.
      if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return null;

      return { body, contentType };
    } catch (error) {
      this.logger.warn(`Could not fetch avatar from ${new URL(url).host}: ${String(error)}`);
      return null;
    }
  }

  private remember(userId: string, image: AvatarImage | null): void {
    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(userId, {
      image,
      expiresAt: Date.now() + (image ? HIT_TTL_MS : MISS_TTL_MS),
    });
  }
}
