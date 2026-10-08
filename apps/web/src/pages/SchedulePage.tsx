import { useState } from "react";
import { Link } from "react-router-dom";
import { TournamentCard } from "../components/TournamentCard";
import { ClubBrand } from "../components/ClubBrand";
import {
  Button,
  EmptyState,
  ErrorState,
  Loading,
  Tabs,
} from "../components/ui";
import { useActiveSeason, useTournaments } from "../lib/queries";
import { formatDayMonth, formatWeekday, toClubParts } from "../lib/format";

export function SchedulePage() {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const [visible, setVisible] = useState(8);
  const tournaments = useTournaments(scope);
  const season = useActiveSeason();
  const rows = tournaments.data ?? [];
  const groups = new Map<string, typeof rows>();
  for (const row of rows.slice(0, visible)) {
    const day = toClubParts(row.startsAt).date;
    const group = groups.get(day) ?? [];
    group.push(row);
    groups.set(day, group);
  }
  return (
    <div className="schedule-page">
      <section className="club-cover" aria-label="CONCEPT poker club">
        <div className="club-cover-content">
          <p className="eyebrow">Покерный клуб · Ульяновск</p>
          <ClubBrand />
          <h1>За одним столом.</h1>
          <p className="cover-address">Гагарина, 25</p>
          <Link to="/rating" className="editorial-link">
            Рейтинг сезона <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="club-cover-image">
          <img
            src="/images/club-blue.webp"
            className="club-cover-photo"
            alt="Игра в клубе CONCEPT"
            fetchPriority="high"
          />
          <span className="photo-credit">CONCEPT / ЗА СТОЛОМ</span>
        </div>
      </section>
      <section className="schedule-section" aria-label="Расписание">
        <header className="schedule-heading">
          <div>
            <p className="eyebrow">{season.data?.title ?? "Клубные вечера"}</p>
            <h2>Расписание</h2>
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
        {Array.from(groups, ([day, events]) => (
          <section className="schedule-day" key={day}>
            <h3 className="schedule-date">
              <time dateTime={day}>{formatDayMonth(events[0]!.startsAt)}</time>
              <span>{formatWeekday(events[0]!.startsAt)}</span>
            </h3>
            <ul className="schedule-list">
              {events.map((event) => (
                <TournamentCard key={event.id} tournament={event} />
              ))}
            </ul>
          </section>
        ))}
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
    </div>
  );
}
