import type { PublicUser, UserRole } from "@poker/contracts";
import { useState } from "react";
import { Avatar, Badge, Button, ErrorState, Loading } from "../../components/ui";
import { usePlayers, useUpdatePlayer } from "../../lib/queries";

const ROLE_LABELS: Record<UserRole, string> = {
  player: "Игрок",
  admin: "Администратор",
};

export function AdminPlayers({ canEdit }: { canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const players = usePlayers(search, true);

  return (
    <>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск по нику или имени"
        className="field mb-3"
      />

      {players.isPending && <Loading />}
      {players.isError && <ErrorState error={players.error} />}

      <ul className="space-y-2">
        {players.data?.items.map((player) => (
          <PlayerRow key={player.id} player={player} canEdit={canEdit} />
        ))}
      </ul>
    </>
  );
}

function PlayerRow({
  player,
  canEdit,
}: {
  player: PublicUser & { status?: string };
  canEdit: boolean;
}) {
  const update = useUpdatePlayer();
  const [nickname, setNickname] = useState(player.nickname);
  const [editing, setEditing] = useState(false);

  const isBlocked = player.status === "blocked";

  return (
    <li className="card p-3">
      <div className="flex items-center gap-3">
        <Avatar nickname={player.nickname} url={player.avatarUrl} size={36} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{player.nickname}</p>
          <p className="text-xs text-stone-500">
            {ROLE_LABELS[player.role]}
            {isBlocked && " · заблокирован"}
          </p>
        </div>

        {player.role !== "player" && <Badge tone="gold">{ROLE_LABELS[player.role]}</Badge>}
        {isBlocked && <Badge tone="red">блок</Badge>}

        <Button size="sm" variant="ghost" onClick={() => setEditing((value) => !value)}>
          {editing ? "Свернуть" : "Изменить"}
        </Button>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-felt-800 pt-3">
          {/* Nickname, role and status all require the admin role on the API. */}
          {canEdit ? (
            <div>
              <label className="label" htmlFor={`nick-${player.id}`}>
                Ник в рейтинге
              </label>
              <div className="flex gap-2">
                <input
                  id={`nick-${player.id}`}
                  className="field"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
                <Button
                  size="sm"
                  loading={update.isPending}
                  disabled={nickname === player.nickname || nickname.trim().length < 2}
                  onClick={() => update.mutate({ id: player.id, input: { nickname } })}
                >
                  Сохранить
                </Button>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Ник подставляется из Telegram при первом входе.
              </p>
            </div>
          ) : (
            <p className="text-xs text-stone-500">
              Ник, роль и блокировку меняет администратор. Организатору доступны расписание,
              отметки о явке и ввод результатов.
            </p>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="label" htmlFor={`role-${player.id}`}>
                  Роль
                </label>
                <select
                  id={`role-${player.id}`}
                  className="field"
                  value={player.role}
                  onChange={(event) =>
                    update.mutate({
                      id: player.id,
                      input: { role: event.target.value as UserRole },
                    })
                  }
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                size="sm"
                variant={isBlocked ? "secondary" : "danger"}
                loading={update.isPending}
                onClick={() =>
                  update.mutate({
                    id: player.id,
                    input: { status: isBlocked ? "active" : "blocked" },
                  })
                }
              >
                {isBlocked ? "Разблокировать" : "Заблокировать"}
              </Button>
            </div>
          )}

          {update.isError && (
            <p className="text-xs text-chip-red">{(update.error as Error).message}</p>
          )}
        </div>
      )}
    </li>
  );
}
