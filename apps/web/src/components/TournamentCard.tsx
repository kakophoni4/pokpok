import type { TournamentSummary } from "@poker/contracts";
import { tournamentCoverUrl } from "@poker/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDayMonth, formatTime, formatWeekday, formatNumber, TOURNAMENT_STATUS_LABELS } from "../lib/format";
import { useTournament } from "../lib/queries";
import { RegisterButton } from "./RegisterButton";
import { ErrorState, Loading } from "./ui";

export function TournamentCard({ tournament: t, featured = false, coverId = t.coverId ?? 1 }: { tournament: TournamentSummary; featured?: boolean; coverId?: number }) {
  const [expanded, setExpanded] = useState(false);
  const finished = t.status === "finished";
  const registered = t.myRegistration && t.myRegistration.status !== "cancelled";
  const waiting = t.myRegistration?.status === "waitlist";
  const full = t.capacity != null && t.registeredCount >= t.capacity;
  const progress = t.capacity ? Math.min(100, t.registeredCount / t.capacity * 100) : 0;
  return (
    <li className={`schedule-event ${finished ? "schedule-event-finished" : ""} ${featured ? "schedule-event-featured" : ""} ${registered ? "schedule-event-registered" : ""}`}>
      <img className="event-cover" src={tournamentCoverUrl(coverId)} alt="" loading={featured ? "eager" : "lazy"} decoding="async" />
      <div className="event-content">
      {featured && <p className="event-feature-label">Ближайшая игра</p>}
      <div className="event-topline">
        <time dateTime={t.startsAt}>{formatDayMonth(t.startsAt)} <span>· {formatWeekday(t.startsAt)}</span></time>
        <span className={`event-status ${finished ? "" : "event-status-live"}`}>{TOURNAMENT_STATUS_LABELS[t.status] ?? t.status}</span>
      </div>
      <Link to={`/t/${t.id}`} className="event-title-link">
        <span className="event-start-time nums">{formatTime(t.startsAt)}</span>
        <h2>{t.title}</h2>
      </Link>
      {t.venue && <p className="event-venue">{t.venue.address ?? t.venue.title}</p>}
      {(t.ratingMultiplier > 1 || !!t.minRating) && <div className="event-tags">
        {t.ratingMultiplier > 1 && <span>x{t.ratingMultiplier} рейтинг</span>}
        {!!t.minRating && <span>От {formatNumber(t.minRating)} очков</span>}
      </div>}
      {!finished && <div className="event-enrollment">
        <div className="event-enrollment-line"><span>{t.registeredCount}{t.capacity != null && ` / ${t.capacity}`} участников</span>
          <span className={registered ? "event-personal-status" : ""}>{registered ? (waiting ? `В ожидании №${t.myRegistration?.waitlistPosition}` : "Вы записаны") : full ? "Мест нет" : t.capacity != null ? `${t.capacity-t.registeredCount} свободно` : ""}</span>
        </div>
        {t.capacity != null && <div className="event-progress" aria-hidden><span style={{width:`${progress}%`}} /></div>}
        {t.waitlistCount > 0 && <p className="event-waitlist">+ {t.waitlistCount} в ожидании</p>}
      </div>}
      {!finished && <details className="event-disclosure" onToggle={event => setExpanded(event.currentTarget.open)}>
        <summary>Подробнее<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></summary>
        {expanded && <TournamentParameters id={t.id} />}
      </details>}
      <div className="event-action">{finished ? <Link className="event-results" to={`/t/${t.id}`}>Результаты <span aria-hidden>↗</span></Link> : <RegisterButton tournament={t} />}</div>
      </div>
    </li>
  );
}

function TournamentParameters({ id }: { id: string }) {
  const detail = useTournament(id);
  if (detail.isPending) return <Loading label="Загружаем параметры…" />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const t = detail.data;
  if (!t) return null;
  return <div className="event-parameters">
    <dl><div><dt>Стартовый стек</dt><dd>{formatNumber(t.startingStack)}</dd></div>
      <div><dt>Адон</dt><dd>{formatNumber(t.addonChips)}</dd></div>
      {t.regClosesAt && <div><dt>Регистрация до</dt><dd>{formatTime(t.regClosesAt)}</dd></div>}
      {t.capacity != null && <div><dt>Макс. участников</dt><dd>{t.capacity}</dd></div>}
    </dl>
    {t.description && !/Спортивный покер без денежных ставок\. Приходите за 30 минут/i.test(t.description) && <p>{t.description}</p>}
    <Link to={`/t/${id}`}>Страница турнира ↗</Link>
  </div>;
}
