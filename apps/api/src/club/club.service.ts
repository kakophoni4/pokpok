import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CLUB_TIMEZONE,
  type ClubMenuItem,
  type ClubSettings,
  type CreateClubMenuItemInput,
  type UpdateClubMenuItemInput,
  type UpdateClubSettingsInput,
} from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import type { ClubMenuItem as MenuRow, PaymentKind } from "../generated/prisma/client";

/** There is exactly one club, so exactly one settings row. */
const ROW_ID = "club";

const FIXED: { kind: "entry" | "rebuy" | "addon"; title: string; sortOrder: number }[] = [
  { kind: "entry", title: "Вход", sortOrder: 0 },
  { kind: "rebuy", title: "Ребай", sortOrder: 1 },
  { kind: "addon", title: "Адон", sortOrder: 2 },
];

@Injectable()
export class ClubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Reads the settings, creating them on first use. Doing it lazily means a fresh
   * database needs no seeding step before the bot can answer "как нас найти".
   */
  async get(): Promise<ClubSettings> {
    const row = await this.prisma.clubSettings.upsert({
      where: { id: ROW_ID },
      create: { id: ROW_ID, timezone: CLUB_TIMEZONE },
      update: {},
    });

    await this.ensureFixedItems(row);
    await this.ensureDefaultDrink(row.drinkPriceRub);

    const items = await this.prisma.clubMenuItem.findMany({
      orderBy: [{ isPromo: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return {
      infoText: row.infoText,
      entryPriceRub: row.entryPriceRub,
      rebuyPriceRub: row.rebuyPriceRub,
      addonPriceRub: row.addonPriceRub,
      drinkPriceRub: row.drinkPriceRub,
      adminChatId: row.adminChatId,
      timezone: CLUB_TIMEZONE,
      menuItems: items.map(toMenuView),
    };
  }

  async update(actorId: string, input: UpdateClubSettingsInput): Promise<ClubSettings> {
    const before = await this.get();

    await this.prisma.clubSettings.update({
      where: { id: ROW_ID },
      data: {
        ...(input.infoText === undefined ? {} : { infoText: input.infoText }),
        ...(input.entryPriceRub === undefined ? {} : { entryPriceRub: input.entryPriceRub }),
        ...(input.rebuyPriceRub === undefined ? {} : { rebuyPriceRub: input.rebuyPriceRub }),
        ...(input.addonPriceRub === undefined ? {} : { addonPriceRub: input.addonPriceRub }),
        ...(input.drinkPriceRub === undefined ? {} : { drinkPriceRub: input.drinkPriceRub }),
        ...(input.adminChatId === undefined ? {} : { adminChatId: input.adminChatId ?? null }),
        timezone: CLUB_TIMEZONE,
      },
    });

    const prices: Partial<Record<PaymentKind, number>> = {
      ...(input.entryPriceRub === undefined ? {} : { entry: input.entryPriceRub }),
      ...(input.rebuyPriceRub === undefined ? {} : { rebuy: input.rebuyPriceRub }),
      ...(input.addonPriceRub === undefined ? {} : { addon: input.addonPriceRub }),
    };
    for (const [kind, priceRub] of Object.entries(prices)) {
      await this.prisma.clubMenuItem.updateMany({
        where: { kind: kind as PaymentKind, isFixed: true },
        data: { priceRub },
      });
    }

    const after = await this.get();
    await this.audit.record({
      actorId,
      action: "club.settings.update",
      entity: "ClubSettings",
      entityId: ROW_ID,
      before,
      after,
    });
    return after;
  }

  async createMenuItem(actorId: string, input: CreateClubMenuItemInput): Promise<ClubMenuItem> {
    if (input.kind === "entry" || input.kind === "rebuy" || input.kind === "addon") {
      if (!input.isPromo) {
        throw new BadRequestException({
          code: "FIXED_KIND",
          message: "Вход, адон и ребай уже есть — добавьте другую позицию или акцию",
        });
      }
    }

    const last = await this.prisma.clubMenuItem.aggregate({ _max: { sortOrder: true } });
    const item = await this.prisma.clubMenuItem.create({
      data: {
        title: input.title,
        kind: input.kind,
        priceRub: input.priceRub,
        chips: input.chips,
        isPromo: input.isPromo,
        isActive: input.isActive,
        isFixed: false,
        sortOrder: (last._max.sortOrder ?? 10) + 1,
      },
    });

    await this.audit.record({
      actorId,
      action: "club.menu.create",
      entity: "ClubMenuItem",
      entityId: item.id,
      after: { title: item.title, kind: item.kind, priceRub: item.priceRub, chips: item.chips },
    });
    return toMenuView(item);
  }

  async updateMenuItem(
    actorId: string,
    id: string,
    input: UpdateClubMenuItemInput,
  ): Promise<ClubMenuItem> {
    const before = await this.prisma.clubMenuItem.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "MENU_ITEM_NOT_FOUND", message: "Позиция не найдена" });
    }

    if (before.isFixed && input.kind != null && input.kind !== before.kind) {
      throw new BadRequestException({
        code: "FIXED_ITEM",
        message: "Вид входа, адона и ребая менять нельзя",
      });
    }

    const item = await this.prisma.clubMenuItem.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(before.isFixed || input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.priceRub === undefined ? {} : { priceRub: input.priceRub }),
        ...(input.chips === undefined ? {} : { chips: input.chips }),
        ...(input.isPromo === undefined || before.isFixed ? {} : { isPromo: input.isPromo }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      },
    });

    if (item.isFixed) {
      const column =
        item.kind === "entry"
          ? "entryPriceRub"
          : item.kind === "rebuy"
            ? "rebuyPriceRub"
            : item.kind === "addon"
              ? "addonPriceRub"
              : null;
      if (column) {
        await this.prisma.clubSettings.update({
          where: { id: ROW_ID },
          data: { [column]: item.priceRub },
        });
      }
    }

    await this.audit.record({
      actorId,
      action: "club.menu.update",
      entity: "ClubMenuItem",
      entityId: id,
      before: { title: before.title, priceRub: before.priceRub, chips: before.chips },
      after: { title: item.title, priceRub: item.priceRub, chips: item.chips },
    });
    return toMenuView(item);
  }

  async deleteMenuItem(actorId: string, id: string): Promise<{ ok: true }> {
    const before = await this.prisma.clubMenuItem.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "MENU_ITEM_NOT_FOUND", message: "Позиция не найдена" });
    }
    if (before.isFixed) {
      throw new BadRequestException({
        code: "FIXED_ITEM",
        message: "Вход, адон и ребай удалить нельзя",
      });
    }

    await this.prisma.clubMenuItem.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: "club.menu.delete",
      entity: "ClubMenuItem",
      entityId: id,
      before: { title: before.title, kind: before.kind },
    });
    return { ok: true };
  }

  private async ensureFixedItems(row: {
    entryPriceRub: number;
    rebuyPriceRub: number;
    addonPriceRub: number;
  }): Promise<void> {
    const existing = await this.prisma.clubMenuItem.findMany({
      where: { isFixed: true },
      select: { kind: true },
    });
    const have = new Set(existing.map((item) => item.kind));
    const prices = {
      entry: row.entryPriceRub,
      rebuy: row.rebuyPriceRub,
      addon: row.addonPriceRub,
    } as const;

    for (const spec of FIXED) {
      if (have.has(spec.kind)) continue;
      await this.prisma.clubMenuItem.create({
        data: {
          title: spec.title,
          kind: spec.kind,
          priceRub: prices[spec.kind as keyof typeof prices],
          chips: 0,
          isFixed: true,
          isPromo: false,
          isActive: true,
          sortOrder: spec.sortOrder,
        },
      });
    }
  }

  private async ensureDefaultDrink(drinkPriceRub: number): Promise<void> {
    const extras = await this.prisma.clubMenuItem.count({
      where: { isFixed: false },
    });
    if (extras > 0) return;
    await this.prisma.clubMenuItem.create({
      data: {
        title: "Напиток",
        kind: "drink",
        priceRub: drinkPriceRub,
        chips: 0,
        isFixed: false,
        isPromo: false,
        isActive: true,
        sortOrder: 10,
      },
    });
  }
}

function toMenuView(item: MenuRow): ClubMenuItem {
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    priceRub: item.priceRub,
    chips: item.chips,
    isFixed: item.isFixed,
    isPromo: item.isPromo,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
  };
}
