import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  AuthProvider,
  ConfirmLinkInput,
  LoginTicketLookupInput,
  type LoginTicketPrompt,
  type LoginTicketStatus,
  type MeUser,
  type SessionResponse,
  type StartLinkResponse,
  type StartLoginResponse,
  TelegramMiniAppAuthInput,
  TelegramWidgetAuthInput,
} from "@poker/contracts";
import type { Request, Response } from "express";
import { z } from "zod";
import { CurrentUser, Public } from "../common/auth/decorators";
import { InternalTokenGuard } from "../common/auth/internal-token.guard";
import type { RequestUser } from "../common/auth/auth.types";
import { zodPipe } from "../common/validation/zod.pipe";
import type { Env } from "../config/env";
import { UsersService } from "../users/users.service";
import { AuthService, type LoginResult, type ProviderProfile } from "./auth.service";
import { TelegramVerifier } from "./telegram.verifier";
import { TokenService } from "./token.service";

const REFRESH_COOKIE = "poker_refresh";

/** Internal shape: bots post it, nothing outside the server boundary sees it. */
const ProviderProfileSchema = z.object({
  provider: AuthProvider,
  providerUserId: z.string().min(1),
  username: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  photoUrl: z.string().nullable(),
  raw: z.record(z.string(), z.unknown()),
});

const ConfirmLinkBody = ConfirmLinkInput.extend({ profile: ProviderProfileSchema });

const SettleLoginBody = LoginTicketLookupInput.extend({
  profile: ProviderProfileSchema,
  approve: z.boolean(),
});
type SettleLoginBody = z.infer<typeof SettleLoginBody>;

const DevLoginInput = z.object({ nickname: z.string().trim().min(2).max(24) });

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly telegram: TelegramVerifier,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post("telegram/widget")
  @ApiOperation({ summary: "Login from the Telegram Login Widget on the website" })
  async telegramWidget(
    @Body(zodPipe(TelegramWidgetAuthInput)) body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const profile = this.telegram.verifyWidget(body as never);
    const result = await this.auth.loginWithProvider(
      AuthService.fromTelegram(profile),
      "web",
      metaOf(request),
    );
    return this.finishLogin(result, response);
  }

  @Public()
  @Post("telegram/miniapp")
  @ApiOperation({ summary: "Login from inside the Telegram Mini App" })
  async telegramMiniApp(
    @Body(zodPipe(TelegramMiniAppAuthInput)) body: { initData: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const profile = this.telegram.verifyInitData(body.initData);
    const result = await this.auth.loginWithProvider(
      AuthService.fromTelegram(profile),
      "miniapp",
      metaOf(request),
    );
    return this.finishLogin(result, response);
  }

  /**
   * Login by confirming in the bot: the browser opens a ticket, walks the player
   * into Telegram, then polls. Needs no domain registered with BotFather and no
   * phone number typed into a popup, which is why it is the front door.
   */
  @Public()
  @Post("telegram/login")
  @ApiOperation({ summary: "Start a login the player confirms inside the bot" })
  startTelegramLogin(@Req() request: Request): Promise<StartLoginResponse> {
    return this.auth.startLoginTicket(metaOf(request));
  }

  @Public()
  @Get("telegram/login/:code")
  @ApiOperation({ summary: "Has the player confirmed the login yet?" })
  async telegramLoginStatus(
    @Param("code") code: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginTicketStatus> {
    const outcome = await this.auth.loginTicketStatus(code, metaOf(request));
    if (outcome.state !== "confirmed") return { state: outcome.state, session: null };
    return { state: "confirmed", session: this.finishLogin(outcome.session, response) };
  }

  @Public()
  @Post("refresh")
  @ApiOperation({ summary: "Exchange the refresh cookie for a new access token" })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (!token) {
      throw new UnauthorizedException({ code: "NO_REFRESH", message: "Сессия не найдена" });
    }

    const rotated = await this.tokens.rotate(token, metaOf(request));
    this.setRefreshCookie(response, rotated.refreshToken);

    return {
      accessToken: rotated.accessToken,
      expiresIn: rotated.expiresIn,
      user: await this.users.getMe(rotated.user.id),
      isNewUser: false,
    };
  }

  @Public()
  @Post("logout")
  @ApiOperation({ summary: "Revoke the current refresh token" })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ ok: true }> {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (token) await this.tokens.revoke(token);
    response.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return { ok: true };
  }

  @Get("me")
  @ApiOperation({ summary: "Profile of the signed-in user" })
  me(@CurrentUser() user: RequestUser): Promise<MeUser> {
    return this.users.getMe(user.id);
  }

  @Post("link/:provider")
  @ApiOperation({ summary: "Start attaching a second provider to this account" })
  startLink(
    @CurrentUser() user: RequestUser,
    @Param("provider") provider: string,
  ): Promise<StartLinkResponse> {
    return this.auth.startLink(user.id, AuthProvider.parse(provider));
  }

  /**
   * Local convenience: sign in as any seeded player without a Telegram bot token.
   * Refuses to work outside development, so it cannot become a production hole.
   */
  @Public()
  @Post("dev/login")
  @ApiOperation({ summary: "Development-only login by nickname" })
  async devLogin(
    @Body(zodPipe(DevLoginInput)) body: { nickname: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    if (this.config.get("NODE_ENV", { infer: true }) === "production") {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Not found" });
    }

    const result = await this.auth.devLogin(body.nickname);
    return this.finishLogin(result, response);
  }

  // ─── Endpoints for the bots ─────────────────────────────────────────────────

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post("internal/provider-session")
  @ApiExcludeEndpoint()
  async providerSession(
    @Body(zodPipe(ProviderProfileSchema)) body: ProviderProfile,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const result = await this.auth.loginWithProvider(body, "bot");
    // Bots hold the access token themselves; no cookie involved.
    void response;
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
      isNewUser: result.isNewUser,
    };
  }

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post("internal/link/confirm")
  @ApiExcludeEndpoint()
  async confirmLink(
    @Body(zodPipe(ConfirmLinkBody)) body: { token: string; profile: ProviderProfile },
  ): Promise<{ ok: true }> {
    await this.auth.confirmLink(body.token, body.profile);
    return { ok: true };
  }

  /** The bot reads the check phrase before it asks anyone to press anything. */
  @Public()
  @UseGuards(InternalTokenGuard)
  @Post("internal/login/prompt")
  @ApiExcludeEndpoint()
  loginPrompt(
    @Body(zodPipe(LoginTicketLookupInput)) body: LoginTicketLookupInput,
  ): Promise<LoginTicketPrompt> {
    return this.auth.loginTicketPrompt(body.code);
  }

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post("internal/login/settle")
  @ApiExcludeEndpoint()
  settleLogin(
    @Body(zodPipe(SettleLoginBody)) body: SettleLoginBody,
  ): Promise<LoginTicketPrompt> {
    return this.auth.settleLoginTicket(body.code, body.profile, body.approve);
  }

  private finishLogin(result: LoginResult, response: Response): SessionResponse {
    this.setRefreshCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
      isNewUser: result.isNewUser,
    };
  }

  private setRefreshCookie(response: Response, token: string): void {
    const isProduction = this.config.get("NODE_ENV", { infer: true }) === "production";
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      // Scoped so the token is never attached to ordinary API calls.
      path: "/api/auth",
      maxAge: this.tokens.refreshTtl * 1000,
    });
  }
}

function metaOf(request: Request): { userAgent: string | null; ip: string | null } {
  return {
    userAgent: request.headers["user-agent"] ?? null,
    ip: request.ip ?? null,
  };
}
