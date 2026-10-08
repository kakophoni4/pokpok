import { DealerService } from "./dealer.service";
import { DealerController } from "./dealer.controller";
import { Global, Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { RatingModule } from "../rating/rating.module";
import { AchievementsModule } from "../achievements/achievements.module";
import { LiveController } from "./live.controller";
import { LiveService } from "./live.service";
import { UnconfiguredAcquiringGateway } from "./acquiring";
@Global()
@Module({
  imports: [NotificationsModule, RatingModule, AchievementsModule],
  controllers: [LiveController, DealerController],
  providers: [DealerService, LiveService, UnconfiguredAcquiringGateway],
  exports: [LiveService, DealerService],
})
export class LiveModule {}
