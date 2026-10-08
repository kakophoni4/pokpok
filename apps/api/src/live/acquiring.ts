import { Injectable, ServiceUnavailableException } from "@nestjs/common";

/** Provider-neutral boundary. No successful payment is inferred from browser input. */
export interface AcquiringGateway {
  createPayment(input: {
    operationId: string;
    amountRub: number;
    description: string;
  }): Promise<{ providerId: string; paymentUrl: string }>;
  inspectPayment(providerId: string): Promise<{
    status: "pending" | "paid" | "failed";
    amountRub: number;
    operationId: string;
  }>;
}

@Injectable()
export class UnconfiguredAcquiringGateway implements AcquiringGateway {
  async createPayment(_input: {
    operationId: string;
    amountRub: number;
    description: string;
  }): Promise<never> {
    return this.unavailable();
  }
  async inspectPayment(_providerId: string): Promise<never> {
    return this.unavailable();
  }
  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: "ACQUIRING_NOT_CONFIGURED",
      message: "Оплата по СБП пока не подключена. Обратитесь к хостес",
    });
  }
}
