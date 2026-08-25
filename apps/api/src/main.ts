import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/errors/http-exception.filter";
import type { Env } from "./config/env";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger("bootstrap");

  const isProduction = config.get("NODE_ENV", { infer: true }) === "production";

  app.setGlobalPrefix("api");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  if (isProduction) {
    // Behind the Caddy reverse proxy: without this, every request looks like it
    // came from the proxy container, so rate limits and audit logs would record
    // one internal IP for the whole club, and `secure` cookies would misbehave.
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  // Validation is per-route via zodPipe(schema) using the shared @poker/contracts
  // schemas, so no global class-validator pipe is needed.

  app.enableCors({
    origin: config.get("CORS_ORIGINS", { infer: true }),
    // Required: the refresh token travels as an httpOnly cookie.
    credentials: true,
  });

  // The docs describe every staff endpoint, so they stay off the public internet.
  if (!isProduction) {
    const openapi = new DocumentBuilder()
      .setTitle("Poker League API")
      .setDescription("Расписание, запись, результаты и рейтинг клуба спортивного покера")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, openapi));
  }

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api (docs at /api/docs)`);
}

void bootstrap();
