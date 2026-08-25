import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { Loading, PageHeader, Tabs } from "../../components/ui";
import { AdminAchievements } from "./AdminAchievements";
import { AdminPlayers } from "./AdminPlayers";
import { AdminResults } from "./AdminResults";
import { AdminTournaments } from "./AdminTournaments";

type Tab = "tournaments" | "results" | "players" | "achievements";

export function AdminPage() {
  const { status, can } = useAuth();
  const [tab, setTab] = useState<Tab>("tournaments");

  if (status === "loading") return <Loading />;
  if (!can("moderator")) return <Navigate to="/" replace />;

  const isAdmin = can("admin");

  return (
    <>
      <PageHeader title="Управление клубом" subtitle="Турниры, результаты, игроки и достижения" />

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "tournaments", label: "Турниры" },
          { value: "results", label: "Результаты" },
          { value: "players", label: "Игроки" },
          { value: "achievements", label: "Ачивки" },
        ]}
      />

      {tab === "tournaments" && <AdminTournaments canDelete={isAdmin} />}
      {tab === "results" && <AdminResults />}
      {tab === "players" && <AdminPlayers canEdit={isAdmin} />}
      {tab === "achievements" && <AdminAchievements canEdit={isAdmin} />}
    </>
  );
}
