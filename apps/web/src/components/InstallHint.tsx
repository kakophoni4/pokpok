import { useState } from "react";
import { platform } from "../platform/platform";

const DISMISS_KEY = "poker:install-hint-dismissed";

/**
 * iOS gives no install prompt API: the only route is Share → "На экран «Домой»".
 * Android Chrome has a similar menu. Explain once, then never again.
 */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");

  const shouldShow =
    !dismissed && !platform.isStandalone && !platform.isEmbedded && (platform.isIos || platform.isAndroid);

  if (!shouldShow) return null;

  const copy = platform.isIos ? (
    <>
      Добавьте клуб на главный экран: нажмите{" "}
      <span className="text-gold-400">Поделиться</span> внизу Safari, затем{" "}
      <span className="text-gold-400">«На экран „Домой“»</span>. Откроется как приложение.
    </>
  ) : (
    <>
      Добавьте клуб на главный экран: меню Chrome{" "}
      <span className="text-gold-400">⋮</span>, затем{" "}
      <span className="text-gold-400">«На экран „Домой“»</span>. Тот же сайт, без браузерной рамки.
    </>
  );

  return (
    <div className="card mb-4 flex items-start gap-3 border-gold-500/25 bg-gold-500/5 p-3">
      <span aria-hidden className="text-xl">
        📲
      </span>
      <p className="flex-1 text-sm text-stone-300">{copy}</p>
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
