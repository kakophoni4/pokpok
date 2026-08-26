import type { LoginTicketPrompt } from "@poker/contracts";
import { InlineKeyboard } from "grammy";
import { Api, type TelegramProfile } from "./api.js";
import { escapeHtml } from "./format.js";
import type { Screen } from "./player.js";

/** Callback payload: verdict plus the ticket code, comfortably under 64 bytes. */
export const LOGIN_CALLBACK = /^lg:([yn]):([\da-f]+)$/;

/**
 * Signing in to the website by pressing a button here.
 *
 * The bot never sees the session — it only tells the server «yes, this Telegram
 * account asked for that ticket». The browser is waiting on the other side and
 * collects the tokens itself.
 */
export class LoginConfirm {
  constructor(private readonly api: Api) {}

  /**
   * The question. Showing the check phrase is the whole defence against a link
   * forwarded by somebody else: it only matches on the screen that asked.
   */
  async ask(code: string): Promise<Screen> {
    const prompt = await this.api.internal<LoginTicketPrompt>("/auth/internal/login/prompt", {
      code,
    });

    return {
      text: [
        "<b>Вход на сайт клуба</b>",
        "",
        `Кодовая фраза: <b>${escapeHtml(prompt.phrase)}</b>`,
        "",
        "Проверьте, что та же фраза показана на сайте, и подтвердите вход.",
        "Если вы не открывали сайт — нажмите «Это не я».",
      ].join("\n"),
      keyboard: new InlineKeyboard()
        .text("✅ Это я, войти", `lg:y:${code}`)
        .row()
        .text("Это не я", `lg:n:${code}`),
    };
  }

  async settle(code: string, profile: TelegramProfile, approve: boolean): Promise<void> {
    await this.api.internal("/auth/internal/login/settle", {
      code,
      approve,
      profile: Api.profilePayload(profile),
    });
  }

  /** Replaces the question once it has been answered. */
  answered(approve: boolean): Screen {
    return {
      text: approve
        ? [
            "<b>Вход подтверждён</b>",
            "",
            "Вернитесь на сайт — он уже пускает вас внутрь.",
          ].join("\n")
        : [
            "<b>Вход отклонён</b>",
            "",
            "Никто не попал в ваш аккаунт. Если ссылку присылал кто-то другой —",
            "просто удалите её.",
          ].join("\n"),
      keyboard: new InlineKeyboard().text("Открыть меню клуба", "nav:home"),
    };
  }
}
