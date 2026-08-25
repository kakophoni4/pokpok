import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Validates a request payload against a schema from @poker/contracts, so the
 * exact same rules run in the browser, in the API and in both bots.
 */
@Injectable()
export class ZodValidationPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Данные не прошли проверку",
        details: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}

/** Sugar for `@Body(zodPipe(SomeSchema))`. */
export function zodPipe<T extends ZodType>(schema: T): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
