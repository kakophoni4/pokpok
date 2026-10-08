import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Button } from "../../components/ui";

export function HostAccess({ userId, nickname }: { userId: string; nickname: string }) {
  const [password, setPassword] = useState("");
  const save = useMutation({ mutationFn: () => api.post("/auth/host/password", { userId, password }), onSuccess: () => setPassword("") });
  return <section className="space-y-2 border-t border-white/10 pt-3">
    <p>Вход хостес: <a href="/host" className="text-gold-500">/host</a> · логин <strong>{nickname}</strong></p>
    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <label className="sr-only" htmlFor={`host-password-${userId}`}>Новый пароль хостес</label>
      <input id={`host-password-${userId}`} className="field max-w-80" type="password" autoComplete="new-password" placeholder="Новый пароль · от 8 символов" minLength={8} maxLength={128} required value={password} onChange={e => { setPassword(e.target.value); save.reset(); }} />
      <Button type="submit" loading={save.isPending}>Задать пароль</Button>
    </form>
    {save.isSuccess && <p role="status">Пароль сохранён.</p>}
    {save.isError && <p role="alert" className="text-chip-red">{save.error.message}</p>}
  </section>;
}
