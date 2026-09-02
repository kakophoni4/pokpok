import path from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AchievementsModule } from "./achievements/achievements.module";
import { AuthModule } from "./auth/auth.module";
import { ClubModule } from "./club/club.module";
import { AuditModule } from "./common/audit/audit.module";
import { JwtAuthGuard } from "./common/auth/jwt-auth.guard";
import { RolesGuard } from "./common/auth/roles.guard";
import { PrismaModule } from "./common/prisma/prisma.module";
import { type Env, validateEnv } from "./config/env";
import { HealthController } from "./health/health.controller";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrizesModule } from "./prizes/prizes.module";
import { RatingModule } from "./rating/rating.module";
import { SeasonsModule } from "./seasons/seasons.module";
import { TournamentsModule } from "./tournaments/tournaments.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // One .env at the monorepo root keeps the API, the web app and the bots in sync.
      envFilePath: [path.resolve(__dirname, "../../../.env")],
      validate: validateEnv,
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get("JWT_SECRET", { infer: true }),
        signOptions: { expiresIn: config.get("ACCESS_TOKEN_TTL", { infer: true }) },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    UsersModule,
    AuthModule,
    ClubModule,
    SeasonsModule,
    RatingModule,
    TournamentsModule,
    AchievementsModule,
    NotificationsModule,
    PrizesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate, then check the role, then rate-limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
