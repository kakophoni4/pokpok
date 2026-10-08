import { Module } from "@nestjs/common";
import { ClubController } from "./club.controller";
import { OverviewService } from "./overview.service";
import { ClubService } from "./club.service";

@Module({
  controllers: [ClubController],
  providers: [ClubService, OverviewService],
  exports: [ClubService],
})
export class ClubModule {}
