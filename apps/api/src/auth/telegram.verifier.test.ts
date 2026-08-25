import { createHash, createHmac } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { TelegramVerifier } from "./telegram.verifier";

const BOT_TOKEN = "123456:TEST-TOKEN-FOR-UNIT-TESTS";

/** Minimal stand-in for ConfigService; the verifier only reads one key. */
function makeVerifier(token: string = BOT_TOKEN): TelegramVerifier {
  return new TelegramVerifier({ get: () => token } as never);
}

function sign(fields: Record<string, string | number>, secret: Buffer): string {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${String(fields[key])}`)
    .join("\n");
  return createHmac("sha256", secret).update(checkString).digest("hex");
}

function widgetSecret(): Buffer {
  return createHash("sha256").update(BOT_TOKEN).digest();
}

function miniAppSecret(): Buffer {
  return createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
}

const now = () => Math.floor(Date.now() / 1000);

describe("verifyWidget", () => {
  const baseFields = {
    id: 555_001,
    first_name: "Иван",
    username: "ivan_poker",
    auth_date: now(),
  };

  it("accepts a correctly signed payload", () => {
    const hash = sign(baseFields, widgetSecret());
    const profile = makeVerifier().verifyWidget({ ...baseFields, hash } as never);

    expect(profile.telegramId).toBe("555001");
    expect(profile.username).toBe("ivan_poker");
  });

  it("rejects a tampered field", () => {
    const hash = sign(baseFields, widgetSecret());
    expect(() =>
      makeVerifier().verifyWidget({ ...baseFields, id: 999_999, hash } as never),
    ).toThrow(UnauthorizedException);
  });

  it("rejects a payload signed with a different bot token", () => {
    const otherSecret = createHash("sha256").update("999:WRONG").digest();
    const hash = sign(baseFields, otherSecret);
    expect(() => makeVerifier().verifyWidget({ ...baseFields, hash } as never)).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a stale payload even when the signature is valid", () => {
    const stale = { ...baseFields, auth_date: now() - 60 * 60 * 25 };
    const hash = sign(stale, widgetSecret());
    expect(() => makeVerifier().verifyWidget({ ...stale, hash } as never)).toThrow(
      /устарели/,
    );
  });

  it("refuses to work when the bot token is missing", () => {
    const hash = sign(baseFields, widgetSecret());
    expect(() => makeVerifier("").verifyWidget({ ...baseFields, hash } as never)).toThrow(
      /не настроен/,
    );
  });
});

describe("verifyInitData", () => {
  function buildInitData(overrides: Record<string, string> = {}): string {
    const user = JSON.stringify({ id: 777_002, first_name: "Пётр", username: "petr" });
    const fields: Record<string, string> = {
      auth_date: String(now()),
      query_id: "AAF_test",
      user,
      ...overrides,
    };
    const hash = sign(fields, miniAppSecret());
    return new URLSearchParams({ ...fields, hash }).toString();
  }

  it("accepts valid initData and extracts the user", () => {
    const profile = makeVerifier().verifyInitData(buildInitData());
    expect(profile.telegramId).toBe("777002");
    expect(profile.firstName).toBe("Пётр");
  });

  it("ignores the separate Ed25519 signature field when hashing", () => {
    const initData = `${buildInitData()}&signature=abc123`;
    expect(() => makeVerifier().verifyInitData(initData)).not.toThrow();
  });

  it("rejects initData without a hash", () => {
    expect(() => makeVerifier().verifyInitData("auth_date=1&user=%7B%7D")).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects initData whose user payload was swapped after signing", () => {
    const initData = buildInitData();
    const tampered = initData.replace(
      encodeURIComponent(JSON.stringify({ id: 777_002, first_name: "Пётр", username: "petr" })),
      encodeURIComponent(JSON.stringify({ id: 1, first_name: "Hacker" })),
    );
    expect(() => makeVerifier().verifyInitData(tampered)).toThrow(UnauthorizedException);
  });

  it("rejects a hash that is not valid hex of the right length", () => {
    const initData = buildInitData().replace(/hash=[0-9a-f]+/, "hash=zz");
    expect(() => makeVerifier().verifyInitData(initData)).toThrow(UnauthorizedException);
  });
});
