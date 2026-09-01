import { describe, expect, it } from "vitest";
import { UpdateAchievementInput } from "./achievement.js";
import { UpdateSeasonInput } from "./rating.js";
import { CreateTournamentInput, UpdateTournamentInput } from "./tournament.js";

const START = "2026-09-18T15:00:00.000Z";

describe("UpdateTournamentInput", () => {
  // Zod keeps `.default()` alive under `.partial()`, so an edit that never
  // mentioned the status used to publish "draft" and wipe the tournament off
  // the schedule.
  it("leaves out fields the caller did not send", () => {
    const patch = UpdateTournamentInput.parse({ title: "Вечерний турнир #17" });

    expect(patch).toEqual({ title: "Вечерний турнир #17" });
    expect("status" in patch).toBe(false);
    expect("ratingMultiplier" in patch).toBe(false);
  });

  it("still accepts an explicit status change", () => {
    expect(UpdateTournamentInput.parse({ status: "reg_open" }).status).toBe("reg_open");
  });

  it("keeps applying defaults when a tournament is created", () => {
    const created = CreateTournamentInput.parse({ title: "Новый турнир", startsAt: START });

    expect(created.status).toBe("draft");
    expect(created.ratingMultiplier).toBe(1);
  });
});

describe("other patch schemas", () => {
  it("does not reset a season's rating config", () => {
    expect(UpdateSeasonInput.parse({ title: "Сезон 2027" })).toEqual({ title: "Сезон 2027" });
  });

  it("does not re-activate an achievement that was only renamed", () => {
    expect(UpdateAchievementInput.parse({ title: "Бэд бит" })).toEqual({ title: "Бэд бит" });
  });
});
