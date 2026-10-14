import { useEffect, useState } from "react";
import { Button } from "./ui";
import { prepareCast, sendCastScreen } from "../lib/google-cast";
import type { TVConnection } from "../pages/TVConnectPage";

export function CastScreenButton({ connection }: { connection: TVConnection }) {
  const [context, setContext] = useState<Awaited<ReturnType<typeof prepareCast>> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void prepareCast().then(value => { if (!cancelled) setContext(value); })
      .catch(error => { if (!cancelled) setMessage((error as Error).message); });
    return () => { cancelled = true; };
  }, []);
  return <div className="tv-connection-instructions">
    <Button disabled={!context || busy} onClick={() => {
      if (!context) return;
      setBusy(true); setMessage("");
      void sendCastScreen(context, connection)
        .then(() => setMessage("Экран отправлен на телевизор. Панель флора остаётся на телефоне."))
        .catch(() => setMessage("Передача не запущена. Повторите выбор телевизора; телефон и телевизор должны быть в одной сети Wi-Fi."))
        .finally(() => setBusy(false));
    }}>Отправить на телевизор · Chromecast</Button>
    {message && <p role="status">{message}</p>}
  </div>;
}
