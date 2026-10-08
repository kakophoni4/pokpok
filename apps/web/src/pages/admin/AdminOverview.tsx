import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClubOverview } from "@poker/contracts";
import { api } from "../../lib/api";
import { Button, ErrorState, Loading } from "../../components/ui";

const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
export function AdminOverview({ navigate }: { navigate: (tab: "game" | "players" | "staff" | "sales" | "tournaments")=>void }) {
  const qc = useQueryClient();
  const report = useQuery({ queryKey: ["club-overview"], queryFn: ()=>api.get<ClubOverview>("/club/overview"), refetchInterval: 10000 });
  const [limit, setLimit] = useState<string | null>(null);
  const [page,setPage] = useState(0);
  const [search,setSearch] = useState("");
  const save = useMutation({ mutationFn: ()=>api.patch("/club/settings", { defaultCreditLimitRub: Number(limit ?? report.data?.defaultCreditLimitRub ?? 3000) }), onSuccess: async ()=>{ setLimit(null); await Promise.all(["club-overview", "club", "credit"].map(key=>qc.invalidateQueries({ queryKey:[key] }))); } });
  if(report.isPending) return <Loading/>;
  if(report.isError) return <ErrorState error={report.error}/>;
  const d=report.data;
  const current=d.events.find(e=>e.status==="running") ?? d.events[0];
  const debtors=d.debtors.filter(p=>p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const safePage=Math.min(page,Math.max(0,Math.ceil(debtors.length/10)-1));
  return <div className="club-overview">
    <div className="admin-kpis">
      <button onClick={()=>navigate("sales")}><span>Получено сегодня</span><strong>{rub(d.cash.paidRub)}</strong><small>{d.cash.date.split("-").reverse().join(".")}</small></button>
      <button onClick={()=>navigate("sales")}><span>Наличные</span><strong>{rub(d.cash.cashRub)}</strong><small>Оплаты в кассу</small></button>
      <button onClick={()=>navigate("sales")}><span>Картой</span><strong>{rub(d.cash.terminalRub)}</strong><small>Оплаты через терминал</small></button>
      <a href="#club-debts"><span>Долг игроков</span><strong>{rub(d.debtRub)}</strong><small>{d.debtors.length} игроков</small></a>
    </div>
    {d.cash.unspecifiedRub>0 && <p className="admin-note">Без указанного способа оплаты: {rub(d.cash.unspecifiedRub)}</p>}
    <details className="admin-panel admin-cash-details"><summary>Касса сегодня · покупки и выдачи</summary><div className="admin-cash-table"><div className="admin-cash-row admin-debt-labels"><span>Позиция</span><span>Куплено</span><span>По призам</span><span>Начислено</span></div>{d.cash.items.map((item,i)=><div className="admin-cash-row" key={i}><span>{item.title}</span><span>{item.quantity}</span><span>{item.prizeQuantity}</span><strong>{rub(item.chargedRub)}</strong></div>)}</div>{!d.cash.items.length&&<p className="admin-empty">Сегодня выдач ещё нет</p>}</details>
    <div className="admin-overview-grid">
      <section className="admin-panel admin-current"><div className="admin-panel-heading"><h2>Текущий турнир</h2><Button variant="ghost" size="sm" onClick={()=>navigate("game")}>Управлять →</Button></div>
        {current ? <><span className="admin-state">{!current.configured ? "Нужна настройка" : current.status!=="running" ? "Ожидает старта" : current.paused ? "Пауза" : "Идёт игра"}</span><h3>{current.title}</h3><p>{new Date(current.startsAt).toLocaleString("ru-RU",{timeZone:"Europe/Samara",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})}</p><div className="admin-event-stats"><div><strong>{current.registered}</strong><span>Записано</span></div><div><strong>{current.inPlay}</strong><span>В игре</span></div><div><strong>{current.tables}</strong><span>Столов открыто</span></div></div></> : <div className="admin-empty">Нет активного турнира<Button variant="secondary" onClick={()=>navigate("tournaments")}>Открыть расписание</Button></div>}
      </section>
      <section className="admin-panel"><div className="admin-panel-heading"><h2>Ожидают выдачи</h2><span className="admin-count">{d.requests.length}</span></div>
        {d.requests.length ? <><ul className="admin-request-list">{d.requests.slice(0,5).map(r=><li key={r.id}><div><strong>{r.player}</strong><span>{r.title} ×{r.quantity}{r.table!=null?` · стол ${r.table}`:""}</span></div><b>{rub(r.amountRub)}</b></li>)}</ul><Button variant="ghost" size="sm" onClick={()=>navigate("game")}>Все заявки →</Button></> : <p className="admin-empty">Все заявки обработаны</p>}
      </section>
    </div>
    <div className="admin-overview-grid admin-bottom-grid">
      <section className="admin-panel" id="club-debts"><div className="admin-panel-heading"><h2>Долги игроков</h2><span className="admin-count">{d.debtors.length}</span></div>
        <input className="field" type="search" placeholder="Найти должника" aria-label="Найти должника" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/>
        {debtors.length ? <><div className="admin-debt-table"><div className="admin-debt-row admin-debt-labels"><span>Игрок</span><span>Долг</span><span>Лимит</span></div>{debtors.slice(safePage*10,safePage*10+10).map(p=><div className="admin-debt-row" key={p.userId}><span>{p.name}{p.individual&&<small>Индивидуальный лимит</small>}</span><strong className={p.debtRub>=p.limitRub?"at-credit-limit":""}>{rub(p.debtRub)}</strong><span>{rub(p.limitRub)}</span></div>)}</div>{debtors.length>10&&<div className="admin-pagination"><Button size="sm" variant="ghost" disabled={!safePage} onClick={()=>setPage(safePage-1)}>Назад</Button><span>{safePage+1} / {Math.ceil(debtors.length/10)}</span><Button size="sm" variant="ghost" disabled={(safePage+1)*10>=debtors.length} onClick={()=>setPage(safePage+1)}>Далее</Button></div>}</> : <p className="admin-empty">{search?"Игрок не найден":"Долгов нет"}</p>}
        <Button size="sm" variant="ghost" onClick={()=>navigate("players")}>Открыть игроков →</Button>
      </section>
      <div className="admin-side-panels"><section className="admin-panel"><h2>Лимит долга</h2><form className="admin-limit-form" onSubmit={e=>{e.preventDefault();save.mutate();}}><label htmlFor="club-credit-limit">Общий для игроков, ₽</label><div><input id="club-credit-limit" className="field" type="number" required min="0" max="1000000" step="1" value={limit??d.defaultCreditLimitRub} onChange={e=>{setLimit(e.target.value);save.reset();}}/><Button type="submit" loading={save.isPending}>Сохранить</Button></div><p>Индивидуальный лимит задаётся в карточке игрока. 0 ₽ — только с оплатой.</p></form>{save.isError&&<ErrorState error={save.error}/ >}{save.isSuccess&&<p role="status">Лимит сохранён</p>}</section>
      <section className="admin-panel"><h2>Клуб</h2><div className="admin-club-links"><button onClick={()=>navigate("players")}><span>Игроков в базе</span><strong>{d.players}</strong></button><button onClick={()=>navigate("staff")}><span>Активных сотрудников</span><strong>{d.staff}</strong></button></div></section></div>
    </div>
  </div>;
}
