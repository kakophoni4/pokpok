import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { api } from "../lib/api";
import { Button, Card, Loading } from "../components/ui";
import type { LiveView, TournamentSummary } from "@poker/contracts";
export function DealerSetupPage() {
  const { user, status } = useAuth();
  const [params] = useSearchParams();
  const [event, setEvent] = useState(params.get("event") ?? "");
  const [table, setTable] = useState(Number(params.get("table") ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allowed = user?.role === "floor" || user?.role === "admin";
  const events = useQuery({
    queryKey: ["tablet-events"],
    enabled: allowed,
    queryFn: () => api.get<TournamentSummary[]>("/tournaments"),
  });
  const live = useQuery({
    queryKey: ["tablet-live", event],
    enabled: allowed && !!event,
    queryFn: () => api.get<LiveView>(`/live/${event}`),
  });
  if (status === "loading") return <Loading />;
  if (!allowed)
    return (
      <Card>
        <h1 className="text-xl mb-4">Настройка планшета</h1>
        <Link className="btn" to="/login?next=/dealer/setup">
          Войти как флор или администратор
        </Link>
      </Card>
    );
  return (
    <Card>
      <h1 className="text-2xl mb-5">Настройка планшета</h1>
      <div className="max-w-md space-y-4">
        <label className="label">
          Вечер
          <select
            className="field w-full"
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              setTable(1);
            }}
          >
            <option value="">Выберите вечер</option>
            {events.data
              ?.filter(
                (t) => t.status !== "finished" && t.status !== "cancelled",
              )
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </label>
        <label className="label">
          Стол
          <select
            className="field w-full"
            value={table}
            onChange={(e) => setTable(Number(e.target.value))}
          >
            {live.data?.state?.tables.map((t) => (
              <option key={t.number} value={t.number}>
                Стол {t.number}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <Button
          disabled={busy || !live.data?.state}
          onClick={() => {
            setBusy(true);
            void api
              .post("/dealer/bind", { tournamentId: event, tableNumber: table })
              .then(() => location.assign("/dealer"))
              .catch((e) => {
                setError(e.message);
                setBusy(false);
              });
          }}
        >
          Закрепить планшет
        </Button>
      </div>
    </Card>
  );
}
