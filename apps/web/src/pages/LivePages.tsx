import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { DEFAULT_LIVE_CONFIG } from "@poker/contracts";
import type {
  AccountView,
  BlindLevel,
  ClubMenuItem,
  LiveAction,
  LiveConfig,
  LiveView,
  TournamentSummary,
} from "@poker/contracts";
import { useAuth } from "../auth/auth-context";
import { api } from "../lib/api";
import { Button, Card, ErrorState, Loading, Tabs } from "../components/ui";
import { HostAdmission, HostPlayerControls } from "./LiveHostControls";

const money = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
const time = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
const defaults: LiveConfig = DEFAULT_LIVE_CONFIG;
type StaffRow = { id: string; name: string; role: string };
type PlayerLive = {
  tournamentId: string;
  title: string;
  player: {
    state: string;
    table: number | null;
    seat: number | null;
    wantsMove: boolean;
  };
  orders: { id: string; title: string; quantity: number; state: string }[];
  bounties: {
    id: string;
    mode: string;
    voided: boolean;
    award?: { title: string };
  }[];
};

export function LiveStaffPage({ dealer = false }: { dealer?: boolean }) {
  const { user, status, can } = useAuth();
  const [id, setId] = useState("");
  const [completed, setCompleted] = useState(false);
  const qc = useQueryClient();
  const reopen = useMutation({
    mutationFn: (target: string) =>
      api.post(`/tournaments/${target}/reopen`, {}),
    onSuccess: () => {
      setCompleted(false);
      void qc.invalidateQueries({ queryKey: ["live-events"] });
      void qc.invalidateQueries({ queryKey: ["live"] });
    },
  });
  const events = useQuery({
    queryKey: ["live-events"],
    queryFn: () => api.get<TournamentSummary[]>("/tournaments?scope=all"),
    enabled: can("dealer"),
    refetchInterval: 15000,
  });
  if (status === "loading") return <Loading />;
  if (!can(dealer ? "dealer" : "floor"))
    return <Navigate to="/login" replace />;
  const rows = (events.data ?? []).filter((t) =>
    completed
      ? t.status === "finished"
      : !["finished", "cancelled", "draft"].includes(t.status),
  );
  const selected = rows.some((r) => r.id === id) ? id : (rows[0]?.id ?? "");
  return (
    <div className="live-workspace space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {dealer ? "Стол дилера" : "Управление вечером"}
        </h1>
        {can("hostess") && (
          <Link to="/admin" className="text-gold-400">
            Админка
          </Link>
        )}
      </div>
      <div className="event-pickerbar">
        {!dealer && (
          <Tabs
            value={completed ? "past" : "current"}
            onChange={(value) => setCompleted(value === "past")}
            options={[
              { value: "current", label: "Текущие" },
              { value: "past", label: "Завершённые" },
            ]}
          />
        )}
        <select
          className="field w-full"
          value={selected}
          onChange={(e) => setId(e.target.value)}
          aria-label="Турнир"
        >
          <option value="">Выберите турнир</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </div>
      {!dealer && can("floor") && (
        <details className="hand-day-settings">
          <summary>Рука дня</summary>
          <HandOfDayEditor />
        </details>
      )}
      {selected ? (
        <>
          {completed && can("hostess") && (
            <Button
              disabled={reopen.isPending}
              onClick={() => {
                setId(selected);
                if (
                  confirm(
                    "Вернуть вечер в работу и отменить начисление рейтинга за результат?",
                  )
                )
                  reopen.mutate(selected);
              }}
            >
              Вернуть в работу
            </Button>
          )}
          {reopen.isError && <ErrorState error={reopen.error} />}
          <fieldset disabled={completed} className="min-w-0">
            <LiveDesk
              key={selected}
              id={selected}
              dealer={dealer}
              actorId={user!.id}
            />
          </fieldset>
        </>
      ) : (
        <p>Нет текущих турниров</p>
      )}
    </div>
  );
}

