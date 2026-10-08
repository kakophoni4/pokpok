import { describe, expect, it } from "vitest";
import {
  CreateAchievementInput,
  isEveningHand,
  UpdateAchievementInput,
} from "./achievement.js";

describe("Achievement categories", () => {
  it("does not expose repeatable club awards as table combinations", () => {
    expect(
      isEveningHand({
        category: "club",
        isActive: true,
        isRepeatable: true,
        rule: null,
      }),
    ).toBe(false);
    expect(
      isEveningHand({
        category: "game",
        isActive: true,
        isRepeatable: true,
        rule: null,
      }),
    ).toBe(true);
    expect(
      isEveningHand({
        category: "game",
        isActive: false,
        isRepeatable: true,
        rule: null,
      }),
    ).toBe(false);
  });
  it("validates categories and preserves partial updates", () => {
    expect(
      CreateAchievementInput.parse({ title: "Первая победа" }).category,
    ).toBe("club");
    expect(
      CreateAchievementInput.safeParse({ title: "Каре", category: "invalid" })
        .success,
    ).toBe(false);
    expect(
      UpdateAchievementInput.parse({ title: "Новое название" }).category,
    ).toBeUndefined();
    expect(UpdateAchievementInput.parse({ category: "game" }).category).toBe(
      "game",
    );
  });
});
