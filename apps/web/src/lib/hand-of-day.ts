/** The club hand matches two ranks, independently of suits. */
export function handOfDayRanks(value: string | null | undefined): string[] | null {
  if (!value) return null;
  const letters: Record<string, string> = { А: "A", К: "K", Т: "T", В: "J", Д: "Q" };
  const clean = value.toUpperCase().replace(/[АКТВД]/g, (letter) => letters[letter]!)
    .replace(/[♠♥♦♣]/g, "").trim();
  const match = clean.match(/^(10|[2-9TJQKA])[\s,\/-]*(10|[2-9TJQKA])$/);
  return match ? match.slice(1).map((rank) => rank === "T" ? "10" : rank) : null;
}
