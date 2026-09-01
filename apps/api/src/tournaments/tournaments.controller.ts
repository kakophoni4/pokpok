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
  AddPaymentInput,
  CreateTournamentInput,
  hasRole,
  RegisterInput,
  type RegistrationView,
  SaveAdminScreensInput,
  SetPlaceInput,
  SubmitResultsInput,
  type TournamentDetail,
  TournamentListQuery,
  type TournamentPlayer,
  type TournamentSummary,
  UpdateTournamentInput,
} from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, OptionalAuth, Public, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { PaymentsService } from "./payments.service";
import { RegistrationsService, type RegisterResult } from "./registrations.service";
import { type FinishSummary, ResultsService } from "./results.service";
import { TournamentsService } from "./tournaments.service";

@ApiTags("tournaments")
@Controller("tournaments")
export class TournamentsController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly registrations: RegistrationsService,
    private readonly results: ResultsService,
    private readonly payments: PaymentsService,
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

  // Declared before ":id" so the literal segment wins the match.
  @Roles("hostess")
  @Get("by-topic/:topicId")
  @ApiOperation({ summary: "Tournament bound to a forum topic in the admin group (admin)" })
  byTopic(
    @Param("topicId") topicId: string,
    @CurrentUser() viewer: RequestUser,
  ): Promise<TournamentDetail> {
    return this.tournaments.byAdminTopic(Number(topicId), viewer);
  }

  @OptionalAuth()
  @Get(":id")
  @ApiOperation({ summary: "Tournament card. The cash desk is included for admins only" })
  detail(
    @Param("id") id: string,
    @CurrentUser() viewer?: RequestUser,
  ): Promise<TournamentDetail> {
    return this.tournaments.detail(id, viewer);
  }

  @Roles("admin")
  @Post()
  @ApiOperation({ summary: "Create a tournament (admin)" })
  create(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(CreateTournamentInput)) body: CreateTournamentInput,
  ): Promise<TournamentSummary> {
    return this.tournaments.create(actor.id, body);
  }

  @Roles("hostess")
  @Patch(":id")
  @ApiOperation({ summary: "Edit a tournament, including the paid-place count (staff)" })
  update(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(UpdateTournamentInput)) body: UpdateTournamentInput,
  ): Promise<TournamentSummary> {
    return this.tournaments.update(actor.id, id, body);
  }

  @Roles("admin")
  @Delete(":id")
  @ApiOperation({ summary: "Delete a tournament with no history (admin)" })
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
    // Signing somebody else up is an admin action.
    if (body.userId && body.userId !== actor.id && !hasRole(actor.role, "hostess")) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Записать другого игрока может только персонал клуба",
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
    if (userId && userId !== actor.id && !hasRole(actor.role, "hostess")) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Недостаточно прав" });
    }
    return this.registrations.cancel(id, userId ?? actor.id, actor.id);
  }

  @Public()
  @Get(":id/registrations")
  @ApiOperation({ summary: "Who is signed up — used by the site and the bot" })
  listRegistrations(@Param("id") id: string): Promise<RegistrationView[]> {
    return this.registrations.listForTournament(id);
  }

  @Roles("hostess")
  @Post(":id/admin-screens")
  @ApiOperation({ summary: "Remember where the bot posted its live screens (admin)" })
  saveAdminScreens(
    @Param("id") id: string,
    @Body(zodPipe(SaveAdminScreensInput)) body: SaveAdminScreensInput,
  ): Promise<{ ok: true }> {
    return this.tournaments.saveAdminScreens(id, body);
  }

  // ─── Cash desk ──────────────────────────────────────────────────────────────

  @Roles("hostess")
  @Post(":id/payments")
  @ApiOperation({ summary: "Charge an entry, an add-on or a drink (admin)" })
  addPayment(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(AddPaymentInput)) body: AddPaymentInput,
  ): Promise<TournamentPlayer> {
    return this.payments.add(id, body, actor.id);
  }

  @Roles("hostess")
  @Delete(":id/payments/:paymentId")
  @ApiOperation({ summary: "Void a mistaken line without erasing it (admin)" })
  voidPayment(
    @CurrentUser() actor: RequestUser,
    @Param("paymentId") paymentId: string,
  ): Promise<TournamentPlayer> {
    return this.payments.voidPayment(paymentId, actor.id);
  }

  // ─── Results ────────────────────────────────────────────────────────────────

  @Roles("hostess")
  @Post(":id/place")
  @ApiOperation({ summary: "Record where one player finished as they bust out (admin)" })
  setPlace(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(SetPlaceInput)) body: SetPlaceInput,
  ): Promise<TournamentPlayer> {
    return this.results.setPlace(id, body.userId, body.place, actor.id);
  }

  @Roles("hostess")
  @Post(":id/finish")
  @ApiOperation({ summary: "Award rating for the evening; repeatable and reversible (admin)" })
  finish(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
  ): Promise<FinishSummary> {
    return this.results.finish(id, actor.id);
  }

  @Roles("hostess")
  @Post(":id/reopen")
  @ApiOperation({ summary: "Withdraw the rating and put the tournament back in play (admin)" })
  async reopen(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    await this.results.reopen(id, actor.id);
    return { ok: true };
  }

  @Roles("hostess")
  @Post(":id/results")
  @ApiOperation({ summary: "Submit the whole standings table at once (admin)" })
  async submitResults(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(SubmitResultsInput)) body: SubmitResultsInput,
  ): Promise<{ ok: true }> {
    await this.results.submit(id, body, actor.id);
    return { ok: true };
  }

  @Roles("hostess")
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
