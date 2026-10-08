import type { BlindLevel, LiveView } from "@poker/contracts";

export type DisplayClock = {
  id: string;
  index: number;
  remaining: number;
  elapsed: number;
  running: boolean;
  complete: boolean;
  level: BlindLevel;
  next: BlindLevel | null;
  untilBreak: number | null;
};

// Anchor responses to receipt time: an incorrectly set TV clock cannot shift the game.
export function projectDisplayClock(
  view: LiveView,
  now: number,
  receivedAt: number,
): DisplayClock | null {
  const levels = view.state?.config.levels;
  if (!levels?.length || !view.clock || !view.state) return null;
  const running = view.state.clock.running;
  const elapsed =
    view.clock.elapsed +
    (running ? Math.floor(Math.max(0, now - receivedAt) / 1000) : 0);
  let remaining = elapsed,
    index = 0;
  for (
    ;
    index < levels.length - 1 && remaining >= levels[index]!.seconds;
    index++
  )
    remaining -= levels[index]!.seconds;
  const level = levels[index]!;
  const complete = index === levels.length - 1 && remaining >= level.seconds;
  const left = Math.max(0, level.seconds - remaining);
  const nextBreak = levels.findIndex((l, i) => i > index && l.break);
  const untilBreak = level.break
    ? 0
    : nextBreak < 0
      ? null
      : left +
        levels
          .slice(index + 1, nextBreak)
          .reduce((sum, l) => sum + l.seconds, 0);
  return {
    id: view.id,
    index,
    remaining: left,
    elapsed,
    running,
    complete,
    level,
    next: levels[index + 1] ?? null,
    untilBreak,
  };
}

export type DisplayCue =
  | "minute"
  | "ten"
  | "level"
  | "break"
  | "pause"
  | "resume"
  | "complete";
export class DisplayCueTracker {
  private previous: { clock: DisplayClock; at: number } | null = null;
  private played = new Set<string>();
  observe(clock: DisplayClock, now: number, fresh: boolean): DisplayCue | null {
    const previous = this.previous;
    this.previous = fresh ? { clock, at: now } : null;
    if (
      !fresh ||
      !previous ||
      previous.clock.id !== clock.id ||
      now - previous.at > 10000
    ) {
      this.played.clear();
      return null;
    }
    const old = previous.clock;
    // A poll can correct the projected clock backwards by a second near a
    // boundary. Keep the last observation until it catches up, instead of
    // announcing the old level and then the new level a second time.
    if (
      old.running &&
      clock.running &&
      clock.elapsed < old.elapsed &&
      old.elapsed - clock.elapsed <= 2
    ) {
      this.previous = { clock: old, at: now };
      return null;
    }
    if (old.index !== clock.index) this.played.clear();
    if (!old.complete && clock.complete) return "complete";
    if (old.running !== clock.running)
      return clock.running ? "resume" : "pause";
    if (old.index !== clock.index) return clock.level.break ? "break" : "level";
    if (
      !clock.running ||
      clock.complete ||
      clock.elapsed < old.elapsed ||
      clock.elapsed - old.elapsed > 8
    )
      return null;
    if (
      old.level.seconds !== clock.level.seconds ||
      old.level.break !== clock.level.break
    )
      return null;
    for (const [seconds, cue] of [
      [10, "ten"],
      [60, "minute"],
    ] as const) {
      if (
        clock.next &&
        old.remaining > seconds &&
        clock.remaining <= seconds &&
        !this.played.has(cue)
      ) {
        this.played.add(cue);
        return cue;
      }
    }
    return null;
  }
}
export function clockText(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
export function cueText(cue: DisplayCue, clock: DisplayClock) {
  if (cue === "pause") return "Таймер остановлен";
  if (cue === "resume") return "Игра продолжается";
  if (cue === "complete") return "Структура завершена";
  if (cue === "break") return "Перерыв";
  if (cue === "level") return clock.level.title;
  const next = clock.next?.break
    ? "До перерыва"
    : clock.level.break
      ? "До продолжения игры"
      : "До следующего уровня";
  return `${next} ${cue === "minute" ? "1 минута" : "10 секунд"}`;
}
