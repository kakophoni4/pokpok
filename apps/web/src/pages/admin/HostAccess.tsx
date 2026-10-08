import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Button } from "../../components/ui";

export function HostAccess({ userId, nickname, role = "hostess" }: { userId: string; nickname: string; role?: "hostess" | "floor" | "admin" | "dealer" }) {
  const route = role === "hostess" ? "host" : role;
  const label = ({ floor: "флора", hostess: "хостес", admin: "администратора", dealer: "дилера" })[role];
  const [password, setPassword] = useState("");
  const save = useMutation({ mutationFn: () => api.post(role === "dealer" ? "/dealer/password" : `/auth/${route}/password`, { userId, password }), onSuccess: () => setPassword("") });
  return <section className="space-y-2 border-t border-white/10 pt-3">
    <p>Вход {label}: <a href={`/${route}`} className="text-gold-500">/{route}</a> · логин <strong>{nickname}</strong></p>
    <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <label className="sr-only" htmlFor={`host-password-${userId}`}>Новый пароль {label}</label>
      <input id={`host-password-${userId}`} className="field max-w-80" type="password" autoComplete="new-password" placeholder="Новый пароль · от 8 символов" minLength={8} maxLength={128} required value={password} onChange={e => { setPassword(e.target.value); save.reset(); }} />
      <Button type="submit" loading={save.isPending}>Задать пароль</Button>
    </form>
    {save.isSuccess && <p role="status">Пароль сохранён.</p>}
    {save.isError && <p role="alert" className="text-chip-red">{save.error.message}</p>}
  </section>;
}
