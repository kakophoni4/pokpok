import { useState } from "react";
import { TournamentCard } from "../components/TournamentCard";
import { ClubOverview } from "../components/ClubOverview";
import { ScheduleFaq } from "../components/ScheduleFaq";
import {
  Button,
  EmptyState,
  ErrorState,
  Loading,
  Tabs,
} from "../components/ui";
import { useTournaments } from "../lib/queries";
import { scheduleCoverIds } from "../lib/tournament-covers";


export function SchedulePage() {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [visible, setVisible] = useState(8);
  const tournaments = useTournaments(scope);
  const rows = tournaments.data ?? [];
  const covers = scheduleCoverIds(rows);
  const nearest = scope === "upcoming" ? rows.reduce<typeof rows[number] | undefined>((first, event) => !first || event.startsAt < first.startsAt ? event : first, undefined)?.id : undefined;
  return (
    <div className="schedule-page">
      <section className="schedule-section" aria-label="Расписание">
        <header className="schedule-heading">
          <div className="section-masthead">
            <h1>Расписание турниров</h1>
            <p>Ближайшие игры <span>· UTC+4</span></p>
          </div>
          <Tabs
            value={scope}
            onChange={(next) => {
              setScope(next);
              setVisible(8);
            }}
            options={[
              { value: "upcoming", label: "Текущие" },
              { value: "past", label: "Завершённые" },
            ]}
          />
        </header>
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
          />
        )}
        <ul className="schedule-event-grid">
          {rows.slice(0, visible).map(event => <TournamentCard key={event.id} tournament={event} featured={event.id === nearest} coverId={covers.get(event.id)} />)}
        </ul>
        {rows.length > visible && (
          <div className="load-more">
            <Button
              variant="secondary"
              onClick={() => setVisible((n) => n + 8)}
            >
              Показать ещё
            </Button>
            <span>
              {visible} из {rows.length}
            </span>
          </div>
        )}
      </section>
      <ClubOverview />
      <ScheduleFaq />
    </div>
  );
}
