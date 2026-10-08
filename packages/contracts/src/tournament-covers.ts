export const TOURNAMENT_COVER_COUNT = 20;

export function tournamentCoverUrl(id: number): string {
  return `/images/tournaments/cover-${String(id).padStart(2, "0")}.webp`;
}

/** A complete shuffled cycle before any image is used again. */
export function availableTournamentCovers(previous: readonly (number | null)[]): number[] {
  const counts = Array.from({ length: TOURNAMENT_COVER_COUNT }, () => 0);
  for (const id of previous) {
    if (id != null && Number.isInteger(id) && id >= 1 && id <= TOURNAMENT_COVER_COUNT) counts[id - 1]!++;
  }
  const least = Math.min(...counts);
  return counts.flatMap((count, index) => count === least ? [index + 1] : []);
}
