import { Module } from "@nestjs/common";
import { RatingModule } from "../rating/rating.module";
import { SeasonsModule } from "../seasons/seasons.module";
import { AchievementsController } from "./achievements.controller";
import { AchievementsService } from "./achievements.service";

@Module({
  imports: [RatingModule, SeasonsModule],
  controllers: [AchievementsController],
  providers: [AchievementsService],
  exports: [AchievementsService],
})
export class AchievementsModule {}
