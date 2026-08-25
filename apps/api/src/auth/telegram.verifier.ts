import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TelegramWidgetAuthInput } from "@poker/contracts";
import type { Env } from "../config/env";

export type TelegramProfile = {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  raw: Record<string, unknown>;
};

/** Payloads older than this are rejected even if the signature is valid. */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Verifies that a payload really came from Telegram.
 *
 * Both entry points use HMAC-SHA256 over the same "data check string", but they
 * derive the key differently, which is easy to get wrong:
 *   Login Widget → key = SHA256(bot_token)
 *   Mini App     → key = HMAC_SHA256("WebAppData", bot_token)
 *
 * Nothing else in the system trusts client-supplied Telegram data; it must pass
 * through here first.
 */
@Injectable()
export class TelegramVerifier {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private botToken(): string {
    const token = this.config.get("TELEGRAM_BOT_TOKEN", { infer: true });
    if (!token) {
      throw new UnauthorizedException({
        code: "TELEGRAM_NOT_CONFIGURED",
        message: "Вход через Telegram пока не настроен",
      });
    }
    return token;
  }

  /** Login Widget on the website. */
  verifyWidget(input: TelegramWidgetAuthInput): TelegramProfile {
    const { hash, ...fields } = input;
    const checkString = buildCheckString(fields as Record<string, unknown>);
    const secret = createHash("sha256").update(this.botToken()).digest();

    this.assertSignature(checkString, secret, hash);
    this.assertFresh(input.auth_date);

    return {
      telegramId: String(input.id),
      username: input.username ?? null,
      firstName: input.first_name ?? null,
      lastName: input.last_name ?? null,
      photoUrl: input.photo_url ?? null,
      raw: { ...fields },
    };
  }

  /** Telegram Mini App: `window.Telegram.WebApp.initData`. */
  verifyInitData(initData: string): TelegramProfile {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      throw new UnauthorizedException({ code: "BAD_INIT_DATA", message: "Подпись отсутствует" });
    }

    const fields: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      // `signature` is Telegram's separate Ed25519 field and is not part of the HMAC string.
      if (key === "hash" || key === "signature") continue;
      fields[key] = value;
    }

    const checkString = buildCheckString(fields);
    const secret = createHmac("sha256", "WebAppData").update(this.botToken()).digest();

    this.assertSignature(checkString, secret, hash);

    const authDate = Number(fields.auth_date);
    if (!Number.isFinite(authDate)) {
      throw new UnauthorizedException({ code: "BAD_INIT_DATA", message: "Некорректная дата" });
    }
    this.assertFresh(authDate);

    const user = parseUser(fields.user);
    if (!user) {
      throw new UnauthorizedException({
        code: "BAD_INIT_DATA",
        message: "Не удалось прочитать профиль",
      });
    }

    return user;
  }

  private assertSignature(checkString: string, secret: Buffer, expectedHex: string): void {
    const actual = createHmac("sha256", secret).update(checkString).digest();
    let expected: Buffer;
    try {
      expected = Buffer.from(expectedHex, "hex");
    } catch {
      throw new UnauthorizedException({ code: "BAD_SIGNATURE", message: "Подпись неверна" });
    }

    if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException({ code: "BAD_SIGNATURE", message: "Подпись неверна" });
    }
  }

  private assertFresh(authDate: number): void {
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age > MAX_AUTH_AGE_SECONDS) {
      throw new UnauthorizedException({
        code: "AUTH_EXPIRED",
        message: "Данные входа устарели, попробуйте снова",
      });
    }
  }
}

/** Telegram's canonical form: `key=value` pairs sorted by key, joined by newlines. */
function buildCheckString(fields: Record<string, unknown>): string {
  return Object.keys(fields)
    .filter((key) => fields[key] !== undefined && fields[key] !== null)
    .sort()
    .map((key) => `${key}=${String(fields[key])}`)
    .join("\n");
}

function parseUser(rawUser: string | undefined): TelegramProfile | null {
  if (!rawUser) return null;

  try {
    const parsed = JSON.parse(rawUser) as {
      id?: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      photo_url?: string;
    };
    if (typeof parsed.id !== "number") return null;

    return {
      telegramId: String(parsed.id),
      username: parsed.username ?? null,
      firstName: parsed.first_name ?? null,
      lastName: parsed.last_name ?? null,
      photoUrl: parsed.photo_url ?? null,
      raw: parsed as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}
