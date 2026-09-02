import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import {
  NotificationResultInput,
  type PendingNotification,
  PendingNotificationsQuery,
} from "@poker/contracts";
import { Public } from "../common/auth/decorators";
import { InternalTokenGuard } from "../common/auth/internal-token.guard";
import { zodPipe } from "../common/validation/zod.pipe";
import { NotificationsService } from "./notifications.service";

/** Only the bot talks to these: the outbox is not a public queue. */
@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post("internal/claim")
  @ApiExcludeEndpoint()
  claim(
    @Body(zodPipe(PendingNotificationsQuery)) body: PendingNotificationsQuery,
  ): Promise<PendingNotification[]> {
    return this.notifications.claim(body.limit);
  }

  @Public()
  @UseGuards(InternalTokenGuard)
  @Post("internal/settle")
  @ApiExcludeEndpoint()
  async settle(
    @Body(zodPipe(NotificationResultInput)) body: NotificationResultInput,
  ): Promise<{ ok: true }> {
    await this.notifications.settle(body.id, body.ok, body.error);
    return { ok: true };
  }
}
