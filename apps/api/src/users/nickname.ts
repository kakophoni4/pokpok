import { NICKNAME_REGEX } from "@poker/contracts";

const MAX_LENGTH = 24;
const FALLBACK = "player";

/**
 * Turns whatever Telegram or VK gave us into something that satisfies the
 * nickname rules. Users never type this: it is a starting point that staff
 * can change later.
 */
export function normalizeNicknameCandidate(...parts: (string | null | undefined)[]): string {
  const joined = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("_")
    .trim();

  const cleaned = Array.from(joined)
    .map((char) => (NICKNAME_REGEX.test(char) ? char : "_"))
    .join("")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, MAX_LENGTH);

  return cleaned.length >= 2 ? cleaned : FALLBACK;
}

/**
 * Appends a numeric suffix until the name is free, keeping the result within
 * the length limit. `isTaken` is injected so this stays a pure, testable function.
 */
export async function findFreeNickname(
  candidate: string,
  isTaken: (nickname: string) => Promise<boolean>,
): Promise<string> {
  const base = normalizeNicknameCandidate(candidate);

  if (!(await isTaken(base))) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const tail = `_${suffix}`;
    const trimmed = base.slice(0, MAX_LENGTH - tail.length);
    const attempt = `${trimmed}${tail}`;
    if (!(await isTaken(attempt))) return attempt;
  }

  // Practically unreachable; better than looping forever.
  return `${base.slice(0, 12)}_${Date.now().toString(36)}`.slice(0, MAX_LENGTH);
}
