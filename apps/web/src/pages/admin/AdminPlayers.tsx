import type { PublicUser, UserRole } from "@poker/contracts";
import { ROLE_LABELS } from "@poker/contracts";
import { useState } from "react";
import { Avatar, Badge, Button, ErrorState, Loading } from "../../components/ui";
import { playerLabel } from "../../lib/format";
import { useClubSettings, useGrantPrize, usePlayerPrizes, usePlayers, useRevokePrize, useUpdatePlayer } from "../../lib/queries";

export function AdminPlayers({
  canEdit,
  canChangeRole = false,
}: {
  canEdit: boolean;
  canChangeRole?: boolean;
}) {
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
          <PlayerRow
            key={player.id}
            player={player}
            canEdit={canEdit}
            canChangeRole={canChangeRole}
          />
        ))}
      </ul>
    </>
  );
}

function PlayerRow({
  player,
  canEdit,
  canChangeRole,
}: {
  player: PublicUser & { status?: string };
  canEdit: boolean;
  canChangeRole: boolean;
}) {
  const update = useUpdatePlayer();
  const [nickname, setNickname] = useState(player.nickname);
  const [editing, setEditing] = useState(false);
  const settings = useClubSettings(editing);
  const wallet = usePlayerPrizes(editing ? player.id : undefined);
  const grantPrize = useGrantPrize();
  const revokePrize = useRevokePrize();
  const catalogue = (settings.data?.menuItems ?? []).filter((item) => item.isActive);

  const isBlocked = player.status === "blocked";

  return (
    <li className="card p-3">
      <div className="flex items-center gap-3">
        <Avatar nickname={playerLabel(player)} url={player.avatarUrl} size={36} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{playerLabel(player)}</p>
          <p className="text-xs text-stone-500">
            {player.nickname}
            {" · "}
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
            <p className="text-sm text-stone-400">Ник меняет персонал клуба.</p>
          )}

          {canEdit && canChangeRole && (
            <div>
              <label className="label" htmlFor={`role-${player.id}`}>
                Роль
              </label>
              <select
                id={`role-${player.id}`}
                className="field max-w-56"
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
          )}

          {canEdit && (
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
          )}

          {canEdit && (
            <div>
              <label className="label" htmlFor={`prize-${player.id}`}>
                Начислить приз
              </label>
              <select
                id={`prize-${player.id}`}
                className="field"
                defaultValue=""
                disabled={grantPrize.isPending || catalogue.length === 0}
                onChange={(event) => {
                  const menuItemId = event.target.value;
                  event.target.value = "";
                  if (!menuItemId) return;
                  grantPrize.mutate({ userId: player.id, menuItemId, quantity: 1 });
                }}
              >
                <option value="">Позиция из меню или акции…</option>
                {catalogue.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                    {item.priceRub > 0 ? ` · ${item.priceRub} ₽` : ""}
                  </option>
                ))}
              </select>
              {wallet.data && wallet.data.total > 0 && (
                <ul className="mt-2 space-y-1">
                  {wallet.data.active.map((prize) => (
                    <li key={prize.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-stone-300">{prize.title}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        loading={revokePrize.isPending}
                        onClick={() => revokePrize.mutate(prize.id)}
                      >
                        Отменить
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {(grantPrize.error || revokePrize.error) && (
                <p className="mt-1 text-xs text-chip-red">
                  {(grantPrize.error as Error | null)?.message ??
                    (revokePrize.error as Error | null)?.message}
                </p>
              )}
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
