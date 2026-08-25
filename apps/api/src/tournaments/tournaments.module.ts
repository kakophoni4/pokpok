import { Module } from "@nestjs/common";
import { RatingModule } from "../rating/rating.module";
import { SeasonsModule } from "../seasons/seasons.module";
import { RegistrationsService } from "./registrations.service";
import { ResultsService } from "./results.service";
import { TournamentsController } from "./tournaments.controller";
import { TournamentsService } from "./tournaments.service";

@Module({
  imports: [SeasonsModule, RatingModule],
  controllers: [TournamentsController],
  providers: [TournamentsService, RegistrationsService, ResultsService],
  exports: [TournamentsService, RegistrationsService],
})
export class TournamentsModule {}
