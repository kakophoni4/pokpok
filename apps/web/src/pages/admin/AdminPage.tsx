import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { Button, Loading, PageHeader, Tabs } from "../../components/ui";
import { AdminAchievements } from "./AdminAchievements";
import { AdminDealers } from "./AdminDealers";
import { LiveStaffPage, LiveSetup } from "../LivePages";
import { AdminPlayers } from "./AdminPlayers";
import { AdminSales } from "./AdminSales";
import { AdminSeasons } from "./AdminSeasons";
import { AdminSettings } from "./AdminSettings";
import { AdminTournaments } from "./AdminTournaments";

import { ClubBrand } from "../../components/ClubBrand";
import { HostAccess } from "./HostAccess";
import { AdminStaff } from "./AdminStaff";
import "../host-workspace.css";
import "./admin-workspace.css";

type Tab =
  | "staff"
  | "structures"
  | "dealers"
  | "tournaments"
  | "game"
  | "players"
  | "achievements"
  | "seasons"
  | "settings"
  | "sales";

export function AdminPage() {
  const { status, can, user, logout, loginAsAdmin } = useAuth();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("game");
  const isAdmin = can("admin");

  if (status === "loading") return <Loading />;
  if (!isAdmin) return <main className="host-login-shell"><form className="host-login card" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    try { await loginAsAdmin(nickname.trim(), password); setPassword(""); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }}><ClubBrand /><h1>Вход для администратора</h1>
    <label htmlFor="admin-login">Логин</label><input id="admin-login" className="field" autoComplete="username" required maxLength={24} value={nickname} onChange={e => setNickname(e.target.value)} />
    <label htmlFor="admin-password">Пароль</label><input id="admin-password" className="field" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
    {error && <p role="alert" className="text-chip-red">{error}</p>}<Button type="submit" loading={busy}>Войти</Button>
  </form></main>;

  const options: { value: Tab; label: string }[] = [
    { value: "game", label: "Вечер" },
    { value: "players", label: "Игроки" },
    { value: "staff", label: "Персонал" },
    { value: "achievements", label: "Ачивки" },
    ...(isAdmin
      ? ([
          { value: "tournaments", label: "Расписание" },
          { value: "seasons", label: "Сезоны" },
          { value: "settings", label: "Клуб" },
          { value: "sales", label: "Учёт" },
          { value: "dealers", label: "Дилеры" },
          { value: "structures", label: "Структуры" },
        ] as const)
      : []),
  ];

  return (
    <div className="admin-workspace workspace-app">
      <header className="host-workspace-header"><ClubBrand /><strong>Администратор</strong><span>{user?.nickname}</span><Link to="/">На сайт</Link><Button variant="ghost" onClick={() => void logout()}>Выйти</Button></header>
      <main className="admin-page workspace-shell">
      <PageHeader title="Управление клубом" />

      <details className="admin-own-access"><summary>Пароль администратора</summary><HostAccess userId={user!.id} nickname={user!.nickname} role="admin" /></details>
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <Tabs value={tab} onChange={setTab} options={options} />
        </aside>
        <div className="admin-content">
          {tab === "staff" && <AdminStaff />}
          {tab === "game" && <LiveStaffPage />}
          {tab === "tournaments" && isAdmin && <AdminTournaments canDelete />}
          {tab === "players" && (
            <AdminPlayers canEdit canChangeRole={isAdmin} />
          )}
          {tab === "achievements" && <AdminAchievements canEdit />}
          {tab === "seasons" && isAdmin && <AdminSeasons />}
          {tab === "settings" && isAdmin && <AdminSettings />}
          {tab === "structures" && isAdmin && (
            <LiveSetup id="" saved={() => {}} />
          )}
          {tab === "dealers" && isAdmin && <AdminDealers />}
          {tab === "sales" && isAdmin && <AdminSales />}
        </div>
      </div>
      </main>
    </div>
  );
}
