import { expect, it } from "vitest";
import type { TournamentSummary } from "@poker/contracts";
import { scheduleCoverIds } from "./tournament-covers";

it("keeps saved covers and supplies distinct stable legacy covers", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: `event-${i}`, coverId: i === 0 ? 3 : null })) as TournamentSummary[];
  const covers = scheduleCoverIds(rows);
  expect(covers.get("event-0")).toBe(3);
  expect(new Set(covers.values()).size).toBe(20);
  expect(scheduleCoverIds(rows)).toEqual(covers);
});
