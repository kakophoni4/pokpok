import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

type ExceptionBody = {
  code?: string;
  message?: string | string[];
  details?: unknown;
};

/**
 * Collapses every failure into the single ApiError shape from @poker/contracts,
 * so clients have exactly one error branch to handle.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const body: ExceptionBody = typeof raw === "string" ? { message: raw } : (raw as ExceptionBody);

      response.status(status).json({
        statusCode: status,
        code: body.code ?? defaultCodeFor(status),
        message: Array.isArray(body.message) ? body.message.join("; ") : (body.message ?? "Ошибка"),
        ...(body.details === undefined ? {} : { details: body.details }),
      });
      return;
    }

    // Anything unmapped is a bug: log the detail, tell the client nothing useful.
    this.logger.error("Unhandled exception", exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "Внутренняя ошибка сервера",
    });
  }
}

function defaultCodeFor(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "RATE_LIMITED";
    default:
      return "ERROR";
  }
}
