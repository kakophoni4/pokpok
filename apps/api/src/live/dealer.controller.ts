import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request, Response } from "express";
import { z } from "zod";
import { CurrentUser, Public, Roles } from "../common/auth/decorators";
import type { RequestUser } from "../common/auth/auth.types";
import { zodPipe } from "../common/validation/zod.pipe";
import { DealerService } from "./dealer.service";
import { PrismaService } from "../common/prisma/prisma.service";
const opts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/dealer",
};
@Controller("dealer")
export class DealerController {
  constructor(
    private readonly dealer: DealerService,
    private readonly jwt: JwtService,
    private readonly db: PrismaService,
  ) {}
  @Roles("admin") @Post("password") password(
    @CurrentUser() actor: RequestUser,
    @Body(
      zodPipe(
        z.object({
          userId: z.string().min(1),
          password: z.string().min(8).max(128),
        }),
      ),
    )
    body: { userId: string; password: string },
  ) {
    return this.dealer.password(actor.id, body.userId, body.password);
  }
  @Roles("floor") @Post("tablets") tablet(
    @CurrentUser() actor: RequestUser,
    @Body(
      zodPipe(
        z.object({
          tournamentId: z.string().min(1),
          tableNumber: z.number().int().min(1).max(30),
        }),
      ),
    )
    body: { tournamentId: string; tableNumber: number },
  ) {
    return this.dealer.pair(actor.id, body.tournamentId, body.tableNumber);
  }
  @Roles("floor") @Post("bind") async bind(
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(
      zodPipe(
        z.object({
          tournamentId: z.string().min(1),
          tableNumber: z.number().int().min(1).max(30),
        }),
      ),
    )
    body: { tournamentId: string; tableNumber: number },
  ) {
    if (actor.role !== "floor" && actor.role !== "admin")
      throw new UnauthorizedException(
        "Настройка доступна флору и администратору",
      );
    try {
      await this.dealer.close(await this.shift(req));
    } catch {}
    const result = await this.dealer.pair(
      actor.id,
      body.tournamentId,
      body.tableNumber,
    );
    const token = new URLSearchParams(result.path.split("?")[1]).get("device")!;
    res.cookie("dealer_device", token, { ...opts, maxAge: 90 * 86400000 });
    res.clearCookie("dealer_shift", opts);
    return { connected: true, ...body };
  }
  @Public() @Post("pair") async pair(
    @Body(zodPipe(z.object({ token: z.string().length(64) })))
    body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.dealer.tablet(body.token);
    res.cookie("dealer_device", body.token, { ...opts, maxAge: 90 * 86400000 });
    return { ok: true };
  }
  @Public() @Get("device") async device(@Req() req: Request) {
    const tablet = await this.dealer.tablet(req.cookies?.dealer_device ?? "");
    return {
      connected: true,
      tournamentId: tablet.tournamentId,
      tableNumber: tablet.tableNumber,
    };
  }
  @Public() @Post("login") async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(
      zodPipe(
        z.object({
          nickname: z.string().trim().min(1).max(100),
          password: z.string().min(1).max(128),
        }),
      ),
    )
    body: { nickname: string; password: string },
  ) {
    const result = await this.dealer.login(
      req.cookies?.dealer_device ?? "",
      body.nickname,
      body.password,
    );
    res.cookie(
      "dealer_shift",
      await this.jwt.signAsync(
        { shiftId: result.shiftId, aud: "dealer-refresh" },
        { expiresIn: 43200 },
      ),
      { ...opts, maxAge: 12 * 3600000 },
    );
    return result;
  }
  private async shift(req: Request) {
    try {
      const claims = await this.jwt.verifyAsync<{
        shiftId: string;
        aud: string;
      }>(req.cookies?.dealer_shift ?? "");
      if (claims.aud !== "dealer-refresh") throw new Error();
      const tablet = await this.dealer.tablet(req.cookies?.dealer_device ?? "");
      const shift = await this.db.dealerShift.findUnique({
        where: { id: claims.shiftId },
      });
      if (shift?.tabletId !== tablet.id) throw new Error();
      return claims.shiftId;
    } catch {
      throw new UnauthorizedException("Войдите в смену");
    }
  }
  @Public() @Post("refresh") async refresh(@Req() req: Request) {
    return this.dealer.session(await this.shift(req));
  }
  @Public() @Post("logout") async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.dealer.close(await this.shift(req));
    res.clearCookie("dealer_shift", opts);
    return { ok: true };
  }
  @Roles("admin") @Get("hours") hours(
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    const dates = z
      .object({
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
      })
      .parse({ from, to });
    return this.dealer.payroll(dates.from, dates.to);
  }
  @Roles("admin") @Get("payroll") async payroll() {
    return (
      (await this.db.clubSettings.findUnique({ where: { id: "club" } }))
        ?.dealerPayroll ?? { stepMinutes: 30, mode: "nearest" }
    );
  }
  @Roles("admin") @Post("payroll") async setPayroll(
    @CurrentUser() actor: RequestUser,
    @Body(
      zodPipe(
        z.object({
          stepMinutes: z.union([z.literal(30), z.literal(60), z.literal(90)]),
          mode: z.enum(["nearest", "up", "down"]),
        }),
      ),
    )
    body: { stepMinutes: number; mode: string },
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.clubSettings.upsert({
        where: { id: "club" },
        create: { id: "club", dealerPayroll: body },
        update: { dealerPayroll: body },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "dealer.payroll.policy",
          entity: "club",
          entityId: "club",
          after: body,
        },
      });
    });
    return body;
  }
}
