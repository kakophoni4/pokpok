import { useEffect, useState } from "react";
import { castConnection, CAST_NAMESPACE } from "../lib/google-cast";
import { ClubBrand } from "../components/ClubBrand";
import { HallDisplayPage } from "./HallDisplay";
import type { TVConnection } from "./TVConnectPage";

type Receiver = {
  addCustomMessageListener(namespace: string, listener: (event: { data: unknown }) => void): void;
  start(options: { disableIdleTimeout: boolean }): void;
  stop(): void;
};
export function CastReceiverPage() {
  const [connection, setConnection] = useState<TVConnection | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let receiver: Receiver | undefined, cancelled = false;
    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js";
    script.onload = () => {
      if (cancelled) return;
      try {
        const target = window as Window & { cast?: { framework?: { CastReceiverContext: { getInstance(): Receiver } } } };
        receiver = target.cast?.framework?.CastReceiverContext.getInstance();
        if (!receiver) throw new Error();
        receiver.addCustomMessageListener(CAST_NAMESPACE, event => {
          const next = castConnection(event.data);
          if (next) setConnection(next);
        });
        receiver.start({ disableIdleTimeout: true });
      } catch { setError("Запустите экран кнопкой Chromecast из панели флора."); }
    };
    script.onerror = () => { if (!cancelled) setError("Не удалось подключиться к Google Cast."); };
    document.head.append(script);
    return () => { cancelled = true; script.remove(); receiver?.stop(); };
  }, []);
  if (connection) return <HallDisplayPage key={connection.id} connection={connection} receiverMode />;
  return <main className="hall-state"><ClubBrand /><p>{error || "Ожидание турнира с телефона флора"}</p></main>;
}
