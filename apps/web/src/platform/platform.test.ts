import { afterEach, describe, expect, it } from "vitest";
import { platform } from "./platform";

const fake = window as unknown as Record<string, unknown>;

afterEach(() => {
  delete fake.Telegram;
  delete fake.TelegramGameProxy;
  delete fake.TelegramWebviewProxy;
  delete fake.__TG_PLATFORM__;
  delete fake.__TG_INIT_DATA__;
  window.sessionStorage.clear();
});

describe("Telegram detection", () => {
  it("treats a plain browser as the plain web", () => {
    expect(platform.isEmbedded).toBe(false);
    expect(platform.telegramInitData()).toBeNull();
  });

  /**
   * Every page of the site loads telegram-web-app.js so the login widget works,
   * and the script defines `Telegram.WebApp` and `TelegramGameProxy` wherever it
   * runs. Reading those as "we are in a Mini App" left ordinary visitors with no
   * sign-in button and a permanent «Входим…» on every card.
   */
  it("is not fooled by the Telegram SDK script alone", () => {
    fake.TelegramGameProxy = { receiveEvent: () => {} };
    fake.Telegram = { WebApp: { platform: "unknown", initData: "" } };
    window.sessionStorage.setItem("__telegram__initParams", "{}");

    expect(platform.isEmbedded).toBe(false);
  });

  it("recognises a real Mini App launch", () => {
    fake.Telegram = { WebApp: { platform: "tdesktop", initData: "user=%7B%7D&hash=abc" } };

    expect(platform.isEmbedded).toBe(true);
    expect(platform.telegramInitData()).toContain("hash=abc");
  });

  it("recognises the Telegram webview before initData lands", () => {
    fake.TelegramWebviewProxy = { postEvent: () => {} };

    expect(platform.isEmbedded).toBe(true);
  });

  it("remembers a launch param the client only sends once", () => {
    fake.__TG_PLATFORM__ = "android";

    expect(platform.isEmbedded).toBe(true);
  });
});
