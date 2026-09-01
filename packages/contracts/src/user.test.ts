import { describe, expect, it } from "vitest";
import { formatPlayerName } from "./user.js";

describe("formatPlayerName", () => {
  it("abbreviates a real first and last name", () => {
    expect(formatPlayerName("Дмитрий Тихонов", "dima_tg")).toBe("Дмитрий Т.");
    expect(formatPlayerName("Денис Ковалёв", "DenisPro")).toBe("Денис К.");
  });

  it("keeps a nickname phrase in full", () => {
    expect(formatPlayerName("рома рома мен вил", "roma")).toBe("рома рома мен вил");
  });

  it("falls back to the club nickname when Telegram has no name", () => {
    expect(formatPlayerName(null, "DenisPro")).toBe("DenisPro");
    expect(formatPlayerName("  ", "DenisPro")).toBe("DenisPro");
  });

  it("does not treat a single given name as a surname to hide", () => {
    expect(formatPlayerName("Рома", "roma")).toBe("Рома");
  });
});
