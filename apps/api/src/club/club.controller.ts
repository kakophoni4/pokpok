import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { type ClubSettings, UpdateClubSettingsInput } from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, Public, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { ClubService } from "./club.service";

/** What anyone may see: the club's own description and the timezone it plays in. */
export type PublicClubInfo = Pick<ClubSettings, "infoText" | "timezone">;

@ApiTags("club")
@Controller("club")
export class ClubController {
  constructor(private readonly club: ClubService) {}

  @Public()
  @Get("info")
  @ApiOperation({ summary: "Club description and timezone — the bot's «как нас найти»" })
  async info(): Promise<PublicClubInfo> {
    const settings = await this.club.get();
    return { infoText: settings.infoText, timezone: settings.timezone };
  }

  @Roles("admin")
  @Get("settings")
  @ApiOperation({ summary: "All club settings, prices included (admin)" })
  settings(): Promise<ClubSettings> {
    return this.club.get();
  }

  @Roles("admin")
  @Patch("settings")
  @ApiOperation({ summary: "Edit club settings (admin)" })
  update(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(UpdateClubSettingsInput)) body: UpdateClubSettingsInput,
  ): Promise<ClubSettings> {
    return this.club.update(actor.id, body);
  }
}
