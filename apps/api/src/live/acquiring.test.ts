import { describe, expect, it } from "vitest";
import { UnconfiguredAcquiringGateway } from "./acquiring";

describe("unconfigured acquiring", () => {
  it("does not issue a payment link or report a bank confirmation", async () => {
    const gateway = new UnconfiguredAcquiringGateway();
    await expect(
      gateway.createPayment({
        operationId: "test",
        amountRub: 500,
        description: "Счёт",
      }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(gateway.inspectPayment("test")).rejects.toMatchObject({
      status: 503,
    });
  });
});
