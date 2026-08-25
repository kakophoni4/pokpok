import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  AdminUpdateUserInput,
  type MeUser,
  type Paginated,
  PaginationQuery,
  type PublicUser,
  UpdateMeInput,
  UserListQuery,
} from "@poker/contracts";
import type { RequestUser } from "../common/auth/auth.types";
import { CurrentUser, Public, Roles } from "../common/auth/decorators";
import { zodPipe } from "../common/validation/zod.pipe";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch("me")
  @ApiOperation({ summary: "Update your own preferences (nickname is staff-only)" })
  updateMe(
    @CurrentUser() actor: RequestUser,
    @Body(zodPipe(UpdateMeInput)) body: UpdateMeInput,
  ): Promise<MeUser> {
    return this.users.updateMe(actor.id, body);
  }

  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Public profile card" })
  findOne(@Param("id") id: string): Promise<PublicUser> {
    return this.users.findPublicById(id);
  }

  @Roles("moderator")
  @Get()
  @ApiOperation({ summary: "Player directory (staff)" })
  list(
    @Query(zodPipe(UserListQuery)) query: UserListQuery,
    @Query(zodPipe(PaginationQuery)) pagination: PaginationQuery,
  ): Promise<Paginated<PublicUser & { status: string; createdAt: string }>> {
    return this.users.list(query, pagination);
  }

  @Roles("admin")
  @Patch(":id")
  @ApiOperation({ summary: "Change nickname, role or status (admin)" })
  adminUpdate(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(zodPipe(AdminUpdateUserInput)) body: AdminUpdateUserInput,
  ): Promise<MeUser> {
    return this.users.adminUpdate(actor.id, id, body);
  }
}
