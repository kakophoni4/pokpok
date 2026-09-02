import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  formatPlayerName,
  type GrantPrizeInput,
  parsePromoBundle,
  type PlayerPrize,
  type PrizeWallet,
  type RedeemPrizeInput,
  type TournamentPlayer,
  walletLabel,
  walletLines,
} from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { escapeHtml, NotificationsService } from "../notifications/notifications.service";
import { SeasonsService } from "../seasons/seasons.service";
import {
  assertAddonRoom,
  assertEntryUnpaid,
  kindTitle,
  playerView,
  returnToPlay,
  seatPlayer,
} from "../tournaments/cash-desk";
import { chipsForKind, effectiveConfig } from "../tournaments/tournament-config";
import type { ClubMenuItem as MenuRow, PaymentKind } from "../generated/prisma/client";

/** One tap should not be able to write hundreds of rows into somebody's wallet. */
const MAX_PER_GRANT = 20;
/** The wallet is a reminder of what you are owed, not an archive of your year. */
const HISTORY_LIMIT = 20;

type Unit = { title: string; kind: PaymentKind; menuItemId: string | null };

const PRIZE_ROWS = {
  grantedBy: { select: { nickname: true, displayName: true } },
  redeemedBy: { select: { nickname: true, displayName: true } },
  wonAt: { select: { id: true, title: true } },
  spentAt: { select: { id: true, title: true } },
} as const;

/**
 * Prizes: things a player won and can spend later.
 *
 * Spending one is deliberately not a special case at the desk. It writes the
 * same till line an ordinary purchase would, priced at nothing — so a free
 * rebuy still hands out its chips, still puts a busted player back in the game,
 * and still shows up on the evening's tab. The only difference is that the club
 * took no money for it, which is exactly what the takings report should say.
 */
