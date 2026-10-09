import type { AccountView } from "@poker/contracts";
import { Link } from "react-router-dom";

const rub = (n:number) => `${n.toLocaleString("ru-RU")} ₽`;
const date = (value:string) => new Date(value).toLocaleDateString("ru-RU",{day:"numeric",month:"short",year:"numeric"});

export function PlayerLedger({account}:{account:AccountView}) {
  const hasDebt=account.debtRub>0;
  const hasHistory=account.accounts.length>0;
  return <section className="player-ledger" aria-label="Личный счёт">
    <div className={`balance-card ${hasDebt?"balance-due":"balance-clear"}`}>
      <div className="balance-topline"><h2>К оплате</h2><span className="balance-status"><span aria-hidden="true">{hasDebt?"•":"✓"}</span>{hasDebt?"Есть задолженность":"Всё оплачено"}</span></div>
      <p className="balance-amount nums">{rub(account.debtRub)}</p>
      {account.creditRub>0&&<p className="balance-credit">Переплата <strong>{rub(account.creditRub)}</strong></p>}
      <div className="balance-totals"><div><span>Начислено за всё время</span><strong className="nums">{rub(account.accounts.reduce((sum,a)=>sum+a.chargedRub,0))}</strong></div><div><span>Оплачено за всё время</span><strong className="nums">{rub(account.accounts.reduce((sum,a)=>sum+a.paidRub,0))}</strong></div></div>
    </div>
    <div className="ledger-heading"><h2>Покупки и оплаты</h2>{hasHistory&&<span>{account.accounts.length} турниров</span>}</div>
    {!hasHistory?<div className="ledger-empty"><svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="5" y="6" width="22" height="22" rx="5" stroke="currentColor"/><path d="M11 13h10M11 18h10M11 23h5" stroke="currentColor" strokeLinecap="round"/></svg><h3>Начислений пока нет</h3><p>Здесь появятся покупки и оплаты за турниры.</p></div>:<div className="ledger-events">{account.accounts.map(a=>{
      const operations=[...a.purchases.map(p=>({id:`purchase-${p.id}`,title:p.title,amount:p.amountRub,voided:p.voided,createdAt:p.createdAt,status:p.voided?"Отменено":p.deferred?"Начислено":"Оплачено сразу",payment:false})),...a.receipts.map(r=>({id:`receipt-${r.id}`,title:r.method==="cash"?"Оплата наличными":r.method==="terminal"?"Оплата картой":"Оплата",amount:r.amountRub,voided:r.voided,createdAt:r.createdAt,status:r.voided?"Отменено":"Получено",payment:true}))].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
      return <details className="ledger-event" key={a.tournamentId}>
        <summary><div className="ledger-event-title"><strong>{a.title}</strong><span>{operations.length} операций</span></div><div className="ledger-event-balance"><span>{a.dueRub>0?"К оплате":a.dueRub<0?"Переплата":"Оплачено"}</span><strong className="nums">{rub(Math.abs(a.dueRub))}</strong></div><span className="ledger-chevron" aria-hidden="true">⌄</span></summary>
        <div className="ledger-event-body"><div className="ledger-event-totals"><span>Начислено <b>{rub(a.chargedRub)}</b></span><span>Оплачено <b>{rub(a.paidRub)}</b></span><Link to={`/t/${a.tournamentId}`}>Турнир ↗</Link></div><ul>{operations.map(op=><li key={op.id} className={op.voided?"ledger-voided":""}><div><strong>{op.title}</strong><span>{date(op.createdAt)} · {op.status}</span></div><span className={`ledger-operation-amount nums ${op.payment&&!op.voided?"ledger-payment":""}`}>{rub(op.amount)}</span></li>)}</ul></div>
      </details>;
    })}</div>}
  </section>;
}
