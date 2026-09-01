import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { Loading, PageHeader, Tabs } from "../../components/ui";
import { AdminAchievements } from "./AdminAchievements";
import { AdminGame } from "./AdminGame";
import { AdminPlayers } from "./AdminPlayers";
import { AdminSales } from "./AdminSales";
import { AdminSeasons } from "./AdminSeasons";
import { AdminSettings } from "./AdminSettings";
import { AdminTournaments } from "./AdminTournaments";

type Tab = "tournaments" | "game" | "players" | "achievements" | "seasons" | "settings" | "sales";

export function AdminPage() {
  const { status, can } = useAuth();
  const [tab, setTab] = useState<Tab>("game");
  const isAdmin = can("admin");

  if (status === "loading") return <Loading />;
  if (!can("hostess")) return <Navigate to="/" replace />;

  const options: { value: Tab; label: string }[] = [
    { value: "game", label: "Вечер" },
    { value: "players", label: "Игроки" },
    { value: "achievements", label: "Ачивки" },
    ...(isAdmin
      ? ([
          { value: "tournaments", label: "Расписание" },
          { value: "seasons", label: "Сезоны" },
          { value: "settings", label: "Клуб" },
          { value: "sales", label: "Учёт" },
        ] as const)
      : []),
  ];

  return (
    <>
      <PageHeader title="Управление клубом" />

      <Tabs value={tab} onChange={setTab} options={options} />

      {tab === "game" && <AdminGame />}
      {tab === "tournaments" && isAdmin && <AdminTournaments canDelete />}
      {tab === "players" && <AdminPlayers canEdit canChangeRole={isAdmin} />}
      {tab === "achievements" && <AdminAchievements canEdit />}
      {tab === "seasons" && isAdmin && <AdminSeasons />}
      {tab === "settings" && isAdmin && <AdminSettings />}
      {tab === "sales" && isAdmin && <AdminSales />}
    </>
  );
}
