import { useState } from "react";
import { platform } from "../platform/platform";

const DISMISS_KEY = "poker:install-hint-dismissed";

/**
 * iOS gives no install prompt API: the only route is Share → "На экран «Домой»".
 * So we explain it once, on iPhone Safari only, and never again after dismissal.
 */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");

  const shouldShow =
    !dismissed && platform.isIos && !platform.isStandalone && !platform.isEmbedded;

  if (!shouldShow) return null;

  return (
    <div className="card mb-4 flex items-start gap-3 border-gold-500/25 bg-gold-500/5 p-3">
      <span aria-hidden className="text-xl">
        📲
      </span>
      <p className="flex-1 text-sm text-stone-300">
        Добавьте клуб на главный экран: нажмите{" "}
        <span className="text-gold-400">Поделиться</span> внизу Safari, затем{" "}
        <span className="text-gold-400">«На экран „Домой“»</span>. Откроется как приложение.
      </p>
      <button
        aria-label="Скрыть подсказку"
        className="text-stone-500 hover:text-stone-300"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
