import type { SessionResponse } from "@poker/contracts";
import type { BotConfig } from "./config.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type TelegramProfile = {
  id: number;
  username?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
};

type CachedSession = { accessToken: string; expiresAt: number; userId: string; nickname: string };

/**
 * API client for the bot.
 *
 * The bot never talks to the database and holds no business rules: it exchanges
 * a Telegram identity for a normal user session over an internal endpoint, then
 * calls the same public API the website uses. Registration limits, waiting lists
 * and rating all stay in one place, so the bot cannot drift from the site.
 */
export class Api {
  private readonly sessions = new Map<number, CachedSession>();

  constructor(private readonly config: BotConfig) {}

  /** Session for a Telegram user, created on first use and refreshed when stale. */
  async session(profile: TelegramProfile): Promise<CachedSession> {
    const cached = this.sessions.get(profile.id);
    // A minute of slack so a long-running command cannot expire mid-flight.
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

    const response = await this.request("POST", "/auth/internal/provider-session", {
      internal: true,
      body: {
        provider: "telegram",
        providerUserId: String(profile.id),
        username: profile.username ?? null,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
        photoUrl: null,
        raw: { source: "tg_bot" },
      },
    });

    const session = response as SessionResponse;
    const entry: CachedSession = {
      accessToken: session.accessToken,
      expiresAt: Date.now() + session.expiresIn * 1000,
      userId: session.user.id,
      nickname: session.user.nickname,
    };
    this.sessions.set(profile.id, entry);
    return entry;
  }

  async asUser<T>(
    profile: TelegramProfile,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const session = await this.session(profile);

    try {
      return (await this.request(method, path, { token: session.accessToken, body })) as T;
    } catch (error) {
      // The API restarted or revoked the token: drop it and try once more.
      if (error instanceof ApiError && error.status === 401) {
        this.sessions.delete(profile.id);
        const fresh = await this.session(profile);
        return (await this.request(method, path, { token: fresh.accessToken, body })) as T;
      }
      throw error;
    }
  }

  /** Endpoints that need no identity, e.g. the public schedule. */
  async public<T>(path: string): Promise<T> {
    return (await this.request("GET", path, {})) as T;
  }

  private async request(
    method: string,
    path: string,
    options: { token?: string; internal?: boolean; body?: unknown },
  ): Promise<unknown> {
    const response = await fetch(`${this.config.apiBase}${path}`, {
      method,
      headers: {
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.internal ? { "x-internal-token": this.config.internalToken } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : null;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        String(payload?.code ?? "ERROR"),
        String(payload?.message ?? `Запрос не удался (${response.status})`),
      );
    }

    return payload;
  }
}
