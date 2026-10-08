import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  LiveConfig,
  LiveAction,
  PlaceOrderInput,
  ReceiptInput,
} from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, Public, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { z } from "zod";
import { Throttle } from "@nestjs/throttler";
import { LiveService } from "./live.service";

@Controller("live")
export class LiveController {
  constructor(private readonly live: LiveService) {}
  @Roles("hostess") @Get("templates") templates() {
    return this.live.templates();
  }
  @Roles("admin") @Post("templates") saveTemplate(
    @CurrentUser() actor: RequestUser,
    @Body(
      zodPipe(
        z.object({
          id: z.string().uuid().optional(),
          title: z.string().trim().min(1).max(80),
          config: LiveConfig,
        }),
      ),
    )
    body: { id?: string; title: string; config: LiveConfig },
  ) {
    return this.live.saveTemplate(actor, body);
  }
  @Roles("admin") @Delete("templates/:id") deleteTemplate(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
  ) {
    return this.live.deleteTemplate(actor, id);
  }
  @Get("acquiring/status") acquiringStatus() {
    return {
      available: false,
      methods: ["cash", "terminal"],
      reason: "ACQUIRING_NOT_CONFIGURED",
    };
  }
  @Roles("floor") @Get("staff") staff() {
    return this.live.staffList();
  }
  @Get("account/me") account(@CurrentUser() actor: RequestUser) {
    return this.live.account(actor.id);
  }
  @Roles("hostess") @Get("account/:userId") playerAccount(
    @Param("userId") id: string,
  ) {
    return this.live.account(id);
  }
  @Get("me") me(@CurrentUser() actor: RequestUser) {
    return this.live.playerLive(actor.id);
  }
  @Roles("hostess") @Post("receipts") receipt(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(ReceiptInput)) body: ReceiptInput,
  ) {
    return this.live.receipt(actor, body);
  }
  @Roles("hostess") @Delete("receipts/:id") voidReceipt(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
  ) {
    return this.live.voidReceipt(actor, id);
  }
  @Post("orders") order(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(PlaceOrderInput)) body: PlaceOrderInput,
  ) {
    return this.live.placeOrder(actor, body);
  }
  @Public() @Post("display/connect") @Throttle({ default: { limit: 10, ttl: 60000 } }) connectDisplay(
    @Body(zodPipe(z.object({ code: z.string().regex(/^\d{6}$/) }))) body: { code: string },
  ) {
    return this.live.connectDisplay(body.code);
  }
  @Public() @Get("display/:id") display(
    @Param("id") id: string,
    @Query("token") token: string,
  ) {
    return this.live.view(id, undefined, token);
  }
  @Roles("dealer") @Get(":id") view(
    @Param("id") id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.live.view(id, actor);
  }
  @Post(":id/actions") action(
    @Param("id") id: string,
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(LiveAction)) body: LiveAction,
  ) {
    return this.live.action(id, actor, body);
  }
  @Roles("dealer") @Post(":id/achievement") achievement(
    @Param("id") id: string,
    @CurrentUser() actor: RequestUser,
    @Body(
      zodPipe(
        z.object({
          userId: z.string().min(1),
          achievementId: z.string().min(1),
        }),
      ),
    )
    body: { userId: string; achievementId: string },
  ) {
    return this.live.grantHand(id, actor, body.userId, body.achievementId);
  }
  @Post(":id/orders/:orderId/cancel") cancel(
    @Param("id") id: string,
    @Param("orderId") orderId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.live.orderAction(id, orderId, actor, false);
  }
  @Roles("dealer") @Post(":id/orders/:orderId/fulfil") fulfil(
    @Param("id") id: string,
    @Param("orderId") orderId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.live.orderAction(id, orderId, actor, true);
  }
}
