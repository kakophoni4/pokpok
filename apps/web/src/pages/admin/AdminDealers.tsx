import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Button, Card, ErrorState } from "../../components/ui";
type Policy = { stepMinutes: number; mode: string };
export function AdminDealers() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const staff = useQuery({
    queryKey: ["live-staff"],
    queryFn: () =>
      api.get<{ id: string; name: string; role: string }[]>("/live/staff"),
  });
  const policy = useQuery({
    queryKey: ["dealer-payroll"],
    queryFn: () => api.get<Policy>("/dealer/payroll"),
  });
  const change = useMutation({
    mutationFn: (value: Policy) => api.post("/dealer/payroll", value),
    onSuccess: () => {
      void policy.refetch();
    },
  });
  const reset = useMutation({
    mutationFn: () => api.post("/dealer/password", { userId, password }),
    onSuccess: () => {
      setPassword("");
      setSaved(true);
    },
  });
  const hours = useQuery({
    queryKey: ["dealer-hours", from, to],
    queryFn: () =>
      api.get<
        {
          id: string;
          userId: string;
          nickname: string;
          hours: number;
          active: boolean;
        }[]
      >(
        `/dealer/hours?from=${encodeURIComponent(new Date(from + "T00:00:00+04:00").toISOString())}&to=${encodeURIComponent(new Date(new Date(to + "T00:00:00+04:00").getTime() + 86400000).toISOString())}`,
      ),
    enabled: !!from && !!to,
    refetchInterval: 30000,
  });
  const totals = new Map<string, { nickname: string; hours: number }>();
  for (const row of hours.data ?? []) {
    const value = totals.get(row.userId) ?? {
      nickname: row.nickname,
      hours: 0,
    };
    value.hours += row.hours;
    totals.set(row.userId, value);
  }
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-xl font-semibold mb-4">Доступ дилера</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="label">
            Дилер
            <select
              className="field w-full"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setSaved(false);
              }}
            >
              <option value="">Выберите дилера</option>
              {staff.data
                ?.filter((row) => row.role === "dealer")
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="label">
            Новый пароль
            <input
              className="field w-full"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <Button
            disabled={!userId || password.length < 8 || reset.isPending}
            onClick={() => reset.mutate()}
          >
            Сохранить пароль
          </Button>
        </div>
        {saved && <p className="mt-3 text-gold-400">Пароль сохранён</p>}
        {reset.error && <ErrorState error={reset.error} />}
      </Card>
      <Card>
        <h2 className="text-xl font-semibold mb-4">Часы дилеров</h2>
        <div className="grid sm:grid-cols-4 gap-3 mb-5">
          <label className="label">
            С
            <input
              className="field w-full"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="label">
            По
            <input
              className="field w-full"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="label">
            Шаг округления
            <select
              className="field w-full"
              value={policy.data?.stepMinutes ?? 30}
              disabled={change.isPending}
              onChange={(e) =>
                change.mutate({
                  stepMinutes: Number(e.target.value),
                  mode: policy.data?.mode ?? "nearest",
                })
              }
            >
              <option value={30}>30 минут</option>
              <option value={60}>1 час</option>
              <option value={90}>1,5 часа</option>
            </select>
          </label>
          <label className="label">
            Округление
            <select
              className="field w-full"
              value={policy.data?.mode ?? "nearest"}
              disabled={change.isPending}
              onChange={(e) =>
                change.mutate({
                  stepMinutes: policy.data?.stepMinutes ?? 30,
                  mode: e.target.value,
                })
              }
            >
              <option value="nearest">До ближайшего</option>
              <option value="up">Вверх</option>
              <option value="down">Вниз</option>
            </select>
          </label>
        </div>
        <table className="w-full text-left">
          <thead className="text-white/60">
            <tr>
              <th className="py-3">Дилер</th>
              <th className="py-3 text-right">Часы</th>
            </tr>
          </thead>
          <tbody>
            {[...totals].map(([id, row]) => (
              <tr key={id} className="border-t border-white/10">
                <td className="py-3">{row.nickname}</td>
                <td className="py-3 text-right tabular-nums">
                  {row.hours.toLocaleString("ru-RU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hours.error && <ErrorState error={hours.error} />}
        {change.error && <ErrorState error={change.error} />}
      </Card>
    </div>
  );
}
