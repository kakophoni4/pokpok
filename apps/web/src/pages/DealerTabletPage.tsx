import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setAccessToken } from "../lib/api";
import { Button, Card } from "../components/ui";
import { LiveDesk } from "./LivePages";
type Shift = {
  accessToken: string;
  userId: string;
  nickname: string;
  tournamentId: string;
  shiftId: string;
  table: number;
  breakStarted: boolean;
};
export function DealerTabletPage() {
  const [shift, setShift] = useState<Shift | null>(null);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    let stopped = false;
    const update = (value: Shift | null) => {
      if (!stopped) {
        setShift(value);
        setAccessToken(value?.accessToken ?? null);
      }
    };
    const restore = async () => {
      try {
        update(await api.post<Shift>("/dealer/refresh"));
      } catch {
        update(null);
      }
    };
    void (async () => {
      try {
        const token = new URLSearchParams(location.search).get("device");
        if (token) {
          await api.post("/dealer/pair", { token });
          history.replaceState(null, "", "/dealer");
        }
        await api.get("/dealer/device");
        if (!stopped) setConnected(true);
        await restore();
      } catch {
        if (!stopped) setConnected(false);
      }
      if (!stopped) setReady(true);
    })();
    const timer = setInterval(() => void restore(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  const login = async () => {
    setBusy(true);
    setError("");
    try {
      const value = await api.post<Shift>("/dealer/login", {
        nickname,
        password,
      });
      setPassword("");
      qc.clear();
      setAccessToken(value.accessToken);
      setShift(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      await api.post("/dealer/logout");
    } finally {
      setShift(null);
      setAccessToken(null);
      qc.clear();
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-gold-400 font-semibold tracking-widest">
            CONCEPT
          </div>
          <h1 className="text-2xl font-semibold">
            Стол{shift ? ` ${shift.table}` : ""}
          </h1>
        </div>
        {shift && (
          <div className="flex gap-3 items-center">
            <span>{shift.nickname}</span>
            <Button disabled={busy} onClick={() => void logout()}>
              Завершить смену
            </Button>
          </div>
        )}
      </header>
      {!shift && ready && (
        <a className="text-gold-400" href="/dealer/setup">
          Настройка стола
        </a>
      )}
      {!ready ? (
        <p>Подключение...</p>
      ) : shift ? (
        <>
          {shift.breakStarted && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong>Перерыв. Завершите смену после раздачи.</strong>
                <Button disabled={busy} onClick={() => void logout()}>
                  Раздача завершена
                </Button>
              </div>
            </Card>
          )}
          <LiveDesk id={shift.tournamentId} actorId={shift.userId} dealer />
        </>
      ) : connected ? (
        <form
          className="card max-w-sm mx-auto p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <h2 className="text-xl font-semibold">Вход дилера</h2>
          <label className="label">
            Ник
            <input
              autoComplete="username"
              className="field w-full"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          <label className="label">
            Пароль
            <input
              type="password"
              autoComplete="current-password"
              className="field w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-red-300">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy || !nickname.trim() || !password}
          >
            Начать смену
          </Button>
        </form>
      ) : (
        <Card>
          <a className="btn" href="/dealer/setup">
            Настроить планшет
          </a>
        </Card>
      )}
    </main>
  );
}
