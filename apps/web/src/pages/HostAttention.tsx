import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { LiveAlert } from "@poker/contracts";
import { Button } from "../components/ui";
import { api } from "../lib/api";

export function HostAttention({ id, alerts, name, onSelect }: {
  id: string; alerts: LiveAlert[]; name: (id: string) => string;
  onSelect: (userId: string, final: boolean) => void;
}) {
  const qc = useQueryClient();
  const ack = useMutation({
    mutationFn: (alertId: string) => api.post(`/live/${id}/actions`, { type: "ack", alertId }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["live", id] }); },
  });
  // Text fallback keeps alerts created before the structured kind field visible.
  const waiting = alerts.filter(a => !a.acknowledgedBy && (a.kind === "bust" || /^(Без стека|Завершил игру)\./.test(a.text)));
  const alert = waiting[0];
  const { reset } = ack;
  useEffect(() => { reset(); }, [alert?.id, reset]);
  if (!alert) return null;
  const final = alert.text.startsWith("Завершил игру");
  return <aside key={alert.id} className="host-attention" role="alert" aria-label="Сигнал от дилера">
    <div className="host-attention-icon" aria-hidden="true">!</div>
    <div className="host-attention-message">
      <div className="host-attention-status"><strong>{final ? "Завершил игру" : "Без стека"}</strong><span>{waiting.length > 1 ? `Ещё ${waiting.length - 1}` : "Дилер"}</span></div>
      <h2>{name(alert.userId)}{alert.table != null && <small>Стол {alert.table}{alert.seat != null ? ` · место ${alert.seat}` : ""}</small>}</h2>
      <p>{alert.text.replace(/^(Без стека|Завершил игру)\.\s*/, "")}</p>
      {ack.isError && <p className="text-chip-red">{ack.error.message}</p>}
    </div>
    <div className="host-attention-actions"><Button variant="secondary" onClick={() => onSelect(alert.userId, final)}>К игроку</Button><Button loading={ack.isPending} onClick={() => ack.mutate(alert.id)}>Принято</Button></div>
  </aside>;
}
