import { Module } from "@nestjs/common";
import { SeasonsModule } from "../seasons/seasons.module";
import { RatingController } from "./rating.controller";
import { RatingService } from "./rating.service";

@Module({
  imports: [SeasonsModule],
  controllers: [RatingController],
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule {}
