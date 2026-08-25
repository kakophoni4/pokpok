import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../common/auth/decorators";
import { PrismaService } from "../common/prisma/prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Liveness and database connectivity" })
  async check(): Promise<{ status: string; database: string; uptime: number }> {
    let database = "up";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "down";
    }

    return { status: database === "up" ? "ok" : "degraded", database, uptime: process.uptime() };
  }
}
