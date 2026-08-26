import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";
import { AuthProvider, LoginTicketState, UserRole } from "./enums.js";
import { MeUser } from "./user.js";

/**
 * Raw payload produced by the Telegram Login Widget. Field names are snake_case
 * because they are part of the hash-checked string and must not be renamed.
 */
export const TelegramWidgetAuthInput = z.object({
  id: z.coerce.number().int().positive(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.coerce.number().int().positive(),
  hash: z.string().min(16),
});
export type TelegramWidgetAuthInput = z.infer<typeof TelegramWidgetAuthInput>;

/** Telegram Mini App hands us one opaque query string; the server validates its signature. */
export const TelegramMiniAppAuthInput = z.object({
  initData: z.string().min(16),
});
export type TelegramMiniAppAuthInput = z.infer<typeof TelegramMiniAppAuthInput>;

/** VK ID uses OAuth 2.1 with PKCE; the code is exchanged server-side. */
export const VkAuthInput = z.object({
  code: z.string().min(8),
  deviceId: z.string().min(1),
  codeVerifier: z.string().min(32),
  state: z.string().min(8),
});
export type VkAuthInput = z.infer<typeof VkAuthInput>;

export const SessionResponse = z.object({
  accessToken: z.string(),
  /** Seconds until the access token expires; the refresh token lives in an httpOnly cookie. */
  expiresIn: z.number().int().positive(),
  user: MeUser,
  /** True on the very first login, so the client can show onboarding. */
  isNewUser: z.boolean(),
});
export type SessionResponse = z.infer<typeof SessionResponse>;

/** Payload of our own access token. Never trust provider tokens past the auth endpoint. */
export type AccessTokenClaims = {
  sub: Id;
  role: UserRole;
  nickname: string;
  /** Which client the session was opened from, for audit and stricter checks. */
  aud: "web" | "miniapp" | "bot";
  iat: number;
  exp: number;
};

/**
 * Linking a second provider to an existing account: the site issues a one-time
 * token, the bot deep-link carries it back, and the server binds the identity.
 */
export const StartLinkResponse = z.object({
  token: z.string(),
  deepLink: z.string(),
  expiresAt: z.string(),
});
export type StartLinkResponse = z.infer<typeof StartLinkResponse>;

export const ConfirmLinkInput = z.object({
  token: z.string().min(16),
  provider: AuthProvider,
});
export type ConfirmLinkInput = z.infer<typeof ConfirmLinkInput>;

/**
 * Signing in without leaving Telegram behind: the site opens a ticket, sends the
 * browser into the bot with the code attached, and waits for the tap.
 *
 * Unlike the Login Widget this needs nothing registered with BotFather and asks
 * for no phone number — the bot already knows who is pressing the button.
 */
export const StartLoginResponse = z.object({
  /** Secret the browser polls with. Also travels in the deep link. */
  code: z.string(),
  /**
   * Two words shown on both screens. The bot asks the player to check they
   * match, so a link forwarded by somebody else cannot be confirmed blindly.
   */
  phrase: z.string(),
  /** Where to send the browser: the bot, with the code attached. */
  url: z.string(),
  expiresAt: IsoDateTime,
});
export type StartLoginResponse = z.infer<typeof StartLoginResponse>;

/** What the waiting browser is told. A ticket past its deadline reads as expired. */
export const LoginTicketOutcome = z.enum([...LoginTicketState.options, "expired"]);
export type LoginTicketOutcome = z.infer<typeof LoginTicketOutcome>;

export const LoginTicketStatus = z.object({
  state: LoginTicketOutcome,
  /** Present exactly once, on the poll that finds the ticket confirmed. */
  session: SessionResponse.nullable(),
});
export type LoginTicketStatus = z.infer<typeof LoginTicketStatus>;

/** What the bot reads before asking the player to confirm. */
export const LoginTicketPrompt = z.object({
  phrase: z.string(),
  expiresAt: IsoDateTime,
});
export type LoginTicketPrompt = z.infer<typeof LoginTicketPrompt>;

export const LoginTicketLookupInput = z.object({ code: z.string().min(16) });
export type LoginTicketLookupInput = z.infer<typeof LoginTicketLookupInput>;
