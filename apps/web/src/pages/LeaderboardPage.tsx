import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import {
  Avatar,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Select,
  cx,
} from "../components/ui";
import { playerLabel } from "../lib/format";
import { useLeaderboard, useSeasons } from "../lib/queries";

export function LeaderboardPage() {
  const [seasonId, setSeasonId] = useState("");
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const seasons = useSeasons();
  const standings = useLeaderboard(seasonId || undefined);
  const needle = search.trim().toLocaleLowerCase("ru-RU");
  const board = {
    ...standings,
    data: standings.data?.filter(
      (row) =>
        !needle ||
        playerLabel(row.user).toLocaleLowerCase("ru-RU").includes(needle),
    ),
  };

  useEffect(() => {
    if (seasonId || !seasons.data?.length) return;
    const active = seasons.data.find((row) => row.isActive) ?? seasons.data[0];
    if (active) setSeasonId(active.id);
  }, [seasonId, seasons.data]);

  const selected = seasons.data?.find((row) => row.id === seasonId);

  return (
    <>
      <PageHeader title="Рейтинг" subtitle={selected?.title} />

      <div className="ranking-tools mb-4 flex flex-wrap items-center gap-3">
        <Select
          className="w-full sm:max-w-72"
          aria-label="Сезон"
          value={seasonId}
          onChange={setSeasonId}
          options={(seasons.data ?? []).map((season) => ({
            value: season.id,
            label: `${season.title}${season.isActive ? " · сейчас" : " · завершён"}`,
          }))}
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по имени"
          aria-label="Поиск игрока"
          className="field w-full sm:max-w-52"
        />
      </div>

      {seasons.isError && (
        <ErrorState
          error={seasons.error}
          onRetry={() => void seasons.refetch()}
        />
      )}
      {seasons.data?.length === 0 && (
        <EmptyState title="Сезоны пока не созданы" description="" />
      )}
      {(seasons.isPending || (Boolean(seasonId) && board.isPending)) && (
        <Loading label="Считаем рейтинг…" />
      )}
      {board.isError && (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      )}
      {board.data?.length === 0 && (
        <EmptyState
          title={needle ? "Игрок не найден" : "Рейтинг пока пуст"}
          description={needle ? "" : "Результатов в этом сезоне пока нет."}
        />
      )}

      {board.data && board.data.length > 0 && (
        <>
          {!search && (
            <div className="season-podium mb-7">
              {board.data
                .filter((row) => row.rank <= 3)
                .map((row) => (
                  <Link
                    className={`podium-player podium-place-${row.rank}`}
                    key={row.user.id}
                    to={`/player/${row.user.id}`}
                  >
                    <span className="podium-rank" aria-label="Место">
                      {String(row.rank).padStart(2, "0")}
                    </span>
                    <Avatar
                      nickname={playerLabel(row.user)}
                      url={row.user.avatarUrl}
                      size={56}
                    />
                    <strong className="truncate max-w-full text-sm sm:text-base mt-3">
                      {playerLabel(row.user)}
                    </strong>
                    <span className="text-xl sm:text-3xl nums text-gold-400 mt-2 font-semibold">
                      {row.points.toLocaleString("ru-RU")}
                    </span>
                    <span className="text-xs text-stone-400 mt-1">очков</span>
                  </Link>
                ))}
            </div>
          )}
          <div className="ranking-table overflow-hidden border-t border-white/15">
            <div className="grid grid-cols-[2.5rem_1fr_4rem_3.25rem] gap-2 border-b border-gold-500/20 px-3 py-3 text-sm text-stone-300 sm:grid-cols-[2.5rem_1fr_4rem_3.25rem_3.5rem_4.5rem]">
              <span className="text-center">#</span>
              <span>Игрок</span>
              <span className="text-right">Очки</span>
              <span className="text-right">Игр</span>
              <span className="hidden text-right sm:block">Побед</span>
              <span className="hidden text-right sm:block">Ср. место</span>
            </div>

            <ul className="divide-y divide-felt-800">
              {board.data.map((row) => {
                const isMe = row.user.id === user?.id;
                return (
                  <li
                    key={row.user.id}
                    className={cx(
                      "grid grid-cols-[2.5rem_1fr_4rem_3.25rem] items-center gap-2 px-3 py-3 sm:grid-cols-[2.5rem_1fr_4rem_3.25rem_3.5rem_4.5rem]",
                      isMe && "bg-gold-500/5",
                    )}
                  >
                    <span
                      className={cx(
                        "nums text-center font-semibold",
                        row.rank === 1 && "text-gold-400",
                        row.rank > 3 && "text-stone-500",
                      )}
                    >
                      {row.rank}
                    </span>

                    <Link
                      to={`/player/${row.user.id}`}
                      className="flex min-w-0 items-center gap-2 hover:text-gold-400"
                    >
                      <Avatar
                        nickname={playerLabel(row.user)}
                        url={row.user.avatarUrl}
                        size={36}
                      />
                      <span className="truncate">{playerLabel(row.user)}</span>
                      {isMe && (
                        <span className="shrink-0 text-sm text-gold-500">
                          вы
                        </span>
                      )}
                    </Link>

                    <span className="nums text-right font-semibold text-gold-400">
                      {row.points.toLocaleString("ru-RU")}
                    </span>
                    <span className="nums text-right text-stone-400">
                      {row.gamesPlayed}
                    </span>
                    <span className="nums hidden text-right text-stone-400 sm:block">
                      {row.wins}
                    </span>
                    <span className="nums hidden text-right text-stone-400 sm:block">
                      {row.avgPlace == null ? "-" : row.avgPlace.toFixed(1)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
