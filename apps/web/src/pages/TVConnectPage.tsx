import { useState } from "react";
import { ClubBrand } from "../components/ClubBrand";
import { Button } from "../components/ui";
import { api } from "../lib/api";
import { HallDisplayPage } from "./HallDisplay";
import "./hall-display.css";

export type TVConnection = { id: string; token: string };
const STORAGE = "concept-tv-connection";
function restore(): TVConnection | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
    return value && typeof value.id === "string" && typeof value.token === "string" && value.id && value.token ? value : null;
  } catch { return null; }
}
export function TVConnectPage() {
  const [connection, setConnection] = useState(restore);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function disconnect() {
    setConnection(null);
    setCode("");
    setError("");
    try { localStorage.removeItem(STORAGE); } catch { /* storage may be disabled */ }
  }
  if (connection) return <HallDisplayPage connection={connection} onDisconnect={disconnect} />;
  return (
    <main className="hall-pairing">
      <form className="hall-launch-card" onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !/^\d{6}$/.test(code)) return;
        setBusy(true); setError("");
        try {
          const next = await api.post<TVConnection>("/live/display/connect", { code });
          try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch { /* continue in memory */ }
          setConnection(next);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Не удалось подключиться");
        } finally { setBusy(false); }
      }}>
        <ClubBrand />
        <label htmlFor="tv-code" className="hall-code-label">Код турнира</label>
        <input id="tv-code" className="hall-code-input" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" autoFocus value={code} placeholder="000000" onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        <Button type="submit" loading={busy} disabled={code.length !== 6}>Подключить телевизор</Button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
