import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { Env } from "../../config/env";
import type { AuthedRequest } from "./auth.types";

/**
 * Guards the endpoints the bots call. Bots are trusted server-side clients:
 * they already know the provider user id from the incoming update, so they
 * authenticate with a shared secret rather than a user token.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get("INTERNAL_API_TOKEN", { infer: true });
    if (!expected) {
      throw new UnauthorizedException({
        code: "INTERNAL_AUTH_DISABLED",
        message: "Внутренний доступ не настроен",
      });
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers["x-internal-token"];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException({ code: "BAD_INTERNAL_TOKEN", message: "Доступ запрещён" });
    }

    return true;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
