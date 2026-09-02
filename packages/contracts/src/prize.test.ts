import { describe, expect, it } from "vitest";
import { GrantPrizeInput, walletLabel, walletLines } from "./prize.js";

describe("walletLines", () => {
  it("folds identical prizes into one line, largest first", () => {
    expect(
      walletLines([
        { title: "Ребай", kind: "rebuy" },
        { title: "Пиво", kind: "drink" },
        { title: "Ребай", kind: "rebuy" },
        { title: "Ребай", kind: "rebuy" },
      ]),
    ).toEqual([
      { title: "Ребай", kind: "rebuy", count: 3 },
      { title: "Пиво", kind: "drink", count: 1 },
    ]);
  });

  it("reads as a single line the bot can quote", () => {
    expect(
      walletLabel([
        { title: "Пиво", kind: "drink", count: 2 },
        { title: "Ребай", kind: "rebuy", count: 1 },
      ]),
    ).toBe("Пиво ×2 · Ребай");
  });
});

describe("GrantPrizeInput", () => {
  it("defaults a tap to one prize", () => {
    expect(GrantPrizeInput.parse({ userId: "u1", menuItemId: "m1" }).quantity).toBe(1);
  });
});
