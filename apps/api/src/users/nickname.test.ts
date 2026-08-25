import { describe, expect, it } from "vitest";
import { Nickname } from "@poker/contracts";
import { findFreeNickname, normalizeNicknameCandidate } from "./nickname";

describe("normalizeNicknameCandidate", () => {
  it("keeps a clean Telegram username as is", () => {
    expect(normalizeNicknameCandidate("ivan_poker")).toBe("ivan_poker");
  });

  it("keeps Cyrillic names", () => {
    expect(normalizeNicknameCandidate("Пётр", "Смирнов")).toBe("Пётр_Смирнов");
  });

  it("strips characters the nickname rules forbid", () => {
    expect(normalizeNicknameCandidate("ваня 🎰 poker!")).toBe("ваня_poker");
  });

  it("falls back when nothing usable is left", () => {
    expect(normalizeNicknameCandidate("🎰🎰")).toBe("player");
    expect(normalizeNicknameCandidate(null, undefined, "")).toBe("player");
  });

  it("respects the length limit", () => {
    const result = normalizeNicknameCandidate("a".repeat(80));
    expect(result.length).toBeLessThanOrEqual(24);
  });

  it("always produces something the contract accepts", () => {
    const samples = ["ivan_poker", "Пётв Иванов", "🎰", "..--..", "x", "a".repeat(90)];
    for (const sample of samples) {
      expect(Nickname.safeParse(normalizeNicknameCandidate(sample)).success).toBe(true);
    }
  });
});

describe("findFreeNickname", () => {
  it("returns the base name when it is free", async () => {
    const result = await findFreeNickname("ivan", async () => false);
    expect(result).toBe("ivan");
  });

  it("adds a suffix when the name is taken", async () => {
    const taken = new Set(["ivan", "ivan_2", "ivan_3"]);
    const result = await findFreeNickname("ivan", async (nick) => taken.has(nick));
    expect(result).toBe("ivan_4");
  });

  it("keeps suffixed names inside the length limit", async () => {
    const long = "и".repeat(24);
    const result = await findFreeNickname(long, async (nick) => nick === long);
    expect(result.length).toBeLessThanOrEqual(24);
    expect(Nickname.safeParse(result).success).toBe(true);
  });
});
