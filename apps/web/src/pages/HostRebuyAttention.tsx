import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LiveOrder } from "@poker/contracts";
import { Button } from "../components/ui";
import { api } from "../lib/api";

export function HostRebuyAttention({ id, orders, name, onSelect }: {
  id: string; orders: LiveOrder[]; name: (id: string) => string;
  onSelect: (userId: string) => void;
}) {
  const qc = useQueryClient();
  const action = useMutation({
    mutationFn: ({ orderId, verb }: { orderId: string; verb: "fulfil" | "cancel" }) => api.post(`/live/${id}/orders/${orderId}/${verb}`),
    onSuccess: async () => {
      await Promise.all(["live", "account", "host-detail"].map(key => qc.invalidateQueries({ queryKey: [key] })));
    },
  });
  const order = orders[0];
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
      <Button loading={action.isPending} onClick={() => {
        if (confirm(`${order.title} ×${order.quantity} выдан игроку ${name(order.userId)}?`)) action.mutate({ orderId: order.id, verb: "fulfil" });
      }}>Выдано</Button>
    </div>
  </aside>;
}