export function LiveDesk({
  id,
  dealer = false,
  actorId,
}: {
  id: string;
  dealer?: boolean;
  actorId: string;
}) {
  const { can, user } = useAuth();
  const isFloor = !dealer && user?.role === "floor";
  const gameOperator = dealer || isFloor;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [activeTable, setTable] = useState(0);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const view = useQuery({
    queryKey: ["live", id],
    queryFn: () => api.get<LiveView>(`/live/${id}`),
    refetchInterval: 5000,
  });
  const menu = useQuery({
    queryKey: ["live-menu"],
    queryFn: () => api.get<ClubMenuItem[]>("/club/menu-public"),
  });
  const staff = useQuery({
    queryKey: ["live-staff"],
    queryFn: () => api.get<StaffRow[]>("/live/staff"),
    enabled: !dealer,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["live"] });
    void qc.invalidateQueries({ queryKey: ["account"] });
    void qc.invalidateQueries({ queryKey: ["tournaments"] });
  };
  const action = useMutation({
    mutationFn: (a: LiveAction) => api.post(`/live/${id}/actions`, a),
    onSuccess: () => {
      setError("");
      refresh();
    },
    onError: (e) => setError(e.message),
  });
  const order = useMutation({
    mutationFn: async ({
      userId,
      item,
      quantity,
    }: {
      userId: string;
      item: ClubMenuItem;
      quantity: number;
    }) => {
      const requestId = crypto.randomUUID();
      await api.post("/live/orders", {
        tournamentId: id,
        userId,
        menuItemId: item.id,
        quantity,
        requestId,
      });
      await api.post(`/live/${id}/orders/${requestId}/fulfil`);
    },
    onSuccess: refresh,
    onError: (e) => {
      setError(e.message);
      refresh();
    },
  });
  if (view.isPending) return <Loading />;
  if (view.isError) return <ErrorState error={view.error} />;
  const v = view.data!,
    s = v.state;
  if (!s)
    return can("admin") ? (
      <LiveSetup id={id} saved={refresh} />
    ) : (
      <Card>Администратор ещё не настроил столы и уровни.</Card>
    );
  if (setup)
    return (
      <div>
        <Button onClick={() => setSetup(false)}>Вернуться к вечеру</Button>
        <LiveSetup
          id={id}
          initialConfig={s.config}
          saved={() => {
            setSetup(false);
            refresh();
          }}
        />
      </div>
    );
  const name = (userId: string) =>
    v.players.find((p) => p.id === userId)?.name ?? "Игрок";
  const tables = s.tables.filter(
    (t) => t.open && (!dealer || t.dealerId === actorId),
  );
  const table = tables.some((t) => t.number === activeTable)
    ? activeTable
    : (tables[0]?.number ?? 0);
  const seats = s.seats.filter(
    (p) =>
      (dealer
        ? p.state !== "playing" && p.lastTable === table
        : !activeTable ||
          (p.state === "playing" ? p.table : p.lastTable) === activeTable) &&
      name(p.userId).toLowerCase().includes(search.toLowerCase()),
  );
  const people = s.seats.filter(
    (p) => p.state === "playing" && p.table === table,
  );
  const p = s.seats.find((p) => p.userId === selected);
  const occupied = (n: number) =>
    s.seats.filter((p) => p.state === "playing" && p.table === n).length;
  const targets = s.tables.filter(
    (t) =>
      t.open &&
      t.number !== table &&
      occupied(t.number) < s.config.seatsPerTable,
  );
  return (
    <div className="live-workspace space-y-5">
      {!dealer && can("admin") && s.seats.length === 0 && (
        <Button onClick={() => setSetup(true)}>
          Настроить уровни и формат
        </Button>
      )}
      {error && (
        <div role="alert" className="rounded-xl bg-red-950 p-3 text-red-200">
          {error}
          <button className="ml-3 underline" onClick={() => setError("")}>
            Закрыть
          </button>
        </div>
      )}
      {!dealer && can("floor") && (
        <div className="clock-workbench">
          <ClockPanel view={v} compact />
          <Card className="clock-actions">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["start", "Запустить"],
                  ["pause", "Пауза"],
                  ["next", "Следующий уровень"],
                  ["previous", "Предыдущий уровень"],
                  [
                    "skipBreak",
                    v.clock?.level.break
                      ? "Закончить перерыв"
                      : "Пропустить перерыв",
                  ],
                ] as const
              ).map(([command, label]) => (
                <Button
                  key={command}
                  variant={command === "start" ? "primary" : "secondary"}
                  disabled={action.isPending}
                  onClick={() => {
                    if (
                      (command === "previous" || command === "skipBreak") &&
                      !confirm(`${label}?`)
                    )
                      return;
                    action.mutate({ type: "clock", command });
                  }}
                >
                  {label}
                </Button>
              ))}
              <LevelEditor
                view={v}
                pending={action.isPending}
                save={(index, level) =>
                  action.mutate({ type: "editLevel", index, level })
                }
              />
              {can("admin") && !dealer && v.displayToken && (
                <details className="w-full text-sm text-stone-300">
                  <summary className="cursor-pointer">
                    Подключение телевизора
                  </summary>
                  <a
                    className="text-gold-400 p-2"
                    href={`/display/${id}?token=${encodeURIComponent(v.displayToken)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть экран зала
                  </a>
                </details>
              )}
            </div>
          </Card>
        </div>
      )}
      <div className="desk-overview">
        {!dealer && (
          <Card className="table-control-panel">
            <h2 className="font-semibold mb-3">Столы</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {s.tables.map((t) => (
                <div
                  key={t.number}
                  className="table-control-item flex flex-wrap items-center gap-2"
                >
                  <span>
                    Стол {t.number} · {occupied(t.number)} /{" "}
                    {s.config.seatsPerTable}
                  </span>
                  <span className="text-white/70">
                    {staff.data?.find((p) => p.id === t.dealerId)?.name ??
                      "Без дилера"}
                  </span>
                  <Link
                    className="btn"
                    to={`/dealer/setup?event=${id}&table=${t.number}`}
                  >
                    Настроить планшет
                  </Link>
                  {occupied(t.number) === 0 && (
                    <Button
                      variant="secondary"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({
                          type: "openTable",
                          table: t.number,
                          open: !t.open,
                        })
                      }
                    >
                      {t.open ? "В резерв" : "Открыть"}
                    </Button>
                  )}
                  {(t.breakRequested ||
                    (isFloor && t.open && occupied(t.number) > 0)) && (
                    <Button
                      variant="secondary"
                      disabled={action.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Расформировать стол ${t.number}? Все игроки будут пересажены. Подтвердите, что текущая раздача закончена.`,
                          )
                        )
                          action.mutate({
                            type: "breakApprove",
                            table: t.number,
                            confirm: true,
                          });
                      }}
                    >
                      Расформировать
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
        {!dealer &&
          can("hostess") &&
          s.alerts.some((a) => !a.acknowledgedBy) && (
            <Card className="desk-alerts">
              <h2 className="font-semibold mb-3">Требуют внимания</h2>
              <div className="max-h-64 overflow-y-auto">
                {s.alerts
                  .filter((a) => !a.acknowledgedBy)
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-wrap justify-between gap-2 border-b border-white/10 py-3"
                    >
                      <span>
                        {name(a.userId)} - {a.text}
                      </span>
                      <Button
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({ type: "ack", alertId: a.id })
                        }
                      >
                        Принято
                      </Button>
                    </div>
                  ))}
              </div>
            </Card>
          )}
        {!dealer && can("hostess") && (
          <HostAdmission
            id={id}
            arrivedIds={s.seats.map((p) => p.userId)}
            menu={menu.data ?? []}
          />
        )}
      </div>
      <div className={!dealer && p ? "desk-body has-selection" : "desk-body"}>
        <div className="desk-roster space-y-3">
          <div className="table-filter flex flex-wrap gap-2">
            {!dealer && (
              <Button
                variant={activeTable === 0 ? "primary" : "secondary"}
                onClick={() => setTable(0)}
              >
                Все игроки
              </Button>
            )}
            {tables.map((t) => (
              <Button
                variant={
                  (dealer ? table : activeTable) === t.number
                    ? "primary"
                    : "secondary"
                }
                key={t.number}
                onClick={() => setTable(t.number)}
              >
                {dealer ? "Стол" : `Стол ${t.number}`} ({occupied(t.number)})
              </Button>
            ))}
          </div>
          {dealer && table > 0 && (
            <Card>
              <DealerSeatMap
                view={v}
                players={people}
                count={s.config.seatsPerTable}
                name={name}
                pending={action.isPending}
                selected={selected}
                onSelect={setSelected}
                onMove={(userId, seat, expectedSeat, expectedOccupant) =>
                  action.mutate({
                    type: "rebox",
                    userId,
                    seat,
                    expectedSeat,
                    expectedOccupant,
                  })
                }
              />
              <Button
                className="mt-4"
                disabled={action.isPending}
                onClick={() => action.mutate({ type: "breakRequest", table })}
              >
                Запросить расформирование
              </Button>
            </Card>
          )}
          {!dealer && (
            <input
              className="field w-full"
              placeholder="Поиск игрока"
              aria-label="Поиск игрока"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <div className="live-player-list space-y-2 max-h-72 overflow-y-auto">
            {seats.map((p) => (
              <button
                key={p.userId}
                aria-pressed={selected === p.userId}
                className="flex w-full flex-wrap justify-between gap-2 rounded-xl border border-white/10 p-4 text-left"
                onClick={() => setSelected(p.userId)}
              >
                <span>
                  {name(p.userId)} {p.wantsMove ? "· хочет пересесть" : ""}
                </span>
                <span>
                  {p.state === "playing"
                    ? p.table
                      ? `Стол ${p.table}, место ${p.seat}`
                      : "Ожидает посадку"
                    : p.state === "busted"
                      ? "Без стека"
                      : "Завершил игру"}
                  {!dealer &&
                    v.players.find((player) => player.id === p.userId)?.place &&
                    ` · ${v.players.find((player) => player.id === p.userId)?.place} место`}
                  {!dealer &&
                    can("hostess") &&
                    ` · ${money(v.balances.find((b) => b.userId === p.userId)?.dueRub ?? 0)}`}
                </span>
              </button>
            ))}
          </div>
          {dealer &&
            Date.parse(
              s.tables.find((t) => t.number === table)?.balanceDeferredUntil ??
                "1970-01-01",
            ) <= Date.now() &&
            targets.some((t) => occupied(table) - occupied(t.number) >= 2) && (
              <Card>
                <h2>Предложение балансировки</h2>

                <div className="flex flex-wrap gap-2 my-3">
                  {people.map((person) => (
                    <Button
                      key={person.userId}
                      variant="secondary"
                      onClick={() => setSelected(person.userId)}
                    >
                      {name(person.userId)}
                    </Button>
                  ))}
                </div>
                <Button
                  onClick={() => action.mutate({ type: "deferBalance", table })}
                >
                  Не пересаживать сейчас
                </Button>
              </Card>
            )}
        </div>
        {p && (
          <Card
            className={dealer ? "dealer-player-panel" : "desk-player-detail"}
          >
            <div className="flex justify-between gap-2">
              <h2 className="text-xl font-semibold">{name(p.userId)}</h2>
              <Button onClick={() => setSelected("")}>Закрыть</Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {gameOperator && (
                <>
                  {(menu.data ?? [])
                    .filter((i) => i.kind === "rebuy" && i.isFixed)
                    .slice(0, 1)
                    .flatMap((item) =>
                      [1, 2, 3].map((quantity) => (
                        <Button
                          key={quantity}
                          disabled={order.isPending}
                          onClick={() =>
                            order.mutate({ userId: p.userId, item, quantity })
                          }
                        >
                          Ребай x{quantity}
                        </Button>
                      )),
                    )}
                  <Button
                    disabled={action.isPending || p.state !== "playing"}
                    onClick={() =>
                      action.mutate({ type: "bust", userId: p.userId })
                    }
                  >
                    Без стека
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={action.isPending || p.state === "eliminated"}
                    onClick={() => {
                      if (
                        confirm(
                          `${name(p.userId)} завершил игру и не будет делать ребай?`,
                        )
                      )
                        action.mutate({
                          type: "bust",
                          userId: p.userId,
                          final: true,
                        });
                    }}
                  >
                    Завершил игру
                  </Button>
                </>
              )}
              {!dealer && p.state !== "playing" && (
                <Button
                  onClick={() => {
                    const n = prompt("Стек для исправления ошибочного вылета");
                    if (
                      n &&
                      Number(n) > 0 &&
                      confirm(
                        `Вернуть ${name(p.userId)} в игру со стеком ${Number(n)}? Призовое место будет снято.`,
                      )
                    )
                      action.mutate({
                        type: "restore",
                        userId: p.userId,
                        stack: Number(n),
                      });
                  }}
                >
                  Исправить вылет
                </Button>
              )}
              {gameOperator && (
                <>
                  <StackEditor
                    key={p.userId}
                    stack={p.stack}
                    busy={action.isPending}
                    onSave={(stack) =>
                      action.mutate({ type: "stack", userId: p.userId, stack })
                    }
                  />
                  <Button
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        type: "wantMove",
                        userId: p.userId,
                        wanted: !p.wantsMove,
                      })
                    }
                  >
                    {p.wantsMove
                      ? "Отменить желание пересесть"
                      : "Хочет пересесть"}
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {s.tables
                .filter(
                  (t) =>
                    t.open &&
                    t.number !== p.table &&
                    occupied(t.number) < s.config.seatsPerTable,
                )
                .map((t) => (
                  <Button
                    key={t.number}
                    disabled={action.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Пересадить ${name(p.userId)} на стол ${t.number} между раздачами?${
                            isFloor
                              ? `\nПосле пересадки: ${s.tables
                                  .filter(
                                    (table) => table.open && table.dealerId,
                                  )
                                  .map(
                                    (table) =>
                                      `${table.number}: ${occupied(table.number) + (table.number === t.number ? 1 : 0) - (table.number === p.table ? 1 : 0)}`,
                                  )
                                  .join(" · ")}`
                              : ""
                          }`,
                        )
                      )
                        action.mutate({
                          type: "move",
                          userId: p.userId,
                          targetTable: t.number,
                        });
                    }}
                  >
                    На стол {t.number}
                  </Button>
                ))}
              {(p.wantsMove || isFloor) &&
                s.seats
                  .filter(
                    (q) =>
                      (q.wantsMove || isFloor) &&
                      q.table !== p.table &&
                      q.table != null &&
                      q.state === "playing",
                  )
                  .map((q) => (
                    <Button
                      key={q.userId}
                      disabled={action.isPending}
                      onClick={() => {
                        if (
                          confirm("Подтвердить обмен местами между раздачами?")
                        )
                          action.mutate({
                            type: "move",
                            userId: p.userId,
                            targetTable: q.table!,
                            swapUserId: q.userId,
                          });
                      }}
                    >
                      Обмен с {name(q.userId)}
                    </Button>
                  ))}
            </div>
            <HandAwards id={id} userId={p.userId} />
            {isFloor && (
              <label className="label mt-4">
                Призовое место
                <select
                  className="field w-full"
                  value={
                    v.players.find((player) => player.id === p.userId)?.place ??
                    ""
                  }
                  onChange={(e) => {
                    const expected =
                      v.players.find((player) => player.id === p.userId)
                        ?.place ?? null;
                    const next = e.target.value ? Number(e.target.value) : null;
                    const other = next
                      ? v.players.find(
                          (player) =>
                            player.place === next && player.id !== p.userId,
                        )
                      : null;
                    if (
                      confirm(
                        `${name(p.userId)}: ${expected ?? "без места"} -> ${next ?? "без места"}${other ? `\nОбмен с ${other.name}: ${next} -> ${expected ?? "без места"}` : ""}?`,
                      )
                    )
                      action.mutate({
                        type: "correctPlace",
                        userId: p.userId,
                        place: next,
                        expected,
                        swapUserId: other?.id,
                        confirm: true,
                      });
                  }}
                >
                  <option value="">Без места</option>
                  {Array.from(
                    { length: v.paidPlaces ?? 9 },
                    (_, index) => index + 1,
                  ).map((place) => (
                    <option value={place} key={place}>
                      {place}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!dealer && can("hostess") && (
              <HostPlayerControls
                key={p.userId}
                id={id}
                userId={p.userId}
                menu={menu.data ?? []}
              />
            )}
            {s.config.bountyMode !== "none" && (
              <div className="mt-4">
                <label className="label">Баунти за игрока</label>
                <select
                  className="field w-full"
                  value=""
                  onChange={(e) => {
                    if (e.target.value)
                      action.mutate({
                        type: "bounty",
                        userId: p.userId,
                        victimId: e.target.value,
                      });
                  }}
                >
                  <option value="">Выбрать выбывшего</option>
                  {s.seats
                    .filter(
                      (q) => q.state !== "playing" && q.userId !== p.userId,
                    )
                    .map((q) => (
                      <option key={q.userId} value={q.userId}>
                        {name(q.userId)}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {!dealer && can("hostess") && (
              <AccountPanel userId={p.userId} tournamentId={id} />
            )}
          </Card>
        )}
      </div>
      <PendingOrders
        id={id}
        orders={s.orders.filter((o) => o.state === "pending")}
        name={name}
        refresh={refresh}
        onError={setError}
      />
      {!dealer && can("hostess") && (
        <LotteryDesk
          id={id}
          bounties={s.bounties}
          name={name}
          menu={menu.data ?? []}
          action={(a) => action.mutate(a)}
          busy={action.isPending}
        />
      )}
    </div>
  );
}

function HandOfDayEditor() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["hand-of-day"],
    queryFn: () => api.get<{ hand: string | null }>("/club/hand-of-day"),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.patch("/club/hand-of-day", {
        hand: (draft ?? query.data?.hand ?? "").trim() || null,
        expected: query.data?.hand ?? null,
      }),
    onSuccess: () => {
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["hand-of-day"] });
      void qc.invalidateQueries({ queryKey: ["live"] });
    },
    onError: () => {
      void query.refetch();
    },
  });
  return (
    <div className="w-full border-t border-white/10 pt-4 mt-2">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="text-sm">
          Рука дня
          <input
            className="field mt-1"
            maxLength={120}
            placeholder="A♠ K♠"
            value={draft ?? query.data?.hand ?? ""}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <Button
          type="submit"
          disabled={query.isPending || save.isPending || draft === null}
        >
          Сохранить
        </Button>
      </form>
      {save.isSuccess && (
        <p role="status" className="text-sm text-gold-400 mt-2">
          Рука дня сохранена
        </p>
      )}
      {(query.isError || save.isError) && (
        <ErrorState error={query.error ?? save.error} />
      )}
    </div>
  );
}

function LevelEditor({
  view,
  pending,
  save,
}: {
  view: LiveView;
  pending: boolean;
  save: (index: number, level: BlindLevel) => void;
}) {
  const levels = view.state?.config.levels ?? [];
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(view.clock?.index ?? 0);
  const [draft, setDraft] = useState<BlindLevel | null>(null);
  const level = draft ?? levels[index];
  if (!level) return null;
  return (
    <div className="w-full">
      <Button variant="secondary" onClick={() => setOpen(!open)}>
        Изменить блайнды
      </Button>
      {open && (
        <form
          className="flex flex-wrap items-end gap-3 mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirm("Сохранить изменение уровня?")) {
              save(index, level);
              setOpen(false);
              setDraft(null);
            }
          }}
        >
          <label className="text-sm">
            Уровень
            <select
              className="field mt-1"
              value={index}
              onChange={(event) => {
                setIndex(Number(event.target.value));
                setDraft(null);
              }}
            >
              {levels.map((item, i) => (
                <option value={i} key={i}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          {!level.break && (
            <>
              <label className="text-sm">
                Малый
                <input
                  className="field mt-1 w-28"
                  type="number"
                  min={0}
                  required
                  value={level.small}
                  onChange={(event) =>
                    setDraft({ ...level, small: Number(event.target.value) })
                  }
                />
              </label>
              <label className="text-sm">
                Большой / анте
                <input
                  className="field mt-1 w-32"
                  type="number"
                  min={0}
                  required
                  value={level.big}
                  onChange={(event) =>
                    setDraft({
                      ...level,
                      big: Number(event.target.value),
                      ante: Number(event.target.value),
                    })
                  }
                />
              </label>
            </>
          )}
          <label className="text-sm">
            Минуты
            <input
              className="field mt-1 w-24"
              type="number"
              min={1}
              max={240}
              required
              value={level.seconds / 60}
              onChange={(event) =>
                setDraft({ ...level, seconds: Number(event.target.value) * 60 })
              }
            />
          </label>
          <Button type="submit" disabled={pending}>
            Сохранить
          </Button>
        </form>
      )}
    </div>
  );
}

function ClockPanel({
  view,
  television = false,
  compact = false,
}: {
  view: LiveView;
  television?: boolean;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const c = view.clock;
  if (!c) return null;
  const seconds = view.state?.clock.running
    ? Math.max(
        0,
        c.remaining - Math.floor((now - Date.parse(view.serverTime)) / 1000),
      )
    : c.remaining;
  const later = view.state?.config.levels.slice(c.index + 1) ?? [];
  const nextBreak = later.findIndex((level) => level.break);
  const untilBreak =
    nextBreak < 0
      ? null
      : seconds +
        later
          .slice(0, nextBreak)
          .reduce((sum, level) => sum + level.seconds, 0);
  if (compact)
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-gold-400 text-sm">
              {c.level.title}
              {view.state?.clock.running ? "" : " · Пауза"}
            </p>
            <strong className="text-xl tabular-nums">
              {c.level.break
                ? "Перерыв"
                : `${c.level.small} / ${c.level.big} / ${c.level.ante}`}
            </strong>
          </div>
          <strong className="text-3xl tabular-nums">{time(seconds)}</strong>
          {untilBreak !== null && !c.level.break && (
            <span className="text-sm text-white/70 tabular-nums">
              До перерыва {time(untilBreak)}
            </span>
          )}
        </div>
      </Card>
    );
  return (
    <Card>
      <div className="text-center space-y-2">
        <p className="text-gold-400">
          {c.level.title}
          {view.state?.clock.running ? "" : " · Пауза"}
        </p>
        <div
          className={`${television ? "text-7xl lg:text-9xl" : "text-5xl"} font-semibold tabular-nums`}
        >
          {time(seconds)}
        </div>
        <div className="text-2xl tabular-nums">
          {c.level.break
            ? "Перерыв"
            : `${c.level.small.toLocaleString("ru-RU")} / ${c.level.big.toLocaleString("ru-RU")}`}
        </div>
        {!c.level.break && <p>Анте {c.level.ante.toLocaleString("ru-RU")}</p>}
        {!c.level.break && untilBreak !== null && (
          <p className="text-stone-300 tabular-nums">
            До перерыва {time(untilBreak)}
          </p>
        )}
        <p className="text-stone-400">
          {c.next
            ? `Далее: ${c.next.title} · ${c.next.small} / ${c.next.big}`
            : "Последний уровень"}
        </p>
      </div>
    </Card>
  );
}

export function LiveSetup({
  id,
  saved,
  initialConfig,
}: {
  id: string;
  saved: () => void;
  initialConfig?: LiveConfig;
}) {
  const [config, set] = useState(initialConfig ?? defaults);
  const { user } = useAuth();
  const [growth, setGrowth] = useState({
    count: 12,
    first: 100,
    last: 2000,
    step: 50,
  });
  const [templateId, setTemplateId] = useState("");
  const [templateTitle, setTemplateTitle] = useState("");
  const templates = useQuery({
    queryKey: ["blind-templates"],
    queryFn: () =>
      api.get<{ id: string; title: string; config: LiveConfig }[]>(
        "/live/templates",
      ),
  });
  const saveTemplate = useMutation({
    mutationFn: () =>
      api.post("/live/templates", {
        id: templateId || undefined,
        title: templateTitle,
        config,
      }),
    onSuccess: () => {
      void templates.refetch();
    },
  });
  const deleteTemplate = useMutation({
    mutationFn: () => api.delete(`/live/templates/${templateId}`),
    onSuccess: () => {
      setTemplateId("");
      setTemplateTitle("");
      void templates.refetch();
    },
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/live/${id}/actions`, { type: "configure", config }),
    onSuccess: saved,
  });
  const numeric = (key: keyof LiveConfig, label: string) => (
    <label className="label">
      {label}
      <input
        className="field w-full"
        type="number"
        min={1}
        value={config[key] as number}
        onChange={(e) => set({ ...config, [key]: Number(e.target.value) })}
      />
    </label>
  );
  const level = (i: number, patch: Partial<BlindLevel>) =>
    set({
      ...config,
      levels: config.levels.map((l, n) => (n === i ? { ...l, ...patch } : l)),
    });
  return (
    <Card>
      <h2 className="text-xl font-semibold mb-4">
        {id ? "Настройка вечера" : "Структуры турниров"}
      </h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <label className="label">
          Структура
          <select
            className="field w-full"
            value={templateId}
            onChange={(e) => {
              const selected = templates.data?.find(
                (item) => item.id === e.target.value,
              );
              setTemplateId(e.target.value);
              setTemplateTitle(selected?.title ?? "");
              if (selected)
                set({
                  ...config,
                  levels: selected.config.levels,
                  registrationClosesLevel:
                    selected.config.registrationClosesLevel,
                  rebuyClosesLevel: selected.config.rebuyClosesLevel,
                  addonLevel: selected.config.addonLevel,
                });
            }}
          >
            <option value="">Своя структура</option>
            {templates.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        {user?.role === "admin" && (
          <label className="label">
            Название структуры
            <input
              className="field w-full"
              value={templateTitle}
              onChange={(e) => setTemplateTitle(e.target.value)}
            />
          </label>
        )}
        {user?.role === "admin" && (
          <div className="flex gap-2">
            <Button
              disabled={!templateTitle.trim() || saveTemplate.isPending}
              onClick={() => saveTemplate.mutate()}
            >
              Сохранить структуру
            </Button>
            {templateId && (
              <Button
                disabled={deleteTemplate.isPending}
                onClick={() => deleteTemplate.mutate()}
              >
                Удалить структуру
              </Button>
            )}
          </div>
        )}
      </div>
      {(saveTemplate.error || deleteTemplate.error) && (
        <ErrorState error={saveTemplate.error || deleteTemplate.error} />
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {numeric("maxTables", "Максимум столов")}
        {numeric("seatsPerTable", "Мест за столом")}
        {numeric(
          "registrationClosesLevel",
          "Регистрация до уровня включительно",
        )}
        {numeric("rebuyClosesLevel", "Ребаи до уровня включительно")}
        {numeric("addonLevel", "Уровень адона")}
      </div>
      <p className="mt-3">
        Вместимость: {config.maxTables * config.seatsPerTable} игроков
      </p>
      <div className="my-4">
        <label className="label">
          Формат баунти
          <select
            className="field w-full"
            value={config.bountyMode}
            onChange={(e) =>
              set({
                ...config,
                bountyMode: e.target.value as LiveConfig["bountyMode"],
              })
            }
          >
            <option value="none">Без баунти</option>
            <option value="rating">Фиксированный рейтинг</option>
            <option value="lottery">Физический лототрон</option>
          </select>
        </label>
        {config.bountyMode === "rating" &&
          numeric("bountyPoints", "Очков за баунти")}
      </div>
      <h3 className="font-semibold">Уровни и перерывы</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        {(["count", "first", "last", "step"] as const).map((key) => (
          <label key={key} className="label">
            {
              {
                count: "Уровней",
                first: "Первый малый",
                last: "Последний малый",
                step: "Шаг фишек",
              }[key]
            }
            <input
              className="field w-full"
              type="number"
              min={1}
              value={growth[key]}
              onChange={(e) =>
                setGrowth({ ...growth, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        <Button
          disabled={
            growth.count < 2 ||
            growth.count > 100 ||
            growth.first < 1 ||
            growth.last < growth.first ||
            growth.step < 1
          }
          onClick={() => {
            if (!confirm("Заменить уровни новой последовательностью?")) return;
            set({
              ...config,
              levels: Array.from({ length: growth.count }, (_, index) => {
                const small =
                  index === 0
                    ? growth.first
                    : index === growth.count - 1
                      ? growth.last
                      : Math.round(
                          (growth.first *
                            (growth.last / growth.first) **
                              (index / (growth.count - 1))) /
                            growth.step,
                        ) * growth.step;
                return {
                  title: `Уровень ${index + 1}`,
                  small,
                  big: small * 2,
                  ante: small * 2,
                  seconds: 1200,
                  break: false,
                };
              }),
            });
          }}
        >
          Построить рост
        </Button>
      </div>
      <table className="w-full text-sm text-right tabular-nums my-4">
        <thead className="text-white/60">
          <tr>
            <th className="text-left py-2">Уровень</th>
            <th>Малый</th>
            <th>Большой</th>
            <th>Анте</th>
          </tr>
        </thead>
        <tbody>
          {config.levels.map((l, index) => (
            <tr key={index} className="border-t border-white/10">
              <td className="text-left py-2">
                {l.break ? "Перерыв" : index + 1}
              </td>
              <td>{l.break ? "-" : l.small}</td>
              <td>{l.break ? "-" : l.big}</td>
              <td>{l.break ? "-" : l.big}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-4 mt-3">
        {config.levels.map((l, i) => (
          <div key={i} className="border-b border-white/10 pb-4">
            <input
              className="field w-full mb-2"
              aria-label={`Название уровня ${i + 1}`}
              value={l.title}
              onChange={(e) => level(i, { title: e.target.value })}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["small", "big", "ante", "seconds"] as const).map((k) => (
                <label key={k} className="label">
                  {
                    {
                      small: "Малый",
                      big: "Большой",
                      ante: "Анте",
                      seconds: "Минут",
                    }[k]
                  }
                  <input
                    className="field w-full"
                    type="number"
                    readOnly={k === "ante"}
                    value={
                      k === "seconds"
                        ? l[k] / 60
                        : k === "ante"
                          ? l.break
                            ? 0
                            : l.big
                          : l[k]
                    }
                    onChange={(e) =>
                      level(i, {
                        [k]:
                          Number(e.target.value) * (k === "seconds" ? 60 : 1),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="flex gap-2 my-2">
              <input
                type="checkbox"
                checked={l.break}
                onChange={(e) => level(i, { break: e.target.checked })}
              />
              Перерыв
            </label>
            <Button
              onClick={() =>
                set({
                  ...config,
                  levels: config.levels.filter((_, n) => n !== i),
                })
              }
            >
              Удалить уровень
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button
          onClick={() =>
            set({
              ...config,
              levels: [
                ...config.levels,
                {
                  title: `Уровень ${config.levels.length + 1}`,
                  seconds: 1200,
                  small: 200,
                  big: 400,
                  ante: 400,
                  break: false,
                },
              ],
            })
          }
        >
          Добавить уровень
        </Button>
        {id && (
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Применить к вечеру
          </Button>
        )}
      </div>
      {mutation.error && <ErrorState error={mutation.error} />}
    </Card>
  );
}

export function AccountPanel({
  userId,
  tournamentId,
}: {
  userId?: string;
  tournamentId?: string;
}) {
  const qc = useQueryClient();
  const account = useQuery({
    queryKey: ["account", userId ?? "me"],
    queryFn: () =>
      api.get<AccountView>(
        userId ? `/live/account/${userId}` : "/live/account/me",
      ),
    refetchInterval: 10000,
  });
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const pay = useMutation({
    mutationFn: () =>
      api.post("/live/receipts", {
        tournamentId,
        userId,
        amountRub: Number(amount),
        method,
        requestId: crypto.randomUUID(),
      }),
    onSuccess: () => {
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["account"] });
      void qc.invalidateQueries({ queryKey: ["live"] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.delete(`/live/receipts/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["account"] }),
  });
  const cancelPurchase = useMutation({
    mutationFn: (paymentId: string) =>
      api.delete(`/tournaments/${tournamentId}/payments/${paymentId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["account"] });
      void qc.invalidateQueries({ queryKey: ["live"] });
    },
  });
  if (account.isPending) return <Loading />;
  if (account.isError) return <ErrorState error={account.error} />;
  const a = account.data!;
  return (
    <section className="account-ledger space-y-3 mt-4">
      {!userId ? (
        <div className="personal-balance">
          <h2>К оплате</h2>
          <p className="nums">{money(a.debtRub)}</p>
        </div>
      ) : <h2 className="text-xl font-semibold">Счёт · {money(a.debtRub)}</h2>}
      {a.creditRub > 0 && <p>Переплата: {money(a.creditRub)}</p>}
      {!userId && a.accounts.length === 0 && <p className="account-empty">Начислений пока нет</p>}
      {a.accounts
        .filter((a) => !tournamentId || a.tournamentId === tournamentId)
        .map((a) => (
          <details key={a.tournamentId} open={!!tournamentId}>
            <summary>
              {a.title} · к оплате {money(Math.max(0, a.dueRub))}
            </summary>
            <div className="space-y-2 py-3">
              {a.purchases.map((p) => (
                <div
                  key={p.id}
                  className={`flex flex-wrap justify-between gap-2 ${p.voided ? "line-through text-stone-500" : ""}`}
                >
                  <span>{p.title}</span>
                  <span>
                    {money(p.amountRub)} ·{" "}
                    {p.deferred ? "Начислено" : "Оплачено сразу"}
                  </span>
                  {userId && tournamentId && !p.voided && (
                    <Button
                      disabled={cancelPurchase.isPending}
                      onClick={() => {
                        if (confirm(`Отменить «${p.title}»?`))
                          cancelPurchase.mutate(p.id);
                      }}
                    >
                      Отменить позицию
                    </Button>
                  )}
                </div>
              ))}
              {a.receipts.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <span>
                    {r.voided ? "Отменена оплата" : "Оплата"} ·{" "}
                    {r.method === "cash" ? "Наличные" : "Терминал"} ·{" "}
                    {money(r.amountRub)}
                  </span>
                  {userId && !r.voided && (
                    <Button
                      disabled={cancel.isPending}
                      onClick={() => {
                        if (confirm("Отменить запись о полученной оплате?"))
                          cancel.mutate(r.id);
                      }}
                    >
                      Отменить оплату
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}
      {userId && tournamentId && (
        <div className="flex flex-wrap gap-2">
          <input
            className="field w-32"
            type="number"
            min={1}
            placeholder="Сумма"
            aria-label="Сумма оплаты"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select
            className="field"
            aria-label="Способ оплаты"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="cash">Наличные</option>
            <option value="terminal">Терминал</option>
          </select>
          <Button
            disabled={pay.isPending || Number(amount) <= 0}
            onClick={() => pay.mutate()}
          >
            Подтвердить получение
          </Button>
        </div>
      )}
      {(pay.error || cancel.error) && (
        <ErrorState error={pay.error ?? cancel.error} />
      )}
    </section>
  );
}

function PendingOrders({
  id,
  orders,
  name,
  refresh,
  onError,
}: {
  id: string;
  orders: NonNullable<LiveView["state"]>["orders"];
  name: (id: string) => string;
  refresh: () => void;
  onError: (e: string) => void;
}) {
  const action = useMutation({
    mutationFn: ({ orderId, verb }: { orderId: string; verb: string }) =>
      api.post(`/live/${id}/orders/${orderId}/${verb}`),
    onSuccess: refresh,
    onError: (e) => onError(e.message),
  });
  return orders.length ? (
    <Card>
      <h2 className="font-semibold">Ожидают выдачи</h2>
      {orders.map((o) => (
        <div
          key={o.id}
          className="flex flex-wrap justify-between gap-2 py-3 border-b border-white/10"
        >
          <span>
            {name(o.userId)} · {o.title} x{o.quantity}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={action.isPending}
              onClick={() => action.mutate({ orderId: o.id, verb: "fulfil" })}
            >
              Выдано
            </Button>
            <Button
              disabled={action.isPending}
              onClick={() => action.mutate({ orderId: o.id, verb: "cancel" })}
            >
              Отменить
            </Button>
          </div>
        </div>
      ))}
    </Card>
  ) : null;
}

function LotteryDesk({
  bounties,
  name,
  menu,
  action,
  busy,
}: {
  id: string;
  bounties: NonNullable<LiveView["state"]>["bounties"];
  name: (id: string) => string;
  menu: ClubMenuItem[];
  action: (a: LiveAction) => void;
  busy: boolean;
}) {
  const [chosen, setChosen] = useState("");
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState(0);
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  return (
    <Card>
      <h2 className="font-semibold">Баунти и лототрон</h2>
      {bounties
        .filter((b) => !b.voided)
        .map((b) => (
          <div
            key={b.id}
            className="flex flex-wrap justify-between gap-2 py-3 border-b border-white/10"
          >
            <span>
              {name(b.userId)} ·{" "}
              {b.mode === "rating"
                ? `${b.points} очков`
                : b.award
                  ? b.award.title
                  : "Попытка доступна"}
            </span>
            <div className="flex gap-2">
              {b.mode === "lottery" && !b.award && (
                <Button onClick={() => setChosen(b.id)}>
                  Записать результат
                </Button>
              )}
              {b.award && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Отменить награду и восстановить попытку?"))
                      action({ type: "cancelLottery", bountyId: b.id });
                  }}
                >
                  Исправить результат
                </Button>
              )}
              <Button
                disabled={busy}
                onClick={() => {
                  if (confirm("Отменить это баунти и связанную награду?"))
                    action({ type: "voidBounty", bountyId: b.id });
                }}
              >
                Отменить
              </Button>
            </div>
          </div>
        ))}
      {chosen && (
        <div className="grid gap-3 mt-4">
          <input
            className="field"
            placeholder="Название награды / предмета"
            aria-label="Награда"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="label">
            Очки
            <input
              type="number"
              min={0}
              className="field w-32 block"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </label>
          <select
            className="field"
            aria-label="Приз из меню"
            value={item}
            onChange={(e) => {
              setItem(e.target.value);
              const m = menu.find((m) => m.id === e.target.value);
              if (m) setTitle(m.title);
            }}
          >
            <option value="">Без позиции меню</option>
            {menu.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <label className="label">
            Количество
            <input
              type="number"
              min={1}
              max={20}
              className="field w-24 block"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <Button
            disabled={busy || !title.trim()}
            onClick={() => {
              action({
                type: "lottery",
                bountyId: chosen,
                title,
                points,
                quantity,
                ...(item ? { menuItemId: item } : {}),
              });
              setChosen("");
            }}
          >
            Списать попытку и начислить награду
          </Button>
        </div>
      )}
    </Card>
  );
}

function HandAwards({ id, userId }: { id: string; userId: string }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const awards = useQuery({
    queryKey: ["live-awards"],
    queryFn: () =>
      api.get<{ id: string; title: string; category: string }[]>(
        "/achievements",
      ),
  });
  const mutation = useMutation({
    mutationFn: (achievementId: string) =>
      api.post(`/live/${id}/achievement`, { userId, achievementId }),
    onError: (e) => setError(e.message),
    onSuccess: (_, achievementId) => {
      setError("");
      setNotice(
        `${awards.data?.find((a) => a.id === achievementId)?.title ?? "Ачивка"} - выдана`,
      );
    },
  });
  return (
    <div className="mt-4">
      <h3 className="font-semibold mb-2">Комбинации</h3>
      <div className="flex flex-wrap gap-2">
        {awards.data
          ?.filter((a) => a.category === "game")
          .map((a) => (
            <Button
              key={a.id}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(a.id)}
            >
              {a.title}
            </Button>
          ))}
      </div>
      {awards.isLoading && <Loading />}
      {awards.isError && <p role="alert">Не удалось загрузить комбинации</p>}
      {notice && (
        <p role="status" className="text-gold-300 mt-2">
          {notice}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function PlayerAccountPage() {
  const { status } = useAuth();
  if (status === "loading") return <Loading />;
  if (status !== "authenticated") return <Navigate to="/login" replace />;
  return (
    <div className="account-page space-y-5">
      <h1>Мой счёт</h1>
      <AccountPanel />
      <PlayerOrders />
    </div>
  );
}
function PlayerOrders() {
  const qc = useQueryClient();
  const events = useQuery({
    queryKey: ["player-live"],
    queryFn: () => api.get<PlayerLive[]>("/live/me"),
    refetchInterval: 5000,
  });
  const menu = useQuery({
    queryKey: ["live-menu"],
    queryFn: () => api.get<ClubMenuItem[]>("/club/menu-public"),
  });
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const mutation = useMutation({
    mutationFn: (tournamentId: string) =>
      api.post("/live/orders", {
        tournamentId,
        menuItemId: item,
        quantity,
        requestId: crypto.randomUUID(),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["player-live"] }),
  });
  const other = useMutation({
    mutationFn: ({
      id,
      path,
      body,
    }: {
      id: string;
      path: string;
      body?: unknown;
    }) => api.post(`/live/${id}/${path}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["player-live"] }),
  });
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      {events.data?.map((e) => (
        <Card key={e.tournamentId}>
          <h2 className="font-semibold">{e.title}</h2>
          <p>
            {e.player.table
              ? `Стол ${e.player.table}, место ${e.player.seat}`
              : e.player.state === "playing"
                ? "Ожидаете посадку"
                : "Выбыли"}
          </p>
          {e.player.state === "playing" && (
            <Button
              className="my-3"
              disabled={other.isPending}
              onClick={() =>
                other.mutate({
                  id: e.tournamentId,
                  path: "actions",
                  body: {
                    type: "wantMove",
                    userId: user!.id,
                    wanted: !e.player.wantsMove,
                  },
                })
              }
            >
              {e.player.wantsMove
                ? "Больше не хочу пересесть"
                : "Хочу пересесть"}
            </Button>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <select
              className="field flex-1 min-w-0"
              value={item}
              aria-label="Позиция заказа"
              onChange={(ev) => setItem(ev.target.value)}
            >
              <option value="">Выберите позицию</option>
              {menu.data
                ?.filter((m) => m.kind !== "entry")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} · {money(m.priceRub)}
                  </option>
                ))}
            </select>
            <select
              className="field"
              aria-label="Количество"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  x{n}
                </option>
              ))}
            </select>
            <Button
              disabled={!item || mutation.isPending}
              onClick={() => mutation.mutate(e.tournamentId)}
            >
              Заказать
            </Button>
          </div>
          {e.orders
            .filter((o) => o.state === "pending")
            .map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap justify-between gap-2 py-3"
              >
                <span>
                  {o.title} x{o.quantity} · ожидает выдачи
                </span>
                <Button
                  disabled={other.isPending}
                  onClick={() =>
                    other.mutate({
                      id: e.tournamentId,
                      path: `orders/${o.id}/cancel`,
                    })
                  }
                >
                  Отменить
                </Button>
              </div>
            ))}
          <p className="mt-3">
            Лототрон:{" "}
            {
              e.bounties.filter(
                (b) => b.mode === "lottery" && !b.voided && !b.award,
              ).length
            }{" "}
            доступных попыток
          </p>
        </Card>
      ))}
      {(mutation.error || other.error) && (
        <ErrorState error={mutation.error ?? other.error} />
      )}
    </div>
  );
}

export { HallDisplayPage } from "./HallDisplay";

function DealerSeatMap({
  view,
  players,
  count,
  name,
  pending,
  selected,
  onSelect,
  onMove,
}: {
  view: LiveView;
  players: NonNullable<LiveView["state"]>["seats"];
  count: number;
  name: (id: string) => string;
  pending: boolean;
  selected: string;
  onSelect: (id: string) => void;
  onMove: (
    id: string,
    seat: number,
    expectedSeat: number,
    expectedOccupant: string | null,
  ) => void;
}) {
  const [drag, setDrag] = useState<{
    id: string;
    from: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [ghost, setGhost] = useState({ x: 0, y: 0 });
  return (
    <div
      className="dealer-seat-map"
      onPointerMove={(e) => {
        if (!drag) return;
        setGhost({ x: e.clientX, y: e.clientY });
        const moved =
          drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8;
        setDrag({ ...drag, moved });
        const box = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>("[data-box]");
        setTarget(box ? Number(box.dataset.box) : null);
      }}
      onPointerUp={(e) => {
        if (!drag) return;
        if (drag.moved && target && target !== drag.from && !pending) {
          onMove(
            drag.id,
            target,
            drag.from,
            players.find((p) => p.seat === target)?.userId ?? null,
          );
        } else if (!drag.moved) onSelect(drag.id);
        setDrag(null);
        setTarget(null);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        setDrag(null);
        setTarget(null);
      }}
    >
      {drag?.moved && (
        <div
          className="dealer-drag-preview"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {name(drag.id)}
        </div>
      )}
      <div className="dealer-table-felt">
        <div className="dealer-center-clock">
          <ClockPanel view={view} compact />
        </div>
      </div>
      {Array.from({ length: count }, (_, index) => {
        const n = index + 1;
        const angle = (2 * Math.PI * index) / count - Math.PI / 2;
        const p = players.find((p) => p.seat === n);
        return (
          <button
            key={n}
            data-box={n}
            aria-label={`Бокс ${n}${p ? `, ${name(p.userId)}` : ", свободно"}`}
            style={{
              left: `${50 + 36 * Math.cos(angle)}%`,
              top: `${50 + 39 * Math.sin(angle)}%`,
            }}
            className={`dealer-seat ${target === n && drag?.from !== n ? "dealer-seat-target" : ""} ${selected === p?.userId ? "dealer-seat-selected" : ""} ${drag?.id === p?.userId ? "dealer-seat-dragging" : ""}`}
            disabled={pending}
            onPointerDown={(e) => {
              if (!p || pending || e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.parentElement!.setPointerCapture(e.pointerId);
              setDrag({
                id: p.userId,
                from: n,
                x: e.clientX,
                y: e.clientY,
                moved: false,
              });
            }}
            onClick={(e) => {
              if (e.detail === 0 && p) onSelect(p.userId);
            }}
          >
            <span className="text-stone-400 text-xs">{n}</span>
            <strong className="block truncate">
              {p ? name(p.userId) : "Свободно"}
            </strong>
            {p && (
              <span className="tabular-nums text-gold-300">
                {p.stack.toLocaleString("ru-RU")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function StackEditor({
  stack,
  busy,
  onSave,
}: {
  stack: number;
  busy: boolean;
  onSave: (stack: number) => void;
}) {
  const [value, setValue] = useState(String(stack));
  useEffect(() => setValue(String(stack)), [stack]);
  return (
    <form
      className="flex items-end gap-2 w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (Number(value) > 0 && Number.isInteger(Number(value)))
          onSave(Number(value));
      }}
    >
      <label className="label mb-0 flex-1">
        Стек
        <input
          className="field mt-1"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        disabled={
          busy || Number(value) <= 0 || !Number.isInteger(Number(value))
        }
      >
        Сохранить
      </Button>
    </form>
  );
}
