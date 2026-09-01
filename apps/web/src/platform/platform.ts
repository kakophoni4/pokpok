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

type TelegramWebView = {
  initParams?: Record<string, string>;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp; WebView?: TelegramWebView };
    TelegramWebviewProxy?: unknown;
    __TG_INIT_DATA__?: string;
    __TG_PLATFORM__?: string;
    webkit?: { messageHandlers?: { TelegramWebView?: unknown } };
  }
}

const INIT_DATA_KEY = "__poker_tg_init_data";
const PLATFORM_KEY = "__poker_tg_platform";

function telegramShell(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

function rememberInitData(data: string | null | undefined): void {
  if (!data || data.length === 0) return;
  window.__TG_INIT_DATA__ = data;
  try {
    sessionStorage.setItem(INIT_DATA_KEY, data);
  } catch {
    /* private mode */
  }
}

function stored(key: string): string | null {
  try {
    const value = sessionStorage.getItem(key);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function sdkInitParams(): Record<string, string> {
  const fromView = window.Telegram?.WebView?.initParams;
  if (fromView && Object.keys(fromView).length > 0) return fromView;
  try {
    const raw = sessionStorage.getItem("__telegram__initParams");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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

function hashInitData(): string | null {
  const data = hashParams().get("tgWebAppData");
  return data && data.length > 0 ? data : null;
}

/**
 * True inside a Telegram WebView even when initData has not landed yet.
 *
 * Every signal here has to be one a plain browser cannot produce. The SDK
 * script alone is not one: loading it defines `Telegram.WebApp` *and*
 * `TelegramGameProxy` on any page, and treating those as proof left ordinary
 * visitors staring at «Входим…» with no way to sign in. Launch params live in
 * the hash, then in Telegram.WebView.initParams once the SDK strips the hash,
 * then in sessionStorage for the rest of the visit.
 */
function looksLikeTelegram(): boolean {
  if (readInitData()) return true;
  const platform =
    window.__TG_PLATFORM__ || stored(PLATFORM_KEY) || sdkInitParams().tgWebAppPlatform || "";
  if (platform && platform !== "unknown") return true;
  if (hashParams().get("tgWebAppData") || hashParams().get("tgWebAppPlatform")) return true;
  // Injected by the Telegram client itself, not by the SDK script.
  if (typeof window.TelegramWebviewProxy !== "undefined") return true;
  if (window.webkit?.messageHandlers?.TelegramWebView) return true;
  const app = telegramShell();
  if (app?.platform && app.platform !== "unknown") return true;
  try {
    const query = new URLSearchParams(window.location.search);
    if (query.has("tgWebAppStartParam") || query.has("tgWebAppData")) return true;
  } catch {
    /* ignore */
  }
  try {
    if (window.parent != null && window.parent !== window) {
      if (/telegram\.org/i.test(document.referrer)) return true;
    }
  } catch {
    /* cross-origin parent */
  }
  return false;
}

function readInitData(): string | null {
  const fromSdk = telegramShell()?.initData;
  if (fromSdk && fromSdk.length > 0) {
    rememberInitData(fromSdk);
    return fromSdk;
  }
  const fromParams = sdkInitParams().tgWebAppData;
  if (fromParams && fromParams.length > 0) {
    rememberInitData(fromParams);
    return fromParams;
  }
  if (window.__TG_INIT_DATA__ && window.__TG_INIT_DATA__.length > 0) return window.__TG_INIT_DATA__;
  const fromStore = stored(INIT_DATA_KEY);
  if (fromStore) return fromStore;
  const fromHash = hashInitData();
  if (fromHash) {
    rememberInitData(fromHash);
    return fromHash;
  }
  return null;
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
    return readInitData();
  },

  /**
   * Mini App initData can arrive a beat after the script. Wait so the first
   * paint inside Telegram does not fall through to the anonymous login.
   */
  async telegramInitDataSoon(timeoutMs = 8000): Promise<string | null> {
    this.ready();
    const immediate = this.telegramInitData();
    if (immediate || timeoutMs <= 0) return immediate;
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
    const app = telegramShell();
    if (!app) return;
    app.ready();
    app.expand();
    if (app.initData) rememberInitData(app.initData);
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
