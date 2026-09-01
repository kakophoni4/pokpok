import { describe, expect, it } from "vitest";
import {
  parsePromoBundle,
  promoBundleLabel,
  promoKindFromBundle,
} from "./club.js";

describe("promo bundles", () => {
  it("accepts a combo of an addon and a bar item", () => {
    const bundle = parsePromoBundle([
      { kind: "addon", quantity: 1, title: "Адон" },
      { kind: "drink", quantity: 1, title: "Кальян" },
    ]);
    expect(bundle).toHaveLength(2);
    expect(promoKindFromBundle(bundle)).toBe("other");
    expect(promoBundleLabel(bundle, "addon")).toBe("Адон + Кальян");
  });

  it("treats two of the same bar item as a quantity", () => {
    const bundle = parsePromoBundle([{ kind: "drink", quantity: 2, title: "Кальян" }]);
    expect(promoKindFromBundle(bundle)).toBe("drink");
    expect(promoBundleLabel(bundle, "other")).toBe("Кальян ×2");
  });

  it("ignores junk from the database instead of throwing", () => {
    expect(parsePromoBundle(null)).toEqual([]);
    expect(parsePromoBundle("addon")).toEqual([]);
    expect(promoBundleLabel(null, "rebuy")).toBe("Ребай");
  });
});
