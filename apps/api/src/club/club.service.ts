import { Injectable } from "@nestjs/common";
import { CLUB_TIMEZONE, type ClubSettings, type UpdateClubSettingsInput } from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";

/** There is exactly one club, so exactly one settings row. */
const ROW_ID = "club";

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

    return {
      infoText: row.infoText,
      entryPriceRub: row.entryPriceRub,
      addonPriceRub: row.addonPriceRub,
      drinkPriceRub: row.drinkPriceRub,
      adminChatId: row.adminChatId,
      timezone: row.timezone,
    };
  }

  async update(actorId: string, input: UpdateClubSettingsInput): Promise<ClubSettings> {
    const before = await this.get();

    await this.prisma.clubSettings.update({
      where: { id: ROW_ID },
      data: {
        ...(input.infoText === undefined ? {} : { infoText: input.infoText }),
        ...(input.entryPriceRub === undefined ? {} : { entryPriceRub: input.entryPriceRub }),
        ...(input.addonPriceRub === undefined ? {} : { addonPriceRub: input.addonPriceRub }),
        ...(input.drinkPriceRub === undefined ? {} : { drinkPriceRub: input.drinkPriceRub }),
        ...(input.adminChatId === undefined ? {} : { adminChatId: input.adminChatId ?? null }),
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      },
    });

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
}
