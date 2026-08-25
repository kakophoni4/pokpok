import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CreateTournamentInput,
  hasRole,
  RegisterInput,
  RegistrationStatus,
  type RegistrationView,
  SubmitResultsInput,
  type TournamentDetail,
  TournamentListQuery,
  type TournamentSummary,
  UpdateTournamentInput,
} from "@poker/contracts";
import { z } from "zod";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, OptionalAuth, Public, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { RegistrationsService, type RegisterResult } from "./registrations.service";
import { ResultsService } from "./results.service";
import { TournamentsService } from "./tournaments.service";

const SetRegistrationStatusInput = z.object({
  status: RegistrationStatus.extract(["registered", "checked_in", "no_show"]),
});

@ApiTags("tournaments")
@Controller("tournaments")
export class TournamentsController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly registrations: RegistrationsService,
    private readonly results: ResultsService,
  ) {}

  @OptionalAuth()
  @Get()
  @ApiOperation({ summary: "Schedule. Includes your own registration when signed in" })
  list(
    @Query(zodPipe(TournamentListQuery)) query: TournamentListQuery,
    @CurrentUser() viewer?: RequestUser,
  ): Promise<TournamentSummary[]> {
    return this.tournaments.list(query, viewer?.id);
  }

  @OptionalAuth()
  @Get(":id")
  @ApiOperation({ summary: "Tournament card with participants and standings" })
  detail(
    @Param("id") id: string,
    @CurrentUser() viewer?: RequestUser,
  ): Promise<TournamentDetail> {
    return this.tournaments.detail(id, viewer?.id);
  }

  @Roles("moderator")
  @Post()
  @ApiOperation({ summary: "Create a tournament (staff)" })
  create(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(CreateTournamentInput)) body: CreateTournamentInput,
  ): Promise<TournamentSummary> {
    return this.tournaments.create(actor.id, body);
  }

  @Roles("moderator")
  @Patch(":id")
  @ApiOperation({ summary: "Edit a tournament (staff)" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(UpdateTournamentInput)) body: UpdateTournamentInput,
  ): Promise<TournamentSummary> {
    return this.tournaments.update(actor.id, id, body);
  }

  @Roles("admin")
  @Delete(":id")
  @ApiOperation({ summary: "Delete a tournament that has no results (admin)" })
  remove(@CurrentUser() actor: RequestUser, @Param("id") id: string): Promise<{ ok: true }> {
    return this.tournaments.remove(actor.id, id);
  }

  // ─── Registration ───────────────────────────────────────────────────────────

  @Post(":id/register")
  @ApiOperation({ summary: "Sign up, or join the waiting list when the table is full" })
  register(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(RegisterInput)) body: RegisterInput,
  ): Promise<RegisterResult> {
    // Signing somebody else up is a staff action.
    if (body.userId && body.userId !== actor.id && !hasRole(actor.role, "moderator")) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Записать другого игрока может только организатор",
      });
    }

    const targetUserId = body.userId ?? actor.id;
    const source = body.userId && body.userId !== actor.id ? "admin" : body.source;
    return this.registrations.register(id, targetUserId, source, actor.id);
  }

  @Delete(":id/register")
  @ApiOperation({ summary: "Cancel your registration; promotes the first player waiting" })
  cancel(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Query("userId") userId?: string,
  ): Promise<{ promotedUserId: string | null }> {
    if (userId && userId !== actor.id && !hasRole(actor.role, "moderator")) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Недостаточно прав" });
    }
    return this.registrations.cancel(id, userId ?? actor.id, actor.id);
  }

  @Public()
  @Get(":id/registrations")
  @ApiOperation({ summary: "Who is signed up — used by the site and both bots" })
  listRegistrations(@Param("id") id: string): Promise<RegistrationView[]> {
    return this.registrations.listForTournament(id);
  }

  @Roles("moderator")
  @Patch(":id/registrations/:userId")
  @ApiOperation({ summary: "Check in an arrival or mark a no-show (staff)" })
  setRegistrationStatus(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body(zodPipe(SetRegistrationStatusInput)) body: { status: "registered" | "checked_in" | "no_show" },
  ): Promise<RegistrationView> {
    return this.registrations.setStatus(id, userId, body.status, actor.id);
  }

  // ─── Results ────────────────────────────────────────────────────────────────

  @Roles("moderator")
  @Post(":id/results")
  @ApiOperation({ summary: "Submit the full standings; awards rating (staff)" })
  async submitResults(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(SubmitResultsInput)) body: SubmitResultsInput,
  ): Promise<{ ok: true }> {
    await this.results.submit(id, body, actor.id);
    return { ok: true };
  }

  @Roles("admin")
  @Delete(":id/results")
  @ApiOperation({ summary: "Wipe standings and the rating they produced (admin)" })
  async clearResults(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    await this.results.clear(id, actor.id);
    return { ok: true };
  }
}
