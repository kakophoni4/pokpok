import { Module } from "@nestjs/common";
import { RatingModule } from "../rating/rating.module";
import { SeasonsModule } from "../seasons/seasons.module";
import { PaymentsService } from "./payments.service";
import { RegistrationsService } from "./registrations.service";
import { ResultsService } from "./results.service";
import { TournamentsController } from "./tournaments.controller";
import { TournamentsService } from "./tournaments.service";

@Module({
  imports: [SeasonsModule, RatingModule],
  controllers: [TournamentsController],
  providers: [TournamentsService, RegistrationsService, ResultsService, PaymentsService],
  exports: [TournamentsService, RegistrationsService, ResultsService, PaymentsService],
})
export class TournamentsModule {}
