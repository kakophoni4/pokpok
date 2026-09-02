import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AddPaymentInput, PromoGrant, TournamentPlayer } from "@poker/contracts";
import { parsePromoBundle } from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { SeasonsService } from "../seasons/seasons.service";
import {
  assertAddonRoom,
  assertEntryUnpaid,
  kindTitle,
  playerView,
  returnToPlay,
  seatPlayer,
} from "./cash-desk";
import { chipsForKind, effectiveConfig, type EffectiveConfig } from "./tournament-config";
import type { ClubMenuItem as MenuRow, PaymentKind } from "../generated/prisma/client";

/**
 * The cash desk. Every line is appended and never edited, so an evening can be
 * reconstructed exactly as it happened — including the mistakes and the moment
 * they were voided.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly audit: AuditService,
  ) {}

  async add(
    tournamentId: string,
    input: AddPaymentInput,
    actorId: string,
  ): Promise<TournamentPlayer> {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }
    // Chips decide the rating, so changing them after the payout would leave the
    // awarded points describing a table that no longer exists.
    if (tournament.status === "finished") {
      throw new ConflictException({
        code: "TOURNAMENT_FINISHED",
        message: "Турнир завершён. Верните его в игру, чтобы менять оплаты",
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Игрок не найден" });
    }

    const menuItem = input.menuItemId
      ? await this.prisma.clubMenuItem.findUnique({ where: { id: input.menuItemId } })
      : null;
    if (input.menuItemId && !menuItem) {
      throw new NotFoundException({ code: "MENU_ITEM_NOT_FOUND", message: "Позиция меню не найдена" });
    }

    const season = await this.seasons.ratingConfig(tournament.seasonId);
    const config = effectiveConfig(tournament, season);
    const units = input.multiplier ?? 1;

    const bundle = menuItem?.isPromo ? parsePromoBundle(menuItem.bundle) : [];
    if (menuItem && bundle.length > 0) {
      await this.addBundle(tournamentId, input.userId, actorId, menuItem, bundle, config, units);
      await this.audit.record({
        actorId,
        action: "payment.add",
        entity: "Tournament",
        entityId: tournamentId,
        after: {
          userId: input.userId,
          kind: menuItem.kind,
          title: menuItem.title,
          amountRub: menuItem.priceRub * units,
          menuItemId: menuItem.id,
          bundle,
        },
      });
      return this.playerView(tournamentId, input.userId);
    }

    const kind = menuItem?.kind ?? input.kind;
    const amountRub = menuItem ? menuItem.priceRub * units : input.amountRub;
    const chips =
      input.chips ??
      (menuItem && menuItem.chips > 0
        ? menuItem.chips * units
        : chipsForKind(kind, config) * units);

    if (kind === "entry") {
      await assertEntryUnpaid(this.prisma, tournamentId, input.userId, user.nickname);
    }

    const split = kind === "rebuy" || kind === "addon";
    const copies = split ? units : 1;
    const perAmount = split ? Math.round(amountRub / copies) : amountRub;
    const perChips = split ? Math.round(chips / copies) : chips;

    if (kind === "addon") {
      await assertAddonRoom(this.prisma, tournamentId, input.userId, copies, config.addonChips);
    }

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < copies; i += 1) {
        await tx.payment.create({
          data: {
            tournamentId,
            userId: input.userId,
            kind,
            amountRub: perAmount,
            chips: perChips,
            note: input.note ?? menuItem?.title ?? null,
            createdById: actorId,
          },
        });
      }

      await seatPlayer(tx, tournamentId, input.userId);
      if (kind === "rebuy") await returnToPlay(tx, tournamentId, input.userId);
    });

    await this.audit.record({
      actorId,
      action: "payment.add",
      entity: "Tournament",
      entityId: tournamentId,
      after: {
        userId: input.userId,
        kind,
        title: input.note ?? menuItem?.title ?? kindTitle(kind),
        amountRub,
        chips,
        multiplier: units,
        menuItemId: menuItem?.id ?? null,
      },
    });

    return this.playerView(tournamentId, input.userId);
  }

  /**
   * A promo is one till tap that expands into whatever it grants: stacks,
   * bar SKUs, or a mix. The promo price sits on the first line; the rest
   * are zero-cost so voiding one grant does not invent money.
   */
  private async addBundle(
    tournamentId: string,
    userId: string,
    actorId: string,
    promo: MenuRow,
    bundle: PromoGrant[],
    config: EffectiveConfig,
    units: number,
  ): Promise<void> {
    const catalogue = await this.prisma.clubMenuItem.findMany();
    const byId = new Map(catalogue.map((item) => [item.id, item]));

    type Line = { kind: PaymentKind; chips: number; note: string };
    const lines: Line[] = [];

    for (const grant of bundle) {
      const source = grant.menuItemId ? byId.get(grant.menuItemId) : undefined;
      const kind = grant.kind;
      const title = grant.title?.trim() || source?.title || kindTitle(kind);
      const unitChips =
        source && source.chips > 0 ? source.chips : chipsForKind(kind, config);
      const copies = grant.quantity * units;
      for (let i = 0; i < copies; i += 1) {
        lines.push({
          kind,
          chips: unitChips,
          note: `${promo.title}: ${title}`,
        });
      }
    }

    if (lines.length === 0) {
      throw new ConflictException({ code: "EMPTY_PROMO", message: "В акции нет позиций" });
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (lines.some((line) => line.kind === "entry")) {
      await assertEntryUnpaid(this.prisma, tournamentId, userId, user.nickname);
    }

    const addonCopies = lines.filter((line) => line.kind === "addon").length;
    if (addonCopies > 0) {
      await assertAddonRoom(this.prisma, tournamentId, userId, addonCopies, config.addonChips);
    }

    const price = promo.priceRub * units;

    await this.prisma.$transaction(async (tx) => {
      for (const [index, line] of lines.entries()) {
        await tx.payment.create({
          data: {
            tournamentId,
            userId,
            kind: line.kind,
            amountRub: index === 0 ? price : 0,
            chips: line.chips,
            note: line.note,
            createdById: actorId,
          },
        });
      }

      await seatPlayer(tx, tournamentId, userId);
      if (lines.some((line) => line.kind === "rebuy")) await returnToPlay(tx, tournamentId, userId);
    });
  }

  /** Reverses a line without erasing it. */
  async voidPayment(paymentId: string, actorId: string): Promise<TournamentPlayer> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { tournament: { select: { status: true } } },
    });
    if (!payment) {
      throw new NotFoundException({ code: "PAYMENT_NOT_FOUND", message: "Оплата не найдена" });
    }
    if (payment.voidedAt != null) {
      throw new ConflictException({ code: "ALREADY_VOIDED", message: "Оплата уже отменена" });
    }
    if (payment.tournament.status === "finished") {
      throw new ConflictException({
        code: "TOURNAMENT_FINISHED",
        message: "Турнир завершён. Верните его в игру, чтобы менять оплаты",
      });
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidedById: actorId },
    });

    await this.audit.record({
      actorId,
      action: "payment.void",
      entity: "Tournament",
      entityId: payment.tournamentId,
      before: {
        paymentId,
        userId: payment.userId,
        kind: payment.kind,
        amountRub: payment.amountRub,
        chips: payment.chips,
        note: payment.note,
      },
    });

    return this.playerView(payment.tournamentId, payment.userId);
  }

  /** Everything the admin card for one player needs to redraw itself. */
  playerView(tournamentId: string, userId: string): Promise<TournamentPlayer> {
    return playerView(this.prisma, tournamentId, userId);
  }
}
