import type { TVConnection } from "../pages/TVConnectPage";

export const CAST_NAMESPACE = "urn:x-cast:io.concept.poker.timer";
export function castConnection(value: unknown): TVConnection | null {
  if (!value || typeof value !== "object") return null;
  const { id, token } = value as Record<string, unknown>;
  return typeof id === "string" && /^[a-z0-9]{1,64}$/i.test(id) &&
    typeof token === "string" && /^[a-z0-9-]{16,128}$/i.test(token) ? { id, token } : null;
}
type Session = { sendMessage(namespace: string, message: TVConnection): Promise<void> };
type Context = {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  requestSession(): Promise<void>;
  getCurrentSession(): Session | null;
};
type CastWindow = Window & {
  cast?: { framework?: { CastContext: { getInstance(): Context } } };
  __onGCastApiAvailable?: (available: boolean) => void;
};
let senderReady: Promise<void> | null = null;
export function loadCastSender(): Promise<void> {
  const target = window as CastWindow;
  if (target.cast?.framework?.CastContext) return Promise.resolve();
  if (senderReady) return senderReady;
  senderReady = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(), 12000);
    function fail() {
      clearTimeout(timer); script.remove(); senderReady = null;
      reject(new Error("Chromecast недоступен. Откройте панель в Chrome на Android и проверьте Wi-Fi."));
    }
    target.__onGCastApiAvailable = available => {
      if (!available) { fail(); return; }
      clearTimeout(timer); resolve();
    };
    script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    script.onerror = fail;
    document.head.append(script);
  });
  return senderReady;
}
export async function prepareCast(): Promise<Context> {
  const response = await fetch("/cast-config.json", { cache: "no-store" });
  const config = response.ok ? await response.json() as { applicationId?: unknown } : null;
  const applicationId = config?.applicationId ?? import.meta.env.VITE_CAST_APPLICATION_ID;
  if (typeof applicationId !== "string" || !/^[a-f0-9]{8}$/i.test(applicationId))
    throw new Error("Chromecast ещё не настроен. Пока подключите телевизор по коду.");
  await loadCastSender();
  const context = (window as CastWindow).cast?.framework?.CastContext.getInstance();
  if (!context) throw new Error("Этот браузер не поддерживает Chromecast. Используйте Chrome на Android.");
  context.setOptions({ receiverApplicationId: applicationId.toUpperCase(), autoJoinPolicy: "origin_scoped" });
  return context;
}
export async function sendCastScreen(context: Context, connection: TVConnection): Promise<void> {
  const message = castConnection(connection);
  if (!message) throw new Error("Некорректный экран турнира.");
  await context.requestSession();
  const session = context.getCurrentSession();
  if (!session) throw new Error("Телевизор не подключён.");
  await session.sendMessage(CAST_NAMESPACE, message);
}
