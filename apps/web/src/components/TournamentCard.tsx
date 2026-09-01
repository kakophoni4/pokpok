import type { TournamentSummary } from "@poker/contracts";
import { Link } from "react-router-dom";
import { formatRelativeDay, formatTime, formatWeekday, plural } from "../lib/format";
import { RegisterButton } from "./RegisterButton";
import { Badge, cx } from "./ui";

export function TournamentCard({ tournament }: { tournament: TournamentSummary }) {
  const seatsLeft =
    tournament.capacity == null ? null : tournament.capacity - tournament.registeredCount;
  const isFull = seatsLeft != null && seatsLeft <= 0;
  const isFinished = tournament.status === "finished";

  return (
    <li className="card overflow-hidden">
      <Link to={`/t/${tournament.id}`} className="block p-4 transition hover:bg-felt-800/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{tournament.title}</h3>
            <p className="mt-0.5 text-sm text-stone-400">
              {formatWeekday(tournament.startsAt)}, {formatRelativeDay(tournament.startsAt)} в{" "}
              <span className="nums text-stone-300">{formatTime(tournament.startsAt)}</span>
            </p>
            {tournament.venue && (
              <p className="mt-0.5 truncate text-xs text-stone-500">
                {tournament.venue.address ?? tournament.venue.title}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {tournament.ratingMultiplier > 1 && (
              <Badge tone="gold">×{tournament.ratingMultiplier} рейтинг</Badge>
            )}
            <Badge>{tournament.paidPlaces} призовых</Badge>
            {tournament.minRating != null && tournament.minRating > 0 && (
              <Badge tone="blue">мин. {tournament.minRating} очков</Badge>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-400">
          <span className="nums">
            {tournament.registeredCount}
            {tournament.capacity != null && ` / ${tournament.capacity}`} участников
          </span>

          {tournament.waitlistCount > 0 && (
            <span className="nums text-stone-500">
              + {tournament.waitlistCount} в ожидании
            </span>
          )}

          {!isFinished && seatsLeft != null && seatsLeft > 0 && seatsLeft <= 3 && (
            <span className={cx("font-medium", seatsLeft === 1 ? "text-chip-red" : "text-gold-400")}>
              {seatsLeft === 1
                ? "последнее место"
                : `осталось ${seatsLeft} ${plural(seatsLeft, "место", "места", "мест")}`}
            </span>
          )}

          {!isFinished && isFull && <Badge tone="red">Мест нет</Badge>}
          {isFinished && <Badge tone="neutral">Завершён</Badge>}

          {tournament.myRegistration &&
            tournament.myRegistration.status !== "cancelled" && (
              <Badge tone={tournament.myRegistration.status === "waitlist" ? "blue" : "green"}>
                {tournament.myRegistration.status === "waitlist"
                  ? `В ожидании №${tournament.myRegistration.waitlistPosition}`
                  : "Вы записаны"}
              </Badge>
            )}
        </div>
      </Link>

      {!isFinished && (
        <div className="border-t border-felt-800 px-4 py-3">
          <RegisterButton tournament={tournament} />
        </div>
      )}
    </li>
  );
}
