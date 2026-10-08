import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ClubMenuItem,
  PrizeWallet,
  TournamentDetail,
  LiveOrder,
} from "@poker/contracts";
import { usePlayers } from "../lib/queries";
import { playerLabel } from "../lib/format";
import { api } from "../lib/api";
import { Button, Card, ErrorState } from "../components/ui";

function useDeskRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      "live",
      "account",
      "live-events",
      "host-detail",
      "prizes",
      "tournaments",
      "host-cash",
    ])
      void qc.invalidateQueries({ queryKey: [key] });
  };
}
export function HostAdmission({
  id,
  arrivedIds,
  menu,
  allowFinish = true,
}: {
  id: string;
  arrivedIds: string[];
  menu: ClubMenuItem[];
  allowFinish?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<"cash" | "terminal">("cash");
  const refresh = useDeskRefresh();
  const directory = usePlayers(search, search.trim().length >= 2);
  const detail = useQuery({
    queryKey: ["host-detail", id],
    queryFn: () => api.get<TournamentDetail>(`/tournaments/${id}`),
    refetchInterval: 10000,
  });
  const entry = menu.find((m) => m.kind === "entry" && m.isFixed);
  const enter = useMutation({
    mutationFn: async (userId: string) => {
      if (
        !detail.data?.registrations.some(
          (r) => r.user.id === userId && r.status === "registered",
        )
      )
        await api.post(`/tournaments/${id}/register`, {
          userId,
          source: "admin",
        });
      await api.post(`/tournaments/${id}/payments`, {
        userId,
        kind: "entry",
        method,
        menuItemId: entry?.id,
        amountRub: entry?.priceRub ?? 500,
      });
    },
    onSuccess: refresh,
  });
  const finish = useMutation({
    mutationFn: () => api.post(`/tournaments/${id}/finish`),
    onSuccess: refresh,
  });
  const candidates =
    search.trim().length >= 2
      ? (directory.data?.items ?? [])
          .filter((u) => u.status !== "blocked")
          .map((u) => ({ id: u.id, name: playerLabel(u) }))
      : (detail.data?.registrations ?? [])
          .filter((r) => r.status === "registered")
          .map((r) => ({ id: r.user.id, name: playerLabel(r.user) }));
  return (
    <Card className="host-admission">
      <div className="flex flex-wrap justify-between gap-3 mb-3">
        <h2 className="text-xl font-semibold">Приём игроков</h2>
        {allowFinish && <Button
          variant="secondary"
          disabled={finish.isPending}
          onClick={() => {
            if (
              confirm(
                "Завершить вечер и начислить рейтинг? Результаты можно вернуть в работу в админке.",
              )
            )
              finish.mutate();
          }}
        >
          Завершить вечер
        </Button>}
      </div>
      <input
        className="field"
        type="search"
        placeholder="Найти игрока клуба"
        aria-label="Найти игрока для входа"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select className="field host-entry-method" aria-label="Оплата входа" value={method} onChange={e => setMethod(e.target.value as "cash" | "terminal")}>
        <option value="cash">Наличные</option><option value="terminal">Карта</option>
      </select>
      <div className="max-h-64 overflow-y-auto mt-3 divide-y divide-white/10">
        {candidates
          .filter((u) => !arrivedIds.includes(u.id))
          .map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0 break-words">{u.name}</span>
              <Button
                disabled={enter.isPending || !entry}
                onClick={() => {
                  if (
                    confirm(
                      `Принять оплату входа ${entry?.priceRub ?? 0} ₽ (${method === "cash" ? "наличные" : "карта"}) от ${u.name} и посадить игрока?`,
                    )
                  )
                    enter.mutate(u.id);
                }}
              >
                Вход {entry?.priceRub} ₽
              </Button>
            </div>
          ))}
      </div>
      {enter.isError && <ErrorState error={enter.error} />}{" "}
      {finish.isError && <ErrorState error={finish.error} />}{" "}
      {detail.isError && <ErrorState error={detail.error} />}
    </Card>
  );
}

