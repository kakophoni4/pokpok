import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClubMenuItem, LiveView, TournamentSummary } from "@poker/contracts";
import { useAuth } from "../auth/auth-context";
import { ClubBrand } from "../components/ClubBrand";
import { Avatar, Button, Card, ErrorState, Loading } from "../components/ui";
import { api } from "../lib/api";
import { HostAdmission, HostPlayerControls } from "./LiveHostControls";
import { AccountPanel, PendingOrders } from "./LivePages";
import { HostAttention } from "./HostAttention";
import "./host-workspace.css";

export function HostPage() {
  const auth = useAuth();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (auth.status === "loading") return <Loading />;
  if (auth.user?.role === "hostess") return <HostWorkspace />;
  return <main className="host-login-shell">
    <form className="host-login card" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      try { await auth.loginAsHost(nickname.trim(), password); setPassword(""); }
      catch (err) { setError((err as Error).message); }
      finally { setBusy(false); }
    }}>
      <ClubBrand />
      <h1>Вход для хостес</h1>
      <label htmlFor="host-login">Логин</label>
      <input id="host-login" className="field" autoComplete="username" value={nickname} onChange={e => setNickname(e.target.value)} required maxLength={24} />
      <label htmlFor="host-password">Пароль</label>
      <input id="host-password" className="field" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128} />
      {error && <p role="alert" className="text-chip-red">{error}</p>}
      <Button type="submit" loading={busy}>Войти</Button>
    </form>
  </main>;
}

function HostWorkspace() {
  const { user, logout } = useAuth();
  const [selectedEvent, setSelectedEvent] = useState("");
  const events = useQuery({ queryKey: ["live-events"], queryFn: () => api.get<TournamentSummary[]>("/tournaments?scope=all"), refetchInterval: 10000 });
  const active = (events.data ?? []).filter(t => ["running", "reg_open", "reg_closed"].includes(t.status))
    .sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const event = active.find(t => t.id === selectedEvent) ?? active[0];
  return <div className="host-workspace">
    <header className="host-workspace-header"><ClubBrand /><strong>Хостес</strong><span>{user?.nickname}</span><Button variant="ghost" onClick={() => void logout()}>Выйти</Button></header>
    <main>
      {events.isPending && <Loading />}
      {events.isError && <ErrorState error={events.error} />}
      {event ? <>
        <div className="host-event-heading"><h1>{event.title}</h1>{active.length > 1 && <select className="field" aria-label="Турнир" value={event.id} onChange={e => setSelectedEvent(e.target.value)}>{active.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>}</div>
        <HostDesk key={event.id} id={event.id} />
      </> : !events.isPending && !events.isError && <Card>Сейчас нет турнира для приёма игроков.</Card>}
    </main>
  </div>;
}

function HostDesk({ id }: { id: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"issue" | "account">("issue");
  const [error, setError] = useState("");
  const view = useQuery({ queryKey: ["live", id], queryFn: () => api.get<LiveView>(`/live/${id}`), refetchInterval: 2000 });
  const menu = useQuery({ queryKey: ["live-menu"], queryFn: () => api.get<ClubMenuItem[]>("/club/menu-public") });
  const refresh = () => { for (const key of ["live", "account", "host-detail", "prizes"]) void qc.invalidateQueries({ queryKey: [key] }); };
  if (view.isPending || menu.isPending) return <Loading />;
  if (view.isError || menu.isError) return <ErrorState error={view.error ?? menu.error} />;
  const data = view.data;
  const seats = data.state?.seats ?? [];
  const name = (uid: string) => data.players.find(p => p.id === uid)?.name ?? uid;
  const arrivedIds = seats.map(s => s.userId);
  const pending = (data.state?.orders ?? []).filter(o => o.state === "pending");
  const due = data.balances.reduce((sum, b) => sum + Math.max(0, b.dueRub), 0);
  const selectedSeat = seats.find(s => s.userId === selected);
  return <>
    <div className="host-shift-summary"><span>Участников <b>{arrivedIds.length}</b></span><span>К выдаче <b>{pending.length}</b></span><span>К оплате <b>{due.toLocaleString("ru-RU")} ₽</b></span></div>
    <HostAttention id={id} alerts={data.state?.alerts ?? []} name={name} onSelect={(userId, final) => { setSelected(userId); setSearch(""); setTab(final ? "account" : "issue"); }} />
    <div className="host-desk">
    <section className="host-reception">
      <HostAdmission id={id} arrivedIds={arrivedIds} menu={menu.data ?? []} allowFinish={false} />
      <PendingOrders id={id} orders={pending} name={name} refresh={refresh} onError={setError} />
      {error && <p role="alert" className="text-chip-red">{error}</p>}
    </section>
    <section className="host-roster">
      <Card><h2>Игроки · {arrivedIds.length}</h2>
        <input className="field" type="search" aria-label="Найти игрока для расчёта" placeholder="Найти игрока" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="host-player-list">{data.players.filter(p => arrivedIds.includes(p.id) && p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(p => {
          const seat = seats.find(s => s.userId === p.id);
          const balance = data.balances.find(b => b.userId === p.id);
          const location = seat?.table ? `Стол ${seat.table} · место ${seat.seat}` : seat?.state === "eliminated" ? "Завершил игру" : seat?.state === "busted" ? "Без стека" : "Ожидает места";
          return <button key={p.id} className={selected === p.id ? "selected" : ""} onClick={() => { setSelected(p.id); setTab(balance?.dueRub ? "account" : "issue"); }}><strong>{p.name}</strong><span>{location}</span><b>{balance?.dueRub ? `${balance.dueRub.toLocaleString("ru-RU")} ₽` : "—"}</b></button>;
        })}</div>
      </Card>
    </section>
    <section className="host-detail card">
      {selected ? <div key={selected} className="host-selected">
        <div className="host-detail-heading"><Avatar nickname={name(selected)} size={44} /><div><h2>{name(selected)}</h2><p>{selectedSeat?.table ? `Стол ${selectedSeat.table} · место ${selectedSeat.seat}` : "Расчёт и выдача"}</p></div></div>
        <div className="host-detail-tabs" role="tablist" aria-label="Действия с игроком"><button role="tab" aria-selected={tab === "issue"} onClick={() => setTab("issue")}>Выдача и призы</button><button role="tab" aria-selected={tab === "account"} onClick={() => setTab("account")}>Счёт</button></div>
        <div className="host-detail-body" role="tabpanel">{tab === "issue" ? <HostPlayerControls id={id} userId={selected} menu={menu.data ?? []} compact /> : <AccountPanel userId={selected} tournamentId={id} />}</div>
      </div> : <div className="host-pick"><div className="host-pick-symbol">↗</div><h2>Выберите игрока</h2><p>Выдача, призы и расчёт</p></div>}
    </section>
  </div></>;
}
