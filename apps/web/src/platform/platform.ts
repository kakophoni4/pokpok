/**
 * Platform adapter.
 *
 * The same React app runs as a website, as a Telegram Mini App and (later) as a
 * VK Mini App. Pages never check which one they are in; they ask this module.
 * Adding a platform means writing one adapter, not touching any screen.
 */

export type PlatformKind = "web" | "telegram" | "vk";

type TelegramWebApp = {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready(): void;
  expand(): void;
  close(): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  MainButton?: {
    setText(text: string): void;
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
  };
  openTelegramLink(url: string): void;
  openLink(url: string): void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function telegramApp(): TelegramWebApp | null {
  const app = window.Telegram?.WebApp;
  // The SDK is present on every page; a non-empty initData means we are really
  // running inside Telegram rather than a plain browser tab.
  return app && app.initData.length > 0 ? app : null;
}

function telegramShell(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/** The SDK object exists on every page; Telegram's WebView is what matters. */
function looksLikeTelegram(): boolean {
  if (telegramApp()) return true;
  return /Telegram/i.test(window.navigator.userAgent);
}

export const platform = {
  get kind(): PlatformKind {
    return telegramApp() ? "telegram" : "web";
  },

  get isEmbedded(): boolean {
    return this.kind !== "web";
  },

  /** Credentials for the matching /api/auth endpoint, or null on the plain web. */
  telegramInitData(): string | null {
    const data = telegramShell()?.initData;
    return data && data.length > 0 ? data : null;
  },

  /**
   * Mini App initData can arrive a beat after the script. Wait briefly so the
   * first paint inside Telegram does not fall through to the anonymous login.
   */
  async telegramInitDataSoon(timeoutMs = 1500): Promise<string | null> {
    const immediate = this.telegramInitData();
    if (immediate || !looksLikeTelegram()) return immediate;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const data = this.telegramInitData();
      if (data) return data;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.telegramInitData();
  },

  ready(): void {
    // Call even before initData arrives: some Telegram clients fill it only
    // after ready(), and skipping that leaves Mini App login stuck anonymous.
    const app = telegramShell();
    if (!app) return;
    app.ready();
    app.expand();
  },

  haptic(kind: "tap" | "success" | "error"): void {
    const haptics = telegramApp()?.HapticFeedback;
    if (!haptics) return;
    if (kind === "tap") haptics.impactOccurred("light");
    else haptics.notificationOccurred(kind);
  },

  /** Native back button inside Telegram; no-op elsewhere. */
  backButton(handler: (() => void) | null): void {
    const button = telegramApp()?.BackButton;
    if (!button) return;

    if (!handler) {
      button.hide();
      return;
    }
    button.onClick(handler);
    button.show();
  },

  openLink(url: string): void {
    const app = telegramApp();
    if (app) {
      if (url.startsWith("https://t.me/")) app.openTelegramLink(url);
      else app.openLink(url);
      return;
    }
    window.open(url, "_blank", "noopener");
  },

  /**
   * True when the site is running from the iOS home screen. Used to stop
   * nagging people who already installed it.
   */
  get isStandalone(): boolean {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    );
  },

  get isIos(): boolean {
    return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
  },

  get isAndroid(): boolean {
    return /Android/i.test(window.navigator.userAgent);
  },
};
