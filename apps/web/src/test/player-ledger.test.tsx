import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AccountView } from "@poker/contracts";
import { PlayerLedger } from "../components/PlayerLedger";

const stamp="2026-10-09T12:00:00.000Z";
const account:AccountView={userId:"u1",debtRub:750,creditRub:200,accounts:[{tournamentId:"t1",title:"Клубный турнир",chargedRub:1500,paidRub:750,dueRub:750,purchases:[{id:"p1",title:"Вход",amountRub:1000,deferred:true,voided:false,createdAt:stamp},{id:"p2",title:"Ребай",amountRub:500,deferred:false,voided:false,createdAt:stamp},{id:"p3",title:"Отменённый чай",amountRub:200,deferred:true,voided:true,createdAt:stamp}],receipts:[{id:"r1",amountRub:250,method:"terminal",actor:"Host",voided:false,createdAt:stamp}]},{tournamentId:"t2",title:"Прошлый турнир",chargedRub:1000,paidRub:1200,dueRub:-200,purchases:[],receipts:[]}]};
const show=(data:AccountView)=>render(<MemoryRouter><PlayerLedger account={data}/></MemoryRouter>);
describe("player account presentation",()=>{
  it("keeps debt and overpayment separate and uses server totals without counting cancelled purchases",()=>{
    show(account);
    const balance=document.querySelector('.balance-card') as HTMLElement;
    expect(within(balance).getByText('750 ₽')).toBeInTheDocument();
    expect(within(balance).getByText('200 ₽')).toBeInTheDocument();
    expect(within(balance).getByText('2 500 ₽')).toBeInTheDocument();
    expect(within(balance).getByText('1 950 ₽')).toBeInTheDocument();
    expect(screen.getByText('Есть задолженность')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it("distinguishes immediate purchases, receipts and cancelled entries",()=>{
    show(account);
    expect(screen.getByText(/Оплачено сразу/)).toBeInTheDocument();
    expect(screen.getByText('Оплата картой')).toBeInTheDocument();
    expect(screen.getByText('Отменённый чай').closest('li')).toHaveClass('ledger-voided');
    expect(screen.getAllByRole('link',{name:'Турнир ↗',hidden:true})[0]).toHaveAttribute('href','/t/t1');
    expect(screen.getAllByText('Переплата').length).toBeGreaterThan(0);
  });
  it("shows a calm empty state and no debt when no purchases exist",()=>{
    show({userId:'u1',debtRub:0,creditRub:0,accounts:[]});
    expect(screen.getByText('Всё оплачено')).toBeInTheDocument();
    expect(screen.getByText('Начислений пока нет')).toBeInTheDocument();
    expect(document.querySelector('.ledger-event')).toBeNull();
  });
});
