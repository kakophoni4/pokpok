import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type ClubMenuItem,
  type ClubSettings,
  type ClubVenue,
  type SalesReport,
  ClubVenueInput,
  CreateClubMenuItemInput,
  SalesQuery,
  UpdateClubMenuItemInput,
  UpdateClubSettingsInput,
} from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, Public, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { ClubService } from "./club.service";

/** What anyone may see: the club's own description. */
export type PublicClubInfo = Pick<ClubSettings, "infoText" | "timezone">;

@ApiTags("club")
@Controller("club")
export class ClubController {
  constructor(private readonly club: ClubService) {}

  @Public()
  @Get("info")
  @ApiOperation({ summary: "Club description — the bot's «как нас найти»" })
  async info(): Promise<PublicClubInfo> {
    const settings = await this.club.get();
    return { infoText: settings.infoText, timezone: settings.timezone };
  }

  @Roles("hostess")
  @Get("settings")
  @ApiOperation({ summary: "All club settings, prices and menu included (staff)" })
  settings(): Promise<ClubSettings> {
    return this.club.get();
  }

  @Roles("admin")
  @Get("sales")
  @ApiOperation({ summary: "What the till took: by week, month or season (admin)" })
  sales(@Query(zodPipe(SalesQuery)) query: SalesQuery): Promise<SalesReport> {
    return this.club.sales(query);
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

  @Roles("admin")
  @Post("menu")
  @ApiOperation({ summary: "Add a till item or promo (admin)" })
  createMenu(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(CreateClubMenuItemInput)) body: CreateClubMenuItemInput,
  ): Promise<ClubMenuItem> {
    return this.club.createMenuItem(actor.id, body);
  }

  @Roles("admin")
  @Patch("menu/:id")
  @ApiOperation({ summary: "Edit a till item (admin)" })
  updateMenu(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(UpdateClubMenuItemInput)) body: UpdateClubMenuItemInput,
  ): Promise<ClubMenuItem> {
    return this.club.updateMenuItem(actor.id, id, body);
  }

  @Roles("admin")
  @Delete("menu/:id")
  @ApiOperation({ summary: "Remove a till item (admin). Fixed fees cannot be deleted." })
  deleteMenu(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    return this.club.deleteMenuItem(actor.id, id);
  }

  @Roles("admin")
  @Post("venues")
  @ApiOperation({ summary: "Add a playing address the schedule can pick (admin)" })
  createVenue(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(ClubVenueInput)) body: ClubVenueInput,
  ): Promise<ClubVenue> {
    return this.club.createVenue(actor.id, body);
  }

  @Roles("admin")
  @Patch("venues/:id")
  @ApiOperation({ summary: "Edit a playing address (admin)" })
  updateVenue(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(ClubVenueInput)) body: ClubVenueInput,
  ): Promise<ClubVenue> {
    return this.club.updateVenue(actor.id, id, body);
  }

  @Roles("admin")
  @Delete("venues/:id")
  @ApiOperation({ summary: "Remove a playing address (admin)" })
  deleteVenue(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    return this.club.deleteVenue(actor.id, id);
  }
}