@Injectable()
export class PrizesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async grant(input: GrantPrizeInput, actorId: string): Promise<PrizeWallet> {
    const [user, menuItem] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } }),
      this.prisma.clubMenuItem.findUnique({ where: { id: input.menuItemId } }),
    ]);
    if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Игрок не найден" });
    if (!menuItem) {
      throw new NotFoundException({ code: "MENU_ITEM_NOT_FOUND", message: "Позиция меню не найдена" });
    }

    const units = await this.expand(menuItem, input.quantity);
    if (units.length === 0) {
      throw new ConflictException({ code: "EMPTY_PROMO", message: "В акции нет позиций" });
    }
    if (units.length > MAX_PER_GRANT) {
      throw new ConflictException({
        code: "TOO_MANY_PRIZES",
        message: `За раз можно начислить не больше ${MAX_PER_GRANT} призов`,
      });
    }

    // A promo names itself if the staff member did not: «Тройной ребай» is more
    // use to the player later than three separate lines saying «Ребай».
    const bundled = menuItem.isPromo && parsePromoBundle(menuItem.bundle).length > 0;
    const comment = input.comment?.trim() || (bundled ? menuItem.title : null);

    const lines = walletLines(units);

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.playerPrize.createManyAndReturn({
        data: units.map((unit) => ({
          userId: input.userId,
          menuItemId: unit.menuItemId,
          title: unit.title,
          kind: unit.kind,
          comment,
          grantedById: actorId,
          wonAtId: input.tournamentId ?? null,
        })),
        select: { id: true },
      });

      await this.notifications.queue(tx, {
        userId: input.userId,
        kind: "prize.granted",
        // The first row's id is unique to this grant, so a retried request
        // cannot turn into a second message about the same prize.
        dedupeKey: created[0]?.id ?? `${Date.now()}`,
        text: grantedMessage(walletLabel(lines), comment),
        context: { titles: lines, comment },
      });
    });

    await this.audit.record({
      actorId,
      action: "prize.grant",
      entity: input.tournamentId ? "Tournament" : "User",
      entityId: input.tournamentId ?? input.userId,
      after: {
        userId: input.userId,
        menuItemId: menuItem.id,
        title: walletLabel(lines),
        count: units.length,
        comment,
      },
    });

    return this.wallet(input.userId);
  }

  /**
   * Spends one prize at tonight's desk.
   *
   * Returns the player's card rather than the wallet: whoever pressed the
   * button is looking at the evening screen, and that is what has to change.
   */
  async redeem(
    prizeId: string,
    input: RedeemPrizeInput,
    actorId: string,
  ): Promise<TournamentPlayer> {
    const prize = await this.prisma.playerPrize.findUnique({
      where: { id: prizeId },
      include: { menuItem: true, user: { select: { nickname: true } } },
    });
    if (!prize) throw new NotFoundException({ code: "PRIZE_NOT_FOUND", message: "Приз не найден" });
    if (prize.voidedAt != null) {
      throw new ConflictException({ code: "PRIZE_VOIDED", message: "Приз отменён" });
    }
    if (prize.redeemedAt != null) {
      throw new ConflictException({ code: "PRIZE_SPENT", message: "Приз уже списан" });
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: input.tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException({ code: "TOURNAMENT_NOT_FOUND", message: "Турнир не найден" });
    }
    if (tournament.status === "finished") {
      throw new ConflictException({
        code: "TOURNAMENT_FINISHED",
        message: "Турнир завершён. Верните его в игру, чтобы менять оплаты",
      });
    }

    const season = await this.seasons.ratingConfig(tournament.seasonId);
    const config = effectiveConfig(tournament, season);
    const chips =
      prize.menuItem && prize.menuItem.chips > 0
        ? prize.menuItem.chips
        : chipsForKind(prize.kind, config);

    if (prize.kind === "entry") {
      await assertEntryUnpaid(this.prisma, tournament.id, prize.userId, prize.user.nickname);
    }
    if (prize.kind === "addon") {
      await assertAddonRoom(this.prisma, tournament.id, prize.userId, 1, config.addonChips);
    }

    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tournamentId: tournament.id,
          userId: prize.userId,
          kind: prize.kind,
          amountRub: 0,
          chips,
          note: `Приз: ${prize.title}`,
          createdById: actorId,
        },
        select: { id: true },
      });

      // Guarded on redeemedAt so two hostesses tapping at once cannot spend the
      // same prize twice — the second update matches nothing and throws.
      const spent = await tx.playerPrize.updateMany({
        where: { id: prize.id, redeemedAt: null, voidedAt: null },
        data: {
          redeemedAt: new Date(),
          redeemedById: actorId,
          spentAtId: tournament.id,
          paymentId: payment.id,
        },
      });
      if (spent.count === 0) {
        throw new ConflictException({ code: "PRIZE_SPENT", message: "Приз уже списан" });
      }

      await seatPlayer(tx, tournament.id, prize.userId);
      if (prize.kind === "rebuy") await returnToPlay(tx, tournament.id, prize.userId);
    });

    await this.audit.record({
      actorId,
      action: "prize.redeem",
      entity: "Tournament",
      entityId: tournament.id,
      after: { userId: prize.userId, prizeId: prize.id, title: prize.title, chips },
    });

    return playerView(this.prisma, tournament.id, prize.userId);
  }

  /** Granted by mistake. Kept on the record, like a voided payment. */
  async revoke(prizeId: string, actorId: string): Promise<PrizeWallet> {
    const prize = await this.prisma.playerPrize.findUnique({ where: { id: prizeId } });
    if (!prize) throw new NotFoundException({ code: "PRIZE_NOT_FOUND", message: "Приз не найден" });
    if (prize.redeemedAt != null) {
      throw new ConflictException({
        code: "PRIZE_SPENT",
        message: "Приз уже списан — отмените оплату в вечере",
      });
    }
    if (prize.voidedAt != null) {
      throw new ConflictException({ code: "PRIZE_VOIDED", message: "Приз уже отменён" });
    }

    await this.prisma.playerPrize.update({
      where: { id: prizeId },
      data: { voidedAt: new Date(), voidedById: actorId },
    });

    await this.audit.record({
      actorId,
      action: "prize.revoke",
      entity: prize.wonAtId ? "Tournament" : "User",
      entityId: prize.wonAtId ?? prize.userId,
      before: { userId: prize.userId, prizeId, title: prize.title },
    });

    return this.wallet(prize.userId);
  }

  async wallet(userId: string): Promise<PrizeWallet> {
    const rows = await this.prisma.playerPrize.findMany({
      where: { userId, voidedAt: null },
      orderBy: { grantedAt: "desc" },
      include: PRIZE_ROWS,
    });

    const active = rows.filter((row) => row.redeemedAt == null).map(toPrizeView);
    const history = rows
      .filter((row) => row.redeemedAt != null)
      .slice(0, HISTORY_LIMIT)
      .map(toPrizeView);

    return { lines: walletLines(active), total: active.length, active, history };
  }

  /** Unspent prizes of everyone at one evening, so the desk can offer them. */
  async forTournament(tournamentId: string): Promise<PlayerPrize[]> {
    const [registered, payers] = await Promise.all([
      this.prisma.registration.findMany({ where: { tournamentId }, select: { userId: true } }),
      this.prisma.payment.findMany({
        where: { tournamentId, voidedAt: null },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

    const userIds = [...new Set([...registered, ...payers].map((row) => row.userId))];
    if (userIds.length === 0) return [];

    const rows = await this.prisma.playerPrize.findMany({
      where: { userId: { in: userIds }, redeemedAt: null, voidedAt: null },
      orderBy: { grantedAt: "asc" },
      include: PRIZE_ROWS,
    });
    return rows.map(toPrizeView);
  }

  /**
   * What one grant actually hands over. A promo expands into its contents, the
   * same way paying for it would, so «Тройной ребай» becomes three prizes the
   * player can spend on three different nights.
   */
  private async expand(menuItem: MenuRow, quantity: number): Promise<Unit[]> {
    const bundle = menuItem.isPromo ? parsePromoBundle(menuItem.bundle) : [];
    if (bundle.length === 0) {
      return Array.from({ length: quantity }, () => ({
        title: menuItem.title,
        kind: menuItem.kind,
        menuItemId: menuItem.id,
      }));
    }

    const catalogue = await this.prisma.clubMenuItem.findMany();
    const byId = new Map(catalogue.map((item) => [item.id, item]));

    const units: Unit[] = [];
    for (const grant of bundle) {
      const source = grant.menuItemId ? byId.get(grant.menuItemId) : undefined;
      const title = grant.title?.trim() || source?.title || kindTitle(grant.kind);
      for (let i = 0; i < grant.quantity * quantity; i += 1) {
        units.push({ title, kind: grant.kind, menuItemId: source?.id ?? null });
      }
    }
    return units;
  }
}

type PrizeRow = {
  id: string;
  userId: string;
  title: string;
  kind: PaymentKind;
  menuItemId: string | null;
  comment: string | null;
  grantedAt: Date;
  redeemedAt: Date | null;
  grantedBy: { nickname: string; displayName: string | null } | null;
  redeemedBy: { nickname: string; displayName: string | null } | null;
  wonAt: { id: string; title: string } | null;
  spentAt: { id: string; title: string } | null;
};

function toPrizeView(row: PrizeRow): PlayerPrize {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    kind: row.kind,
    menuItemId: row.menuItemId,
    comment: row.comment,
    grantedAt: row.grantedAt.toISOString(),
    grantedBy: staffName(row.grantedBy),
    wonAt: row.wonAt,
    redeemedAt: row.redeemedAt?.toISOString() ?? null,
    redeemedBy: staffName(row.redeemedBy),
    spentAt: row.spentAt,
  };
}

function staffName(user: { nickname: string; displayName: string | null } | null): string | null {
  return user ? formatPlayerName(user.displayName, user.nickname) : null;
}

function grantedMessage(what: string, comment: string | null): string {
  return [
    "♠ <b>Вам начислен приз</b>",
    "",
    `<b>${escapeHtml(what)}</b>`,
    comment ? `<i>${escapeHtml(comment)}</i>` : null,
    "",
    "Списать можно на любой игре — скажите об этом на кассе.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
