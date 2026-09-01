import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { RegisterButton } from "../components/RegisterButton";
import {
  Avatar,
  Badge,
  Card,
  ErrorState,
  Loading,
  cx,
} from "../components/ui";
import {
  formatFullDate,
  formatNumber,
  formatPoints,
  formatTime,
  formatWeekday,
  placeLabel,
  playerLabel,
  REGISTRATION_STATUS_LABELS,
  TOURNAMENT_STATUS_LABELS,
} from "../lib/format";
import { useTournament } from "../lib/queries";
import { platform } from "../platform/platform";

export function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = useTournament(id);

  // Inside Telegram, the native back button should work like the browser's.
  useEffect(() => {
    platform.backButton(() => navigate(-1));
    return () => platform.backButton(null);
  }, [navigate]);

  if (isPending) return <Loading />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const seated = data.registrations.filter((row) => row.status !== "waitlist");
  const waiting = data.registrations.filter((row) => row.status === "waitlist");
  const hasResults = data.results.length > 0;

  return (
    <>
      <Link to="/" className="mb-3 inline-block text-sm text-stone-400 hover:text-stone-200">
        ← К расписанию
      </Link>

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{data.title}</h1>
            <p className="mt-1 text-sm text-stone-400">
              {formatWeekday(data.startsAt)}, {formatFullDate(data.startsAt)} в{" "}
              <span className="nums text-stone-300">{formatTime(data.startsAt)}</span>
            </p>
          </div>
          <Badge tone={data.status === "finished" ? "neutral" : "green"}>
            {TOURNAMENT_STATUS_LABELS[data.status] ?? data.status}
          </Badge>
        </div>

            {data.venue && (
              <p className="mt-3 text-sm text-stone-300">
                {data.venue.title}
            {data.venue.address && <span className="text-stone-500"> · {data.venue.address}</span>}
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Detail
            label="Участники"
            value={`${data.registeredCount}${data.capacity != null ? ` / ${data.capacity}` : ""}`}
          />
          <Detail label="Призовых мест" value={String(data.paidPlaces)} />
          {data.minRating != null && data.minRating > 0 && (
            <Detail label="Мин. рейтинг" value={String(data.minRating)} />
          )}
          <Detail label="Стартовый стек" value={formatNumber(data.startingStack)} />
          {data.ratingMultiplier !== 1 ? (
            <Detail label="Коэффициент" value={`×${data.ratingMultiplier}`} />
          ) : (
            <Detail label="Адон" value={formatNumber(data.addonChips)} />
          )}
        </dl>

        {data.chipsInPlay > 0 && (
          <p className="mt-3 text-sm text-stone-400">
            Фишек в игре: <span className="nums text-stone-200">{formatNumber(data.chipsInPlay)}</span>
            {" · первое место: "}
            <span className="nums text-gold-400">{formatNumber(data.ratingPool)}</span> очков
          </p>
        )}

        {data.description && (
          <p className="mt-4 border-t border-felt-800 pt-3 text-sm whitespace-pre-line text-stone-300">
            {data.description}
          </p>
        )}

        {data.status !== "finished" && (
          <div className="mt-4">
            <RegisterButton tournament={data} />
          </div>
        )}
      </Card>

          {hasResults && (
        <section className="mb-4">
          <h2 className="mb-2 text-base font-semibold text-stone-200">
            Результаты
          </h2>
          <ul className="card divide-y divide-felt-800">
            {data.results
              .filter((row) => row.place <= data.paidPlaces)
              .map((row) => (
              <li key={row.user.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={cx(
                    "nums w-8 shrink-0 text-center font-semibold",
                    row.place <= 3 ? "text-lg" : "text-stone-400",
                  )}
                >
                  {placeLabel(row.place)}
                </span>
                <Avatar nickname={playerLabel(row.user)} url={row.user.avatarUrl} size={32} />
                <Link to={`/player/${row.user.id}`} className="flex-1 truncate hover:text-gold-400">
                  {playerLabel(row.user)}
                </Link>
                <span className="nums w-20 shrink-0 text-right font-medium text-gold-400">
                  {formatPoints(row.ratingPoints)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-4">
        <h2 className="mb-2 text-base font-semibold text-stone-200">
          Записались ({seated.length})
        </h2>
        {seated.length === 0 ? (
          <Card className="text-sm text-stone-400">Пока никто не записался - будьте первым.</Card>
        ) : (
          <ul className="card divide-y divide-felt-800">
            {seated.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar nickname={playerLabel(row.user)} url={row.user.avatarUrl} size={32} />
                <Link to={`/player/${row.user.id}`} className="flex-1 truncate hover:text-gold-400">
                  {playerLabel(row.user)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {waiting.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold text-stone-200">
            Лист ожидания ({waiting.length})
          </h2>
          <ul className="card divide-y divide-felt-800">
            {waiting.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="nums w-6 text-center text-sm text-stone-500">
                  {row.waitlistPosition}
                </span>
                <Avatar nickname={playerLabel(row.user)} url={row.user.avatarUrl} size={32} />
                <span className="flex-1 truncate">{playerLabel(row.user)}</span>
                <span className="text-xs text-stone-500">
                  {REGISTRATION_STATUS_LABELS[row.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="nums mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
