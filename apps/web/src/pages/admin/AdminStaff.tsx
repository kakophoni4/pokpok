import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS } from "@poker/contracts";
import { api } from "../../lib/api";
import { Button, Card, ErrorState, Loading } from "../../components/ui";
import { HostAccess } from "./HostAccess";

type Role = "dealer" | "hostess" | "floor" | "admin";
type Staff = { id: string; nickname: string; role: Role; status: string };
export function AdminStaff() {
  const qc = useQueryClient();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("dealer");
  const staff = useQuery({ queryKey: ["staff-accounts"], queryFn: () => api.get<Staff[]>("/auth/staff") });
  const create = useMutation({ mutationFn: () => api.post("/auth/staff", { nickname: nickname.trim(), password, role }), onSuccess: () => {
    setNickname(""); setPassword("");
    for (const key of ["staff-accounts", "players", "live-staff"]) void qc.invalidateQueries({ queryKey: [key] });
  } });
  return <div className="space-y-4">
    <Card><h2 className="text-xl font-semibold mb-4">Создать сотрудника</h2>
      <form className="staff-create-form" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
        <label>Логин<input className="field" autoComplete="off" required minLength={2} maxLength={24} pattern="[A-Za-zА-Яа-яЁё0-9._-]+" value={nickname} onChange={e => { setNickname(e.target.value); create.reset(); }} /></label>
        <label>Пароль<input className="field" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => { setPassword(e.target.value); create.reset(); }} /></label>
        <label>Роль<select className="field" value={role} onChange={e => { setRole(e.target.value as Role); create.reset(); }}>{(["dealer", "hostess", "floor", "admin"] as Role[]).map(value => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}</select></label>
        <Button type="submit" loading={create.isPending}>Создать</Button>
      </form>
      {create.isSuccess && <p role="status" className="mt-3">Сотрудник создан.</p>}{create.isError && <ErrorState error={create.error} />}
    </Card>
    {staff.isPending && <Loading />}{staff.isError && <ErrorState error={staff.error} />}
    {staff.data?.map(user => <Card key={user.id}><details><summary className="cursor-pointer"><strong>{user.nickname}</strong> · {ROLE_LABELS[user.role]}{user.status === "blocked" ? " · заблокирован" : ""}</summary><HostAccess userId={user.id} nickname={user.nickname} role={user.role} /></details></Card>)}
  </div>;
}
