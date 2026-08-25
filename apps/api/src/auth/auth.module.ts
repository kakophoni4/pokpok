import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TelegramVerifier } from "./telegram.verifier";
import { TokenService } from "./token.service";

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, TelegramVerifier],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
