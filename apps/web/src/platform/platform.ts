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
  platform?: string;
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
    TelegramWebviewProxy?: unknown;
    TelegramGameProxy?: unknown;
    __TG_INIT_DATA__?: string;
    __TG_PLATFORM__?: string;
    webkit?: { messageHandlers?: { TelegramWebView?: unknown } };
  }
}

function telegramShell(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

function hashParams(): URLSearchParams {
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    return new URLSearchParams(hash);
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Telegram sometimes puts the signed payload in the URL hash instead of (or
 * before) filling WebApp.initData. URLSearchParams already decodes it.
 */
function hashInitData(): string | null {
  const data = hashParams().get("tgWebAppData");
  return data && data.length > 0 ? data : null;
}

function hashLooksLikeMiniApp(): boolean {
  const params = hashParams();
  return Boolean(
    params.get("tgWebAppData") ||
      params.get("tgWebAppPlatform") ||
      params.get("tgWebAppVersion") ||
      params.get("tgWebAppThemeParams"),
  );
}

/**
 * True inside a Telegram WebView even when initData has not landed yet.
 *
 * The SDK object exists on every page of this site, so its mere presence is
 * not enough. iOS Mini Apps often report a Safari user agent with no
 * "Telegram" token; those still set WebApp.platform, inject TelegramWebviewProxy,
 * or put launch params in the URL hash.
 */
function looksLikeTelegram(): boolean {
  if (window.__TG_INIT_DATA__) return true;
  if (window.__TG_PLATFORM__ && window.__TG_PLATFORM__ !== "unknown") return true;
  if (hashInitData() || hashLooksLikeMiniApp()) return true;
  if (typeof window.TelegramWebviewProxy !== "undefined") return true;
  if (typeof window.TelegramGameProxy !== "undefined") return true;
  if (window.webkit?.messageHandlers?.TelegramWebView) return true;
  if (/Telegram/i.test(window.navigator.userAgent)) return true;
  const app = telegramShell();
  if (app && app.initData.length > 0) return true;
  if (app?.platform && app.platform !== "unknown") return true;
  try {
    const query = new URLSearchParams(window.location.search);
    if (query.has("tgWebAppStartParam") || query.has("tgWebAppData")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export const platform = {
  get kind(): PlatformKind {
    return looksLikeTelegram() ? "telegram" : "web";
  },

  get isEmbedded(): boolean {
    return this.kind !== "web";
  },

  /** Credentials for the matching /api/auth endpoint, or null on the plain web. */
  telegramInitData(): string | null {
    const fromSdk = telegramShell()?.initData;
    if (fromSdk && fromSdk.length > 0) return fromSdk;
    if (window.__TG_INIT_DATA__ && window.__TG_INIT_DATA__.length > 0) {
      return window.__TG_INIT_DATA__;
    }
    return hashInitData();
  },

  /**
   * Mini App initData can arrive a beat after the script. Wait so the first
   * paint inside Telegram does not fall through to the anonymous login.
   */
  async telegramInitDataSoon(timeoutMs = 8000): Promise<string | null> {
    this.ready();
    const immediate = this.telegramInitData();
    if (immediate || !looksLikeTelegram()) return immediate;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      this.ready();
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
    const haptics = telegramShell()?.HapticFeedback;
    if (!haptics || !looksLikeTelegram()) return;
    if (kind === "tap") haptics.impactOccurred("light");
    else haptics.notificationOccurred(kind);
  },

  /** Native back button inside Telegram; no-op elsewhere. */
  backButton(handler: (() => void) | null): void {
    const button = telegramShell()?.BackButton;
    if (!button || !looksLikeTelegram()) return;

    if (!handler) {
      button.hide();
      return;
    }
    button.onClick(handler);
    button.show();
  },

  openLink(url: string): void {
    const app = telegramShell();
    if (app && looksLikeTelegram()) {
      try {
        if (url.startsWith("https://t.me/") || url.startsWith("tg:")) app.openTelegramLink(url);
        else app.openLink(url);
        return;
      } catch {
        // Fall through to a plain window.open if the SDK method is missing.
      }
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

if (typeof window !== "undefined") {
  try {
    platform.ready();
  } catch {
    /* SDK not injected yet */
  }
}
