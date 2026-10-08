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
import { ClubBrand } from "../components/ClubBrand";

export function SchedulePage() {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const tournaments = useTournaments(scope);
  const season = useActiveSeason();

  return (
    <>
      <section className="club-cover mb-7" aria-label="CONCEPT poker club">
        <img
          src="/images/club-blue.png"
          className="club-cover-photo"
          alt="За игровым столом CONCEPT"
          fetchPriority="high"
        />
        <div className="club-cover-content">
          <ClubBrand />
          <p className="text-sm tracking-[.18em] uppercase mt-3 text-white/75">
            Poker club
          </p>
          <p className="text-sm text-white/60 mt-6">Гагарина, 25</p>
        </div>
      </section>
      <PageHeader
        title="Расписание игр"
        subtitle={
          season.data ? `${season.data.title} - идёт сейчас` : undefined
        }
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
        <ul className="grid gap-4 sm:grid-cols-2">
          {tournaments.data.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} />
          ))}
        </ul>
      )}
    </>
  );
}
