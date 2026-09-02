import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { SeasonsModule } from "../seasons/seasons.module";
import { PrizesController } from "./prizes.controller";
import { PrizesService } from "./prizes.service";

@Module({
  imports: [SeasonsModule, NotificationsModule],
  controllers: [PrizesController],
  providers: [PrizesService],
  exports: [PrizesService],
})
export class PrizesModule {}
