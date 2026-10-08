import type {
  PlayerStats,
  PrizeWallet,
  UserAchievementView,
} from "@poker/contracts";
import { walletLabel } from "@poker/contracts";
import { Link } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { AwardArtwork } from "./AwardArtwork";
import {
  formatFullDate,
  formatPoints,
  placeLabel,
  playerLabel,
  plural,
} from "../lib/format";
import { useRevokeAchievement } from "../lib/queries";
import { Avatar, Button, Card, EmptyState, Stat, cx } from "./ui";

function showsPrizePlace(
  place: number | null | undefined,
  paidPlaces: number,
): boolean {
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
  wallet,
  extra,
  canRevoke = false,
}: {
  stats: PlayerStats;
  achievements: UserAchievementView[] | undefined;
  wallet?: PrizeWallet;
  extra?: React.ReactNode;
  canRevoke?: boolean;
}) {
  return (
    <div className="player-profile">
      <Card className="profile-identity mb-4">
        <div className="flex items-center gap-3">
          <Avatar
            nickname={playerLabel(stats.user)}
            url={stats.user.avatarUrl}
            size={80}
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-medium tracking-tight">
              {playerLabel(stats.user)}
            </h1>
            <p className="mt-0.5 text-sm text-stone-400">
              {stats.rank ? (
                <>
                  <span className="text-gold-400">{stats.rank} место</span> в
                  сезоне ·{" "}
                </>
              ) : null}
              <span className="nums">{stats.points}</span> очков
            </p>
          </div>
        </div>
        {extra}
      </Card>

      <h2 className="section-heading mt-7">Статистика сезона</h2>
      <div className="profile-summary grid grid-cols-2 mb-0">
        <Stat label="Очки" value={stats.points.toLocaleString("ru-RU")} />
        <Stat label="Место в рейтинге" value={stats.rank ?? "-"} />
      </div>
      <div className="profile-stats mb-8 grid grid-cols-2 sm:grid-cols-4">
        <Stat label="Турниров" value={stats.gamesPlayed} />
        <Stat label="Побед" value={stats.wins} />
        <Stat label="Топ-3" value={stats.top3} />
        <Stat label="В призах" value={stats.itm} />
      </div>

      <div className="mb-4">
        <Suspense fallback={<div className="card h-[200px] animate-pulse" />}>
          <RatingChart progression={stats.progression} />
        </Suspense>
      </div>

      {wallet && wallet.total > 0 && (
        <section className="mb-4">
          <h2 className="section-heading">Призы ({wallet.total})</h2>
          <Card>
            <p className="text-sm text-gold-400">{walletLabel(wallet.lines)}</p>

            {wallet.history.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-felt-800 pt-3 text-sm text-stone-400">
                {wallet.history.slice(0, 6).map((prize) => (
                  <li key={prize.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{prize.title}</span>
                    <span className="shrink-0 text-xs text-stone-500">
                      {prize.spentAt ? prize.spentAt.title : "списан"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {achievements && achievements.length > 0 && (
        <div>
          {(["club", "game"] as const).map((category) => (
            <section className="mb-6" key={category}>
              <h2 className="section-heading">
                {category === "club" ? "Клубные награды" : "Игровые комбинации"}{" "}
                (
                {
                  achievements.filter(
                    (a) => a.achievement.category === category,
                  ).length
                }
                )
              </h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {achievements
                  .filter((a) => a.achievement.category === category)
                  .map((granted) => (
                    <AchievementTile
                      key={granted.id}
                      granted={granted}
                      canRevoke={canRevoke}
                    />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section>
        <h2 className="section-heading">История</h2>

        {stats.history.length === 0 ? (
          <EmptyState title="Игр пока не было" description="" />
        ) : (
          <ul className="card divide-y divide-felt-800">
            {stats.history.map((event) => (
              <li key={event.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-12 shrink-0 items-center justify-center">
                  {event.tournament ? (
                    showsPrizePlace(
                      event.place,
                      event.tournament.paidPlaces,
                    ) ? (
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
                      {event.achievement?.title ??
                        event.comment ??
                        "Корректировка"}
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
    </div>
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
    <li className="flex flex-col items-center text-center min-w-0 py-3">
      <AwardArtwork achievement={granted.achievement} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {granted.achievement.title}
        </p>
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
              revoke.mutate(granted.id, {
                onSettled: () => setConfirming(false),
              });
            }}
          >
            {confirming ? "Забрать?" : "Забрать"}
          </Button>
        )}
        {revoke.isError && (
          <p className="mt-1 text-xs text-chip-red">
            {(revoke.error as Error).message}
          </p>
        )}
      </div>
    </li>
  );
}
