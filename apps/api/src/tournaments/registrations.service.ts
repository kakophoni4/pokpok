import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  OCCUPYING_STATUSES,
  REGISTRABLE_STATUSES,
  type RegistrationSource,
  type RegistrationStatus,
  type RegistrationView,
} from "@poker/contracts";
import { AuditService } from "../common/audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import type { TxClient } from "../common/prisma/tx-client";
import { toPublicUser } from "../users/user.mapper";

export type RegisterResult = {
  status: RegistrationStatus;
  waitlistPosition: number | null;
};

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Signs a player up, or puts them on the waiting list when the table is full.
   *
   * Runs at the Serializable isolation level: two people tapping "записаться" on
   * the last seat at the same moment must not both get it. Club volumes are tiny,
   * so the cost of the strictest isolation is irrelevant next to the correctness.
   */
  async register(
    tournamentId: string,
    userId: string,
    source: RegistrationSource,
    actorId: string,
  ): Promise<RegisterResult> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
        if (!tournament) {
          throw new NotFoundException({
            code: "TOURNAMENT_NOT_FOUND",
            message: "Турнир не найден",
          });
        }

        const isStaffAction = source === "admin";
        if (!isStaffAction) this.assertRegistrationOpen(tournament);

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { status: true },
        });
        if (!user) {
          throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Игрок не найден" });
        }
        if (user.status === "blocked") {
          throw new ForbiddenException({ code: "USER_BLOCKED", message: "Аккаунт заблокирован" });
        }

        const existing = await tx.registration.findUnique({
          where: { tournamentId_userId: { tournamentId, userId } },
        });
        if (existing && existing.status !== "cancelled") {
          throw new ConflictException({
            code: "ALREADY_REGISTERED",
            message:
              existing.status === "waitlist"
                ? "Вы уже в листе ожидания"
                : "Вы уже записаны на этот турнир",
          });
        }

        const occupied = await tx.registration.count({
          where: { tournamentId, status: { in: OCCUPYING_STATUSES } },
        });
        const seatsLeft = tournament.capacity == null ? Number.POSITIVE_INFINITY : tournament.capacity - occupied;

        let status: RegistrationStatus = "registered";
        let waitlistPosition: number | null = null;

        if (seatsLeft <= 0) {
          status = "waitlist";
          const last = await tx.registration.aggregate({
            where: { tournamentId, status: "waitlist" },
            _max: { waitlistPosition: true },
          });
          waitlistPosition = (last._max.waitlistPosition ?? 0) + 1;
        }

        if (existing) {
          await tx.registration.update({
            where: { id: existing.id },
            data: { status, source, waitlistPosition },
          });
        } else {
          await tx.registration.create({
            data: { tournamentId, userId, status, source, waitlistPosition },
          });
        }

        return { status, waitlistPosition };
      },
      { isolationLevel: "Serializable" },
    );

    await this.audit.record({
      actorId,
      action: "registration.create",
      entity: "Registration",
      entityId: `${tournamentId}:${userId}`,
      after: { userId, status: result.status, source },
    });

    return result;
  }

  /**
   * Cancels a registration and, if a seat freed up, promotes the first player
   * from the waiting list in the same transaction.
   */
  async cancel(
    tournamentId: string,
    userId: string,
    actorId: string,
  ): Promise<{ promotedUserId: string | null }> {
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const registration = await tx.registration.findUnique({
          where: { tournamentId_userId: { tournamentId, userId } },
          include: { tournament: true },
        });

        if (!registration || registration.status === "cancelled") {
          throw new NotFoundException({
            code: "REGISTRATION_NOT_FOUND",
            message: "Запись не найдена",
          });
        }
        if (registration.tournament.status === "finished") {
          throw new BadRequestException({
            code: "TOURNAMENT_FINISHED",
            message: "Турнир уже завершён",
          });
        }

        const freedSeat = OCCUPYING_STATUSES.includes(registration.status);
        await tx.registration.update({
          where: { id: registration.id },
          data: { status: "cancelled", waitlistPosition: null },
        });

        if (!freedSeat) {
          await this.renumberWaitlist(tx, tournamentId);
          return { promotedUserId: null };
        }

        const next = await tx.registration.findFirst({
          where: { tournamentId, status: "waitlist" },
          orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
        });

        if (!next) return { promotedUserId: null };

        await tx.registration.update({
          where: { id: next.id },
          data: { status: "registered", waitlistPosition: null },
        });
        await this.renumberWaitlist(tx, tournamentId);

        return { promotedUserId: next.userId };
      },
      { isolationLevel: "Serializable" },
    );

    await this.audit.record({
      actorId,
      action: "registration.cancel",
      entity: "Registration",
      entityId: `${tournamentId}:${userId}`,
      after: { userId, promotedUserId: outcome.promotedUserId },
    });

    return outcome;
  }

  /** Staff marks arrivals at the venue. */
  async setStatus(
    tournamentId: string,
    userId: string,
    status: Extract<RegistrationStatus, "checked_in" | "no_show" | "registered">,
    actorId: string,
  ): Promise<RegistrationView> {
    const registration = await this.prisma.registration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (!registration) {
      throw new NotFoundException({ code: "REGISTRATION_NOT_FOUND", message: "Запись не найдена" });
    }

    const updated = await this.prisma.registration.update({
      where: { id: registration.id },
      data: { status, waitlistPosition: null },
      include: { user: true },
    });

    await this.audit.record({
      actorId,
      action: "registration.status",
      entity: "Registration",
      entityId: registration.id,
      before: { status: registration.status },
      after: { status },
    });

    return {
      id: updated.id,
      user: toPublicUser(updated.user),
      status: updated.status,
      source: updated.source,
      waitlistPosition: updated.waitlistPosition,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async listForTournament(tournamentId: string): Promise<RegistrationView[]> {
    const rows = await this.prisma.registration.findMany({
      where: { tournamentId, status: { not: "cancelled" } },
      include: { user: true },
      orderBy: [{ status: "asc" }, { waitlistPosition: "asc" }, { createdAt: "asc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      user: toPublicUser(row.user),
      status: row.status,
      source: row.source,
      waitlistPosition: row.waitlistPosition,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private assertRegistrationOpen(tournament: {
    status: string;
    regOpensAt: Date | null;
    regClosesAt: Date | null;
  }): void {
    const now = new Date();

    if (!REGISTRABLE_STATUSES.includes(tournament.status as never)) {
      throw new BadRequestException({
        code: "REGISTRATION_CLOSED",
        message: "Запись на этот турнир закрыта",
      });
    }
    if (tournament.regOpensAt && tournament.regOpensAt > now) {
      throw new BadRequestException({
        code: "REGISTRATION_NOT_OPEN",
        message: "Запись ещё не открыта",
      });
    }
    if (tournament.regClosesAt && tournament.regClosesAt < now) {
      throw new BadRequestException({
        code: "REGISTRATION_CLOSED",
        message: "Запись уже закрыта",
      });
    }
  }

  /** Keeps waiting-list positions as 1..N with no gaps after any change. */
  private async renumberWaitlist(tx: TxClient, tournamentId: string): Promise<void> {
    const waiting = await tx.registration.findMany({
      where: { tournamentId, status: "waitlist" },
      orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
      select: { id: true, waitlistPosition: true },
    });

    for (const [index, row] of waiting.entries()) {
      const position = index + 1;
      if (row.waitlistPosition === position) continue;
      await tx.registration.update({ where: { id: row.id }, data: { waitlistPosition: position } });
    }
  }
}