export function HostPlayerControls({
  id,
  userId,
  menu,
  compact = false,
  pendingOrders = [],
}: {
  id: string;
  userId: string;
  menu: ClubMenuItem[];
  compact?: boolean;
  pendingOrders?: LiveOrder[];
}) {
  const refresh = useDeskRefresh();
  const [search, setSearch] = useState("");
  const [itemId, setItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [purpose, setPurpose] = useState<"purchase" | "prize">("purchase");
  const detail = useQuery({
    queryKey: ["host-detail", id],
    queryFn: () => api.get<TournamentDetail>(`/tournaments/${id}`),
    refetchInterval: 10000,
  });
  const wallet = useQuery({
    queryKey: ["prizes", userId],
    queryFn: () => api.get<PrizeWallet>(`/prizes/user/${userId}`),
    refetchInterval: 10000,
  });
  const issue = useMutation({
    mutationFn: async () => {
      if (purpose === "prize")
        return api.post("/prizes", {
          userId,
          menuItemId: itemId,
          quantity,
          tournamentId: id,
        });
      const requestId = crypto.randomUUID();
      await api.post("/live/orders", {
        userId,
        menuItemId: itemId,
        quantity,
        tournamentId: id,
        requestId,
      });
      return api.post(`/live/${id}/orders/${requestId}/fulfil`, {});
    },
    onSuccess: refresh,
  });
  const prize = useMutation({
    mutationFn: ({ prizeId, revoke }: { prizeId: string; revoke: boolean }) =>
      revoke
        ? api.delete(`/prizes/${prizeId}`)
        : api.post(`/prizes/${prizeId}/redeem`, { tournamentId: id }),
    onSuccess: refresh,
  });
  const place = useMutation({
    mutationFn: (n: number | null) =>
      api.post(`/live/${id}/actions`, {
        type: "correctPlace",
        userId,
        place: n,
        expected: current,
        swapUserId: detail.data?.players?.find(
          (p) => p.user.id !== userId && p.place === n,
        )?.user.id,
        confirm: true,
      }),
    onSuccess: refresh,
  });
  const current =
    detail.data?.players?.find((p) => p.user.id === userId)?.place ?? null;
  const occupied = new Set(
    (detail.data?.players ?? [])
      .filter((p) => p.user.id !== userId)
      .map((p) => p.place),
  );
  const chosen = menu.find((m) => m.id === itemId);
  const rows = menu.filter(
    (m) =>
      m.kind !== "entry" &&
      m.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className={compact ? "host-issue space-y-4" : "mt-5 border-t border-white/10 pt-5 space-y-4"}>
      {!compact && <h3 className="text-lg font-semibold">Касса и призы</h3>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={purpose === "purchase" ? "primary" : "secondary"}
          onClick={() => setPurpose("purchase")}
        >
          Покупка
        </Button>
        <Button
          variant={purpose === "prize" ? "primary" : "secondary"}
          onClick={() => setPurpose("prize")}
        >
          Начислить приз
        </Button>
      </div>
      <input
        className="field"
        type="search"
        aria-label="Поиск по меню"
        placeholder="Поиск по меню"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
        {rows.map((m) => (
          <button
            key={m.id}
            disabled={m.kind === "rebuy" && pendingOrders.some(o => o.userId === userId && o.menuItemId === m.id && o.state === "pending")}
            onClick={() => setItem(m.id)}
            className={`rounded-lg border p-3 text-left ${m.id === itemId ? "border-gold-400 bg-gold-500/10" : "border-white/10 bg-felt-950"}`}
          >
            <strong className="block text-sm break-words">{m.title}</strong>
            <span className="text-sm text-stone-400">
              {purpose === "purchase" ? `${m.priceRub} ₽` : "Приз"}
            </span>
          </button>
        ))}
      </div>
      {chosen && (
        <div className="flex flex-wrap items-center gap-2">
          <strong className="w-full">{chosen.title}</strong>
          {[1, 2, 3].map((n) => (
            <Button
              key={n}
              variant={quantity === n ? "primary" : "secondary"}
              onClick={() => setQuantity(n)}
            >
              x{n}
            </Button>
          ))}
          <Button
            disabled={issue.isPending}
            onClick={() => {
              if (
                confirm(
                  `${purpose === "prize" ? "Начислить приз" : "Выдать покупку"}: ${chosen.title} x${quantity}?`,
                )
              )
                issue.mutate();
            }}
          >
            {purpose === "prize" ? "Начислить" : "Выдать и записать"}
          </Button>
        </div>
      )}
      {issue.isError && <ErrorState error={issue.error} />}
      {(wallet.data?.lines.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold">Доступные призы</h4>
          {wallet.data!.lines.map((line) => {
            const unit = wallet.data!.active.find(
              (p) => p.title === line.title,
            )!;
            return (
              <div
                key={line.title}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-felt-950 p-3"
              >
                <span className="flex-1">
                  {line.title} x{line.count}
                </span>
                <Button
                  disabled={prize.isPending}
                  onClick={() => {
                    if (confirm(`Использовать один приз «${line.title}»?`))
                      prize.mutate({ prizeId: unit.id, revoke: false });
                  }}
                >
                  Использовать 1
                </Button>
                <Button
                  variant="ghost"
                  disabled={prize.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Забрать один ошибочно начисленный приз «${line.title}»?`,
                      )
                    )
                      prize.mutate({ prizeId: unit.id, revoke: true });
                  }}
                >
                  Забрать 1
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {prize.isError && <ErrorState error={prize.error} />}
      <label className="label">
        Призовое место
        <select
          className="field mt-1"
          aria-label="Призовое место"
          value={current ?? ""}
          disabled={place.isPending}
          onChange={(e) => {
            const next = e.target.value ? Number(e.target.value) : null;
            if (next === current) return;
            const other = detail.data?.players?.find(
              (p) => p.user.id !== userId && p.place === next,
            );
            const playerName =
              detail.data?.players?.find((p) => p.user.id === userId)?.user
                .nickname ?? "Игрок";
            if (
              confirm(
                `${playerName}: ${current ?? "без места"} -> ${next ?? "без места"}${other ? `\nОбмен с ${other.user.nickname}: ${other.place} -> ${current ?? "без места"}` : ""}?`,
              )
            )
              place.mutate(next);
          }}
        >
          <option value="">Не назначено</option>
          {Array.from(
            { length: detail.data?.paidPlaces ?? 9 },
            (_, i) => i + 1,
          ).map((n) => (
            <option key={n} value={n}>
              {n}
              {occupied.has(n) ? " - занято" : ""}
            </option>
          ))}
        </select>
      </label>
      {place.isError && <ErrorState error={place.error} />}
    </section>
  );
}
