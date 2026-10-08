import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LiveOrder } from "@poker/contracts";
import { useEffect } from "react";
import { IssuePayment, useIssueMethod, type IssueMethod } from "./IssuePayment";
import { Button } from "../components/ui";
import { api } from "../lib/api";

export function HostRebuyAttention({ id, orders, name, onSelect }: {
  id: string; orders: LiveOrder[]; name: (id: string) => string;
  onSelect: (userId: string) => void;
}) {
  const qc = useQueryClient();
  const [method, setMethod] = useIssueMethod();
  const action = useMutation({
    mutationFn: ({ orderId, verb, method }: { orderId: string; verb: "fulfil" | "cancel"; method?: IssueMethod }) => verb === "fulfil" ? api.post(`/live/${id}/orders/${orderId}/${verb}`, { method: method || undefined }) : api.post(`/live/${id}/orders/${orderId}/${verb}`),
    onSuccess: async () => {
      await Promise.all(["live", "account", "host-detail", "host-cash", "credit", "club-overview"].map(key => qc.invalidateQueries({ queryKey: [key] })));
    },
  });
  const order = orders[0];
  useEffect(()=>{setMethod("");action.reset();},[order?.id]);
  if (!order) return null;
  return <aside className="host-attention" role="alert" aria-label="Заявка на ребай">
    <div className="host-attention-icon" aria-hidden="true">!</div>
    <div className="host-attention-message">
      <div className="host-attention-status"><strong>Ожидает ребай ×{order.quantity}</strong><span>{orders.length > 1 ? `Ещё ${orders.length - 1}` : "Заявка на выдачу"}</span></div>
      <h2>{name(order.userId)}{order.table != null && <small>Стол {order.table}{order.seat != null ? ` · место ${order.seat}` : ""}</small>}</h2>
      <p>{order.title} ×{order.quantity} · {(order.priceRub * order.quantity).toLocaleString("ru-RU")} ₽</p>
      {action.isError && <p className="text-chip-red">{action.error.message}</p>}
    </div>
    <div className="host-attention-actions">
      <Button variant="ghost" disabled={action.isPending} onClick={() => {
        if (confirm(`Отменить заявку: ${name(order.userId)}, ${order.title} ×${order.quantity}?`)) action.mutate({ orderId: order.id, verb: "cancel" });
      }}>Отменить</Button>
      <Button variant="secondary" onClick={() => onSelect(order.userId)}>К игроку</Button>
      <IssuePayment value={method} onChange={setMethod} />
      <Button loading={action.isPending} onClick={() => {
        if (confirm(`${order.title} ×${order.quantity} выдан игроку ${name(order.userId)}${method ? " и оплата получена" : " в долг"}?`)) action.mutate({ orderId: order.id, verb: "fulfil", method });
      }}>Выдано</Button>
    </div>
  </aside>;
}
