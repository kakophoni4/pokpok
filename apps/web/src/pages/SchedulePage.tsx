import { useState } from "react";
import { TournamentCard } from "../components/TournamentCard";
import { EmptyState, ErrorState, Loading, PageHeader, Tabs } from "../components/ui";
import { useActiveSeason, useTournaments } from "../lib/queries";

export function SchedulePage() {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const tournaments = useTournaments(scope);
  const season = useActiveSeason();

  return (
    <>
      <PageHeader
        title="Расписание игр"
        subtitle={season.data ? `${season.data.title} — идёт сейчас` : undefined}
      />

      <Tabs
        value={scope}
        onChange={setScope}
        options={[
          { value: "upcoming", label: "Предстоящие" },
          { value: "past", label: "Прошедшие" },
        ]}
      />

      {tournaments.isPending && <Loading label="Загружаем расписание…" />}
      {tournaments.isError && (
        <ErrorState error={tournaments.error} onRetry={() => void tournaments.refetch()} />
      )}

      {tournaments.data?.length === 0 && (
        <EmptyState
          icon={scope === "upcoming" ? "🗓" : "📜"}
          title={scope === "upcoming" ? "Игр пока не назначено" : "Прошедших игр нет"}
          description={
            scope === "upcoming"
              ? "Как только организатор опубликует турнир, он появится здесь, а бот пришлёт уведомление."
              : "Здесь появятся результаты сыгранных турниров."
          }
        />
      )}

      {tournaments.data && tournaments.data.length > 0 && (
        <ul className="space-y-3">
          {tournaments.data.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} />
          ))}
        </ul>
      )}
    </>
  );
}
