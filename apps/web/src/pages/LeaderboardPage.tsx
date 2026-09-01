import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { Avatar, EmptyState, ErrorState, Loading, PageHeader, cx } from "../components/ui";
import { useLeaderboard, useSeasons } from "../lib/queries";

export function LeaderboardPage() {
  const [seasonId, setSeasonId] = useState("");
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const seasons = useSeasons();
  const board = useLeaderboard(seasonId || undefined, search);

  useEffect(() => {
    if (seasonId || !seasons.data?.length) return;
    const active = seasons.data.find((row) => row.isActive) ?? seasons.data[0];
    if (active) setSeasonId(active.id);
  }, [seasonId, seasons.data]);

  const selected = seasons.data?.find((row) => row.id === seasonId);
  const bestOf = selected?.ratingConfig.bestOfCount ?? 0;

  return (
    <>
      <PageHeader
        title="Рейтинг"
        subtitle={
          selected
            ? bestOf > 0
              ? `${selected.title} · в зачёт идут ${bestOf} лучших результатов`
              : selected.title
            : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          className="field mb-4 sm:max-w-64"
          value={seasonId}
          onChange={(event) => setSeasonId(event.target.value)}
          aria-label="Сезон"
        >
          {(seasons.data ?? []).map((season) => (
            <option key={season.id} value={season.id}>
              {season.title}
              {season.isActive ? " · сейчас" : " · завершён"}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по нику"
          className="field mb-4 sm:max-w-48"
        />
      </div>

      {board.isPending && <Loading label="Считаем рейтинг…" />}
      {board.isError && <ErrorState error={board.error} onRetry={() => void board.refetch()} />}
      {board.data?.length === 0 && (
        <EmptyState
          title="Рейтинг пока пуст"
          description="Очки появятся после первого турнира с внесёнными результатами."
        />
      )}

      {board.data && board.data.length > 0 && (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_3.5rem_3rem] gap-2 border-b border-felt-800 px-3 py-2 text-[11px] tracking-wide text-stone-500 uppercase sm:grid-cols-[2.5rem_1fr_3.5rem_3rem_3rem_3.5rem]">
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
                    "grid grid-cols-[2.5rem_1fr_3.5rem_3rem] items-center gap-2 px-3 py-2.5 sm:grid-cols-[2.5rem_1fr_3.5rem_3rem_3rem_3.5rem]",
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
                    <Avatar nickname={row.user.nickname} url={row.user.avatarUrl} size={28} />
                    <span className="truncate text-sm">{row.user.nickname}</span>
                    {isMe && <span className="shrink-0 text-[10px] text-gold-500">вы</span>}
                  </Link>

                  <span className="nums text-right font-semibold text-gold-400">{row.points}</span>
                  <span className="nums text-right text-sm text-stone-400">{row.gamesPlayed}</span>
                  <span className="nums hidden text-right text-sm text-stone-400 sm:block">
                    {row.wins}
                  </span>
                  <span className="nums hidden text-right text-sm text-stone-400 sm:block">
                    {row.avgPlace == null ? "—" : row.avgPlace.toFixed(1)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
