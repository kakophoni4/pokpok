import { useState } from "react";
import { TournamentCard } from "../components/TournamentCard";
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Tabs,
} from "../components/ui";
import { useActiveSeason, useTournaments } from "../lib/queries";
import { Link } from "react-router-dom";

export function SchedulePage() {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const tournaments = useTournaments(scope);
  const season = useActiveSeason();

  return (
    <>
      <section className="club-cover" aria-label="CONCEPT poker club">
        <img
          src="/images/concept-felt-v3.webp"
          className="club-cover-photo"
          alt="Фишки и карты на синем сукне"
          fetchPriority="high"
        />
        <div className="club-cover-content">
          <p className="eyebrow">Ульяновск · Poker club</p>
          <h1>
            Увидимся
            <br />
            <span>за столом.</span>
          </h1>
          <Link to="/rating" className="editorial-link">
            Рейтинг сезона <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="cover-caption">
          <span>CONCEPT</span>
          <span>Гагарина, 25</span>
        </div>
      </section>
      <PageHeader
        title={scope === "upcoming" ? "Ближайшие игры" : "Прошедшие игры"}
        subtitle={season.data ? season.data.title : undefined}
      />

      <Tabs
        value={scope}
        onChange={setScope}
        options={[
          { value: "upcoming", label: "Текущие" },
          { value: "past", label: "Завершённые" },
        ]}
      />

      {tournaments.isPending && <Loading label="Загружаем расписание…" />}
      {tournaments.isError && (
        <ErrorState
          error={tournaments.error}
          onRetry={() => void tournaments.refetch()}
        />
      )}

      {tournaments.data?.length === 0 && (
        <EmptyState
          title={
            scope === "upcoming"
              ? "Игр пока не назначено"
              : "Завершённых игр нет"
          }
          description={
            scope === "upcoming"
              ? "Как только организатор опубликует турнир, он появится здесь."
              : "Здесь появятся результаты сыгранных турниров."
          }
        />
      )}

      {tournaments.data && tournaments.data.length > 0 && (
        <ul className="schedule-grid grid gap-4 sm:grid-cols-2">
          {tournaments.data.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} />
          ))}
        </ul>
      )}
    </>
  );
}
