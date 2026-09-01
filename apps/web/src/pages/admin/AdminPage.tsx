import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { Loading, PageHeader, Tabs } from "../../components/ui";
import { AdminAchievements } from "./AdminAchievements";
import { AdminGame } from "./AdminGame";
import { AdminPlayers } from "./AdminPlayers";
import { AdminSeasons } from "./AdminSeasons";
import { AdminSettings } from "./AdminSettings";
import { AdminTournaments } from "./AdminTournaments";

type Tab = "tournaments" | "game" | "players" | "achievements" | "seasons" | "settings";

export function AdminPage() {
  const { status, can } = useAuth();
  const [tab, setTab] = useState<Tab>("game");

  if (status === "loading") return <Loading />;
  if (!can("admin")) return <Navigate to="/" replace />;

  return (
    <>
      <PageHeader title="Управление клубом" />

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "game", label: "Вечер" },
          { value: "tournaments", label: "Расписание" },
          { value: "players", label: "Игроки" },
          { value: "achievements", label: "Ачивки" },
          { value: "seasons", label: "Сезоны" },
          { value: "settings", label: "Клуб" },
        ]}
      />

      {tab === "game" && <AdminGame />}
      {tab === "tournaments" && <AdminTournaments canDelete />}
      {tab === "players" && <AdminPlayers canEdit />}
      {tab === "achievements" && <AdminAchievements canEdit />}
      {tab === "seasons" && <AdminSeasons />}
      {tab === "settings" && <AdminSettings />}
    </>
  );
}
