import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import {
  Avatar,
  EmptyState,
  ErrorState,
  Loading,
  Select,
  cx,
} from "../components/ui";
import { playerLabel } from "../lib/format";
import { useLeaderboard, useSeasons } from "../lib/queries";
import "./player-finance-rating.css";

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
        (row.rank > 25 && row.user.id === user?.id) ||
        (row.rank <= 25 && (!needle || playerLabel(row.user).toLocaleLowerCase("ru-RU").includes(needle))),
    ),
  };

  useEffect(() => {
    if (seasonId || !seasons.data?.length) return;
    const active = seasons.data.find((row) => row.isActive) ?? seasons.data[0];
    if (active) setSeasonId(active.id);
  }, [seasonId, seasons.data]);

  const selected = seasons.data?.find((row) => row.id === seasonId);

  return (
    <section className="leaderboard-page">
      <header className="ranking-heading">
        <h1>Рейтинг клуба</h1>
        <p className="ranking-context">{selected?.title ?? "Текущий сезон"}{standings.data && <span> · {standings.data.length} игроков</span>}</p>
      </header>

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
      {standings.data && standings.data.length > 0 && (
            <div className="season-podium mb-7" aria-label="Тройка лидеров сезона">
              {standings.data
                .filter((row) => row.rank <= 3)
                .sort((a, b) => ([2, 1, 3].indexOf(a.rank) - [2, 1, 3].indexOf(b.rank)))
                .map((row) => (
                  <Link
                    className={`podium-player podium-place-${row.rank}`}
                    style={{gridColumn:row.rank===1?2:row.rank===2?1:3}}
                    key={row.user.id}
                    aria-label={`${row.rank} место: ${playerLabel(row.user)}, ${row.points.toLocaleString("ru-RU")} очков`}
                    to={`/player/${row.user.id}`}
                  >
                    <Avatar
                      nickname={playerLabel(row.user)}
                      url={row.user.avatarUrl}
                      size={72}
                    />
                    <strong className="podium-name">
                      {playerLabel(row.user)}
                    </strong>
                    <span className="podium-score nums">
                      {row.points.toLocaleString("ru-RU")}
                    </span>
                  </Link>
                ))}
            </div>
          )}
      <div className="ranking-tools">
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
          placeholder="Найти игрока по имени"
          aria-label="Поиск игрока"
          className="field ranking-search"
        />
      </div>

      {board.data?.length === 0 && (
        <EmptyState
          title={needle ? "Игрок не найден" : "Рейтинг пока пуст"}
          description={needle ? "" : "Результатов в этом сезоне пока нет."}
        />
      )}

      {board.data && board.data.length > 0 && (
        <>
          <p className="standings-caption">Топ-25 игроков</p>
          <div className="standings-frame">
            <table
              className="standings-table"
              aria-label={`Рейтинг - ${selected?.title ?? "сезон"}`}
            >
              <colgroup>
                <col className="rank-column" />
                <col />
                <col className="score-column" />
                <col className="games-column" />
                <col className="extra-stat wins-column" />
                <col className="extra-stat average-column" />
              </colgroup>
              <thead><tr>
                <th scope="col" className="rank-cell">
                  <span className="sr-only">Место</span>#
                </th>
                <th scope="col">Игрок</th>
                <th scope="col" className="numeric-cell">Очки</th>
                <th scope="col" className="numeric-cell">Игр</th>
                <th scope="col" className="numeric-cell extra-stat">Побед</th>
                <th scope="col" className="numeric-cell extra-stat">Ср. место</th>
              </tr></thead>
            <tbody>
              {board.data.map((row) => {
                const isMe = row.user.id === user?.id;
                return (
                  <Fragment key={row.user.id}>
                  {row.rank > 25 && <tr className="standing-personal-divider"><td colSpan={6}>Моя позиция</td></tr>}
                  <tr
                    className={cx(row.rank <= 3 && `standing-leader standing-leader-${row.rank}`, isMe && "standing-self")}
                  >
                    <td className="rank-cell">
                      <span className={cx("standing-rank nums", row.rank <= 3 && `standing-rank-${row.rank}`)}>
                        {String(row.rank).padStart(2, "0")}
                      </span>
                    </td>
                    <td className="player-cell">
                    <Link
                      to={`/player/${row.user.id}`}
                      className="standing-player"
                    >
                      <Avatar
                        nickname={playerLabel(row.user)}
                        url={row.user.avatarUrl}
                        size={36}
                      />
                      <span className="standing-name">{playerLabel(row.user)}</span>
                      {isMe && (
                        <span className="standing-you">
                          вы
                        </span>
                      )}
                    </Link>
                    </td>
                    <td className="standing-score numeric-cell nums">
                      {row.points.toLocaleString("ru-RU")}
                    </td>
                    <td className="numeric-cell nums">
                      {row.gamesPlayed}
                    </td>
                    <td className="numeric-cell nums extra-stat">
                      {row.wins}
                    </td>
                    <td className="numeric-cell nums extra-stat">
                      {row.avgPlace == null ? "-" : row.avgPlace.toFixed(1)}
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
