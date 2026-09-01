import type { PlayerStats, UserAchievementView } from "@poker/contracts";
import { Link } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { formatFullDate, formatPoints, placeLabel, playerLabel, plural } from "../lib/format";
import { useRevokeAchievement } from "../lib/queries";
import { Avatar, Button, Card, EmptyState, Stat, cx } from "./ui";

function showsPrizePlace(place: number | null | undefined, paidPlaces: number): boolean {
  return place != null && place >= 1 && place <= paidPlaces;
}

// The charting library is by far the heaviest dependency; keep it out of the
// initial bundle so the schedule opens fast on a phone.
const RatingChart = lazy(() =>
  import("./RatingChart").then((module) => ({ default: module.RatingChart })),
);

/**
 * Shared by the personal cabinet and any public player page: the same numbers
 * should read identically wherever they appear.
 */
export function PlayerProfile({
  stats,
  achievements,
  extra,
  canRevoke = false,
}: {
  stats: PlayerStats;
  achievements: UserAchievementView[] | undefined;
  extra?: React.ReactNode;
  canRevoke?: boolean;
}) {
  return (
    <>
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <Avatar nickname={playerLabel(stats.user)} url={stats.user.avatarUrl} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold">{playerLabel(stats.user)}</h1>
            <p className="mt-0.5 text-sm text-stone-400">
              {stats.rank ? (
                <>
                  <span className="text-gold-400">{stats.rank} место</span> в сезоне ·{" "}
                </>
              ) : null}
              <span className="nums">{stats.points}</span> очков
            </p>
          </div>
        </div>
        {extra}
      </Card>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="Очки" value={stats.points} />
        <Stat label="Игр" value={stats.gamesPlayed} />
        <Stat label="Побед" value={stats.wins} />
        <Stat label="Топ-3" value={stats.top3} />
        <Stat label="В призах" value={stats.itm} />
        <Stat
          label="Ср. место"
          value={stats.avgPlace == null ? "-" : stats.avgPlace.toFixed(1)}
          hint={stats.bestPlace ? `лучшее: ${stats.bestPlace}` : undefined}
        />
      </div>

      <div className="mb-4">
        <Suspense fallback={<div className="card h-[200px] animate-pulse" />}>
          <RatingChart progression={stats.progression} />
        </Suspense>
      </div>

      {achievements && achievements.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-base font-semibold text-stone-200">
            Достижения ({achievements.length})
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {achievements.map((granted) => (
              <AchievementTile key={granted.id} granted={granted} canRevoke={canRevoke} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold text-stone-200">
          История
        </h2>

        {stats.history.length === 0 ? (
          <EmptyState
            title="Игр пока не было"
            description="Запишитесь на ближайший турнир - он появится в этой истории вместе с полученным рейтингом."
          />
        ) : (
          <ul className="card divide-y divide-felt-800">
            {stats.history.map((event) => (
              <li key={event.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-12 shrink-0 items-center justify-center">
                  {event.tournament ? (
                    showsPrizePlace(event.place, event.tournament.paidPlaces) ? (
                      <span
                        className={cx(
                          "nums text-2xl font-semibold tracking-tight",
                          event.place === 1 ? "text-gold-400" : "text-stone-50",
                        )}
                      >
                        {placeLabel(event.place as number)}
                      </span>
                    ) : (
                      <span className="nums text-2xl font-semibold tracking-tight text-stone-600">
                        -
                      </span>
                    )
                  ) : (
                    <span aria-hidden className="text-lg">
                      {event.achievement?.icon ?? "·"}
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  {event.tournament ? (
                    <Link
                      to={`/t/${event.tournament.id}`}
                      className="block truncate text-sm hover:text-gold-400"
                    >
                      {event.tournament.title}
                    </Link>
                  ) : (
                    <p className="truncate text-sm">
                      {event.achievement?.title ?? event.comment ?? "Корректировка"}
                    </p>
                  )}
                  <p className="text-xs text-stone-500">
                    {event.tournament
                      ? `${formatFullDate(event.tournament.startsAt)} · ${event.tournament.fieldSize} ${plural(event.tournament.fieldSize, "участник", "участника", "участников")}`
                      : formatFullDate(event.createdAt)}
                  </p>
                </div>

                <span
                  className={cx(
                    "nums shrink-0 text-lg font-semibold tracking-tight",
                    event.points >= 0 ? "text-gold-400" : "text-chip-red",
                  )}
                >
                  {formatPoints(event.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function AchievementTile({
  granted,
  canRevoke,
}: {
  granted: UserAchievementView;
  canRevoke: boolean;
}) {
  const revoke = useRevokeAchievement();
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="card flex items-start gap-2.5 p-3">
      <span aria-hidden className="text-2xl leading-none">
        {granted.achievement.icon ?? "🏅"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{granted.achievement.title}</p>
        <p className="nums text-xs text-gold-500">
          {formatPoints(granted.achievement.ratingPoints)} рейтинга
        </p>
        {canRevoke && (
          <Button
            size="sm"
            variant={confirming ? "danger" : "ghost"}
            className="mt-1"
            loading={revoke.isPending}
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              revoke.mutate(granted.id, { onSettled: () => setConfirming(false) });
            }}
          >
            {confirming ? "Забрать?" : "Забрать"}
          </Button>
        )}
        {revoke.isError && (
          <p className="mt-1 text-xs text-chip-red">{(revoke.error as Error).message}</p>
        )}
      </div>
    </li>
  );
}
