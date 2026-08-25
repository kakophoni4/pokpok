import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  LeaderboardQuery,
  type LeaderboardRow,
  ManualAdjustmentInput,
  type PlayerStats,
} from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, Public, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { RatingService } from "./rating.service";

@ApiTags("rating")
@Controller("rating")
export class RatingController {
  constructor(private readonly rating: RatingService) {}

  @Public()
  @Get("leaderboard")
  @ApiOperation({ summary: "Standings for the season or all time" })
  leaderboard(@Query(zodPipe(LeaderboardQuery)) query: LeaderboardQuery): Promise<LeaderboardRow[]> {
    return this.rating.leaderboard(query);
  }

  @Get("me")
  @ApiOperation({ summary: "Your own stats, history and rating curve" })
  me(
    @CurrentUser() actor: RequestUser,
    @Query("seasonId") seasonId?: string,
  ): Promise<PlayerStats> {
    return this.rating.playerStats(actor.id, seasonId);
  }

  @Public()
  @Get("player/:userId")
  @ApiOperation({ summary: "Public stats of a player" })
  player(
    @Param("userId") userId: string,
    @Query("seasonId") seasonId?: string,
  ): Promise<PlayerStats> {
    return this.rating.playerStats(userId, seasonId);
  }

  @Roles("admin")
  @Post("adjust")
  @ApiOperation({ summary: "Manual rating correction, recorded in the ledger (admin)" })
  async adjust(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(ManualAdjustmentInput)) body: ManualAdjustmentInput,
  ): Promise<{ ok: true }> {
    await this.rating.manualAdjustment(actor.id, body);
    return { ok: true };
  }
}
