import { TOURNAMENT_COVER_COUNT, type TournamentSummary } from "@poker/contracts";

/** Compatibility for events created before the cover migration. */
export function scheduleCoverIds(events: readonly TournamentSummary[]): Map<string, number> {
  const result = new Map<string, number>();
  const used = new Set(events.flatMap(event => event.coverId ? [event.coverId] : []));
  for (const event of events) {
    if (event.coverId) { result.set(event.id, event.coverId); continue; }
    let hash = 0;
    for (const char of event.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    let cover = hash % TOURNAMENT_COVER_COUNT + 1;
    if (used.size === TOURNAMENT_COVER_COUNT) used.clear();
    while (used.has(cover)) cover = cover % TOURNAMENT_COVER_COUNT + 1;
    used.add(cover);
    result.set(event.id, cover);
  }
  return result;
}
