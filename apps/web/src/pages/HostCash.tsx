import { useQuery } from "@tanstack/react-query";
import type { HostCashDay } from "@poker/contracts";
import { api } from "../lib/api";
import { ErrorState } from "../components/ui";

const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;
export function HostCash() {
  const query = useQuery({ queryKey: ["host-cash"], queryFn: () => api.get<HostCashDay>("/live/cash/today"), refetchInterval: 5000 });
  const cash = query.data;
  return <details className="host-cash">
    <summary><strong>Касса за сегодня</strong>{cash ? <span className="host-cash-totals"><span>Наличные <b>{money(cash.cashRub)}</b></span><span>Карта <b>{money(cash.terminalRub)}</b></span><span>Всего <b>{money(cash.paidRub)}</b></span></span> : <span>{query.isError ? "Не удалось обновить" : "Загрузка…"}</span>}<span className="host-cash-chevron" aria-hidden="true">⌄</span></summary>
    {query.isError && <ErrorState error={query.error} />}
    {cash && <div className="host-cash-body">
      {cash.unspecifiedRub > 0 && <p>Способ оплаты не указан: {money(cash.unspecifiedRub)}</p>}
      <div className="host-cash-items"><div className="host-cash-row host-cash-labels"><span>Выдано сегодня</span><span>Куплено</span><span>По призам</span><span>Начислено</span></div>
        {cash.items.map(item => <div className="host-cash-row" key={`${item.kind}:${item.title}`}><strong>{item.title}</strong><span>{item.quantity}</span><span>{item.prizeQuantity || "—"}</span><b>{money(item.chargedRub)}</b></div>)}
        {cash.items.length === 0 && <p>Выдач сегодня пока нет.</p>}
      </div>
    </div>}
  </details>;
}
