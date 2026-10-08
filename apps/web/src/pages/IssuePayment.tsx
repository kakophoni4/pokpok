import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
export type IssueMethod = "" | "cash" | "terminal";
export function IssuePayment({ value, onChange }: { value: IssueMethod; onChange: (v: IssueMethod)=>void }) {
  return <select className="field issue-payment" aria-label="Оплата при выдаче" value={value} onChange={e=>onChange(e.target.value as IssueMethod)}><option value="">В долг</option><option value="cash">Оплачено наличными</option><option value="terminal">Оплачено картой</option></select>;
}
export function useIssueMethod() { return useState<IssueMethod>(""); }
export function PlayerCredit({ userId }: { userId: string }) {
  const query = useQuery({ queryKey:["credit",userId], queryFn:()=>api.get<{debtRub:number;limitRub:number;remainingRub:number}>(`/live/credit/${userId}`), refetchInterval:5000 });
  if(!query.data) return query.isError ? <p className="text-sm text-chip-red">Не удалось загрузить лимит долга</p> : null;
  const c=query.data;
  return <p className="player-credit">Долг: <strong>{c.debtRub.toLocaleString("ru-RU")} ₽</strong> · лимит {c.limitRub.toLocaleString("ru-RU")} ₽ · доступно {c.remainingRub.toLocaleString("ru-RU")} ₽</p>;
}
