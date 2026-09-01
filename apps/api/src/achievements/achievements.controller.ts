import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type Achievement,
  CreateAchievementInput,
  GrantAchievementInput,
  UpdateAchievementInput,
  type UserAchievementView,
} from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, Public, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { AchievementsService } from "./achievements.service";

@ApiTags("achievements")
@Controller("achievements")
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Achievement catalogue with how much rating each is worth" })
  list(@Query("includeInactive") includeInactive?: string): Promise<Achievement[]> {
    return this.achievements.list(includeInactive === "true");
  }

  @Public()
  @Get("user/:userId")
  @ApiOperation({ summary: "Achievements a player holds" })
  listForUser(@Param("userId") userId: string): Promise<UserAchievementView[]> {
    return this.achievements.listForUser(userId);
  }

  @Roles("hostess")
  @Post()
  @ApiOperation({ summary: "Create an achievement: title, description, rating points (admin)" })
  create(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(CreateAchievementInput)) body: CreateAchievementInput,
  ): Promise<Achievement> {
    return this.achievements.create(actor.id, body);
  }

  @Roles("hostess")
  @Patch(":id")
  @ApiOperation({ summary: "Edit an achievement (admin)" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(UpdateAchievementInput)) body: UpdateAchievementInput,
  ): Promise<Achievement> {
    return this.achievements.update(actor.id, id, body);
  }

  @Roles("hostess")
  @Post("grant")
  @ApiOperation({ summary: "Give an achievement to a player (staff)" })
  grant(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(GrantAchievementInput)) body: GrantAchievementInput,
  ): Promise<UserAchievementView> {
    return this.achievements.grant(actor.id, body);
  }

  @Roles("hostess")
  @Delete("grant/:id")
  @ApiOperation({ summary: "Take an achievement back, removing its rating (admin)" })
  revoke(@CurrentUser() actor: RequestUser, @Param("id") id: string): Promise<{ ok: true }> {
    return this.achievements.revoke(actor.id, id);
  }
}
