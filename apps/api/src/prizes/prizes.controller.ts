import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  GrantPrizeInput,
  type PrizeWallet,
  RedeemPrizeInput,
  type TournamentPlayer,
} from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { PrizesService } from "./prizes.service";

@ApiTags("prizes")
@Controller("prizes")
export class PrizesController {
  constructor(private readonly prizes: PrizesService) {}

  @Get("me")
  @ApiOperation({ summary: "Prizes you hold and what you have already spent" })
  mine(@CurrentUser() user: RequestUser): Promise<PrizeWallet> {
    return this.prizes.wallet(user.id);
  }

  @Roles("hostess")
  @Get("user/:userId")
  @ApiOperation({ summary: "What one player is owed (staff)" })
  ofUser(@Param("userId") userId: string): Promise<PrizeWallet> {
    return this.prizes.wallet(userId);
  }

  @Roles("hostess")
  @Post()
  @ApiOperation({ summary: "Award a prize from the bar menu or a promo (staff)" })
  grant(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(GrantPrizeInput)) body: GrantPrizeInput,
  ): Promise<PrizeWallet> {
    return this.prizes.grant(body, actor.id);
  }

  @Roles("hostess")
  @Post(":id/redeem")
  @ApiOperation({ summary: "Spend a prize at tonight's desk (staff)" })
  redeem(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(RedeemPrizeInput)) body: RedeemPrizeInput,
  ): Promise<TournamentPlayer> {
    return this.prizes.redeem(id, body, actor.id);
  }

  @Roles("hostess")
  @Delete(":id")
  @ApiOperation({ summary: "Take back a prize awarded by mistake (staff)" })
  revoke(@CurrentUser() actor: RequestUser, @Param("id") id: string): Promise<PrizeWallet> {
    return this.prizes.revoke(id, actor.id);
  }
}
