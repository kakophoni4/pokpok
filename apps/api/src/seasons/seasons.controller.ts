import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CreateSeasonInput, type Season, UpdateSeasonInput } from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, Public, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { SeasonsService } from "./seasons.service";

@ApiTags("seasons")
@Controller("seasons")
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "All seasons" })
  list(): Promise<Season[]> {
    return this.seasons.list();
  }

  @Public()
  @Get("active")
  @ApiOperation({ summary: "Current season and its rating settings" })
  active(): Promise<Season | null> {
    return this.seasons.findActive();
  }

  @Roles("admin")
  @Post()
  @ApiOperation({ summary: "Create a season (admin)" })
  create(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(CreateSeasonInput)) body: CreateSeasonInput,
  ): Promise<Season> {
    return this.seasons.create(actor.id, body);
  }

  @Roles("admin")
  @Patch(":id")
  @ApiOperation({ summary: "Edit a season, including the rating formula (admin)" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(UpdateSeasonInput)) body: UpdateSeasonInput,
  ): Promise<Season> {
    return this.seasons.update(actor.id, id, body);
  }
}
