import { useState } from "react";
import { useAuth } from "../auth/auth-context";
import { ClubBrand } from "../components/ClubBrand";
import { Button, Loading } from "../components/ui";
import { LiveStaffPage } from "./LivePages";
import "./host-workspace.css";
import "./floor-workspace.css";

export function FloorPage() {
  const auth = useAuth();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (auth.status === "loading") return <Loading />;
  if (auth.user?.role === "floor" || auth.user?.role === "admin") return <div className="floor-workspace">
    <header className="host-workspace-header"><ClubBrand /><strong>Флор</strong><span>{auth.user.nickname}</span><Button variant="ghost" onClick={() => void auth.logout()}>Выйти</Button></header>
    <main><LiveStaffPage floorWorkspace /></main>
  </div>;
  return <main className="host-login-shell">
    <form className="host-login card" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { await auth.loginAsFloor(nickname.trim(), password); setPassword(""); }
      catch (err) { setError((err as Error).message); }
      finally { setBusy(false); }
    }}>
      <ClubBrand /><h1>Вход для флора</h1>
      <label htmlFor="floor-login">Логин</label>
      <input id="floor-login" className="field" autoComplete="username" value={nickname} onChange={e => setNickname(e.target.value)} required maxLength={24} />
      <label htmlFor="floor-password">Пароль</label>
      <input id="floor-password" className="field" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={128} />
      {error && <p role="alert" className="text-chip-red">{error}</p>}
      <Button type="submit" loading={busy}>Войти</Button>
    </form>
  </main>;
}
