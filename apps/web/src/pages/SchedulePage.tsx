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
import { useActiveSeason, useTournaments } from "../lib/queries";
import { scheduleCoverIds } from "../lib/tournament-covers";


export function SchedulePage() {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [visible, setVisible] = useState(8);
  const tournaments = useTournaments(scope);
  const season = useActiveSeason();
  const rows = tournaments.data ?? [];
  const [venueId, setVenueId] = useState("");
  const venues = Array.from(new Map(rows.filter(row => row.venue).map(row => [row.venue!.id, row.venue!])).values());
  const selectedVenue = venues.some(venue => venue.id === venueId) ? venueId : "";
  const filtered = selectedVenue ? rows.filter(row => row.venue?.id === selectedVenue) : rows;
  const covers = scheduleCoverIds(rows);
  const nearest = scope === "upcoming" ? filtered.reduce<typeof filtered[number] | undefined>((first, event) => !first || event.startsAt < first.startsAt ? event : first, undefined)?.id : undefined;
  return (
    <div className="schedule-page">
      <section className="schedule-section" aria-label="Расписание">
        <header className="schedule-heading">
          <div>
            <p className="eyebrow">{season.data?.title ?? "Клубные вечера"}</p>
            <h1>Расписание</h1>
          </div>
          <Tabs
            value={scope}
            onChange={(next) => {
              setScope(next);
              setVisible(8);
              setVenueId("");
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
        {venues.length > 1 && <div className="schedule-venue-filter" role="group" aria-label="Место проведения">
          <button type="button" aria-pressed={!selectedVenue} onClick={() => { setVenueId(""); setVisible(8); }}>Все адреса</button>
          {venues.map(venue => <button type="button" key={venue.id} aria-pressed={selectedVenue === venue.id} onClick={() => { setVenueId(venue.id); setVisible(8); }}>{venue.address ?? venue.title}</button>)}
        </div>}
        <ul className="schedule-event-grid">
          {filtered.slice(0, visible).map(event => <TournamentCard key={event.id} tournament={event} featured={event.id === nearest} coverId={covers.get(event.id)} />)}
        </ul>
        {filtered.length > visible && (
          <div className="load-more">
            <Button
              variant="secondary"
              onClick={() => setVisible((n) => n + 8)}
            >
              Показать ещё
            </Button>
            <span>
              {visible} из {filtered.length}
            </span>
          </div>
        )}
      </section>
      <ClubOverview fallbackVenues={venues} />
      <ScheduleFaq />
    </div>
  );
}
