import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

/**
 * Records who changed what. Every staff action goes through here, because
 * "someone edited my rating" needs an answer that is not a guess.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          before: (entry.before ?? null) as never,
          after: (entry.after ?? null) as never,
          ip: entry.ip ?? null,
        },
      });
    } catch (error) {
      // Losing an audit row must never fail the operation the user asked for.
      this.logger.error(`Failed to write audit entry ${entry.action}`, error as Error);
    }
  }
}
