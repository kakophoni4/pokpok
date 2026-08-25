import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@poker/contracts";
import type { AuthedRequest, RequestUser } from "./auth.types";

export const IS_PUBLIC_KEY = "auth:public";
export const ROLES_KEY = "auth:roles";
export const OPTIONAL_AUTH_KEY = "auth:optional";

/** Opts a route out of authentication entirely. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Route works for guests but enriches the response when a token is present —
 * used by the schedule, which shows "you are registered" only to a known user.
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
