import type { LiveState } from "@poker/contracts";
export function shiftEndElapsed(
  state: LiveState,
  elapsed: number,
): number | null {
  let end = 0;
  for (const level of state.config.levels) {
    const start = end;
    end += level.seconds;
    if (level.break && elapsed < start) return end;
  }
  return null;
}
export function billableHours(
  seconds: number,
  stepMinutes: number,
  mode: "nearest" | "up" | "down",
) {
  const units = Math.max(0, seconds) / (stepMinutes * 60);
  const rounded =
    mode === "up"
      ? Math.ceil(units)
      : mode === "down"
        ? Math.floor(units)
        : Math.round(units);
  return (rounded * stepMinutes) / 60;
}
