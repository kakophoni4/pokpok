import type { TournamentSummary } from "@poker/contracts";
import { Link } from "react-router-dom";
import { formatRelativeDay, formatTime, formatWeekday } from "../lib/format";
import { RegisterButton } from "./RegisterButton";

export function TournamentCard({
  tournament: t,
}: {
  tournament: TournamentSummary;
}) {
  const finished = t.status === "finished";
  const registered =
    t.myRegistration && t.myRegistration.status !== "cancelled";
  const waiting = t.myRegistration?.status === "waitlist";
  return (
    <li className="tournament-card">
      <Link to={`/t/${t.id}`}>
        <div className="tournament-topline">
          <time dateTime={t.startsAt}>
            {formatWeekday(t.startsAt)} · {formatRelativeDay(t.startsAt)}
          </time>
          <span>{finished ? "Завершён" : "Турнир"}</span>
        </div>
        <div className="tournament-main">
          <span className="tournament-time">{formatTime(t.startsAt)}</span>
          <div className="min-w-0">
            <h3>{t.title}</h3>
            {t.venue && <p>{t.venue.address ?? t.venue.title}</p>}
          </div>
        </div>
        <div className="tournament-metadata">
          <span>{t.paidPlaces} призовых мест</span>
          {!finished &&
            t.capacity != null &&
            t.registeredCount >= t.capacity && (
              <span className="text-chip-red">Мест нет</span>
            )}
          {t.ratingMultiplier > 1 && (
            <span className="text-gold-400">x{t.ratingMultiplier} рейтинг</span>
          )}
          {!!t.minRating && (
            <span>От {t.minRating.toLocaleString("ru-RU")} очков</span>
          )}
          {!finished && t.waitlistCount > 0 && (
            <span>+ {t.waitlistCount} в ожидании</span>
          )}
        </div>
      </Link>
      <div className="tournament-footer">
        {!finished && (
          <span
            className={
              registered ? "tournament-registration" : "tournament-capacity"
            }
          >
            {registered ? (
              waiting ? (
                `В ожидании №${t.myRegistration?.waitlistPosition}`
              ) : (
                "Вы записаны"
              )
            ) : (
              <>
                {t.registeredCount}
                {t.capacity != null && ` / ${t.capacity}`} участников
              </>
            )}
          </span>
        )}
        {finished ? (
          <Link className="text-gold-400" to={`/t/${t.id}`}>
            Результаты ↗
          </Link>
        ) : (
          <RegisterButton tournament={t} />
        )}
      </div>
    </li>
  );
}
