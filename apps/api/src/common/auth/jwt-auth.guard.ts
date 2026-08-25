import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { AccessTokenClaims } from "@poker/contracts";
import type { AuthedRequest } from "./auth.types";
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from "./decorators";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, targets) ?? false;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractBearer(request);

    if (!token) {
      if (optional) return true;
      throw new UnauthorizedException({ code: "NO_TOKEN", message: "Нужна авторизация" });
    }

    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
      request.user = {
        id: claims.sub,
        role: claims.role,
        nickname: claims.nickname,
        audience: claims.aud,
      };
      return true;
    } catch {
      if (optional) return true;
      throw new UnauthorizedException({
        code: "INVALID_TOKEN",
        message: "Сессия истекла, войдите заново",
      });
    }
  }
}

function extractBearer(request: AuthedRequest): string | null {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}
