import { describe, expect, it } from "vitest";
import { describe as tell, summariseStaff } from "./journal";

describe("evening journal", () => {
  it("says who paid for what, and how much came in", () => {
    const told = tell(
      {
        id: "a1",
        action: "payment.add",
        entity: "Tournament",
        entityId: "t1",
        before: null,
        after: { userId: "u1", title: "Ребай", kind: "rebuy", amountRub: 1000, multiplier: 2 },
        createdAt: new Date(),
      },
      new Map(),
    );

    expect(told).toEqual({
      label: "Оплата · Ребай ×2",
      amountRub: 1000,
      playerId: "u1",
    });
  });

  it("gives a voided line back as a negative, so the evening still adds up", () => {
    const told = tell(
      {
        id: "a2",
        action: "payment.void",
        entity: "Tournament",
        entityId: "t1",
        before: { userId: "u1", note: "Пиво", kind: "drink", amountRub: 200 },
        after: null,
        createdAt: new Date(),
      },
      new Map(),
    );

    expect(told.amountRub).toBe(-200);
    expect(told.label).toContain("Пиво");
  });

  it("looks up combo names so the log does not show a machine code", () => {
    const told = tell(
      {
        id: "a3",
        action: "achievement.grant",
        entity: "UserAchievement",
        entityId: "g1",
        before: null,
        after: { userId: "u1", code: "quads", points: 50 },
        createdAt: new Date(),
      },
      new Map([["quads", "Каре"]]),
    );

    expect(told.label).toBe("Комбинация · Каре");
  });

  it("groups the desk by who worked it", () => {
    expect(
      summariseStaff([
        {
          id: "1",
          at: "2026-09-02T18:00:00.000Z",
          action: "payment.add",
          label: "Оплата · Вход",
          actor: "Хостес",
          player: "Тимур",
          playerId: "u1",
          amountRub: 500,
        },
        {
          id: "2",
          at: "2026-09-02T18:01:00.000Z",
          action: "payment.void",
          label: "Отмена",
          actor: "Хостес",
          player: "Тимур",
          playerId: "u1",
          amountRub: -200,
        },
      ]),
    ).toEqual([{ name: "Хостес", actions: 2, amountRub: 300 }]);
  });
});
