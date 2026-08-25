import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasRole, type UserRole } from "@poker/contracts";
import type { AuthedRequest } from "./auth.types";
import { ROLES_KEY } from "./decorators";

/**
 * Roles are hierarchical: admin satisfies a moderator requirement.
 * Runs after JwtAuthGuard, so req.user is already populated.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Недостаточно прав" });
    }

    const allowed = required.some((role) => hasRole(user.role, role));
    if (!allowed) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Недостаточно прав" });
    }

    return true;
  }
}
