import type { Achievement, CreateAchievementInput } from "@poker/contracts";
import { useState } from "react";
import { Avatar, Badge, Button, Card, ErrorState, Loading } from "../../components/ui";
import { formatPoints } from "../../lib/format";
import {
  useAchievements,
  useCreateAchievement,
  useGrantAchievement,
  usePlayers,
  useUpdateAchievement,
} from "../../lib/queries";

export function AdminAchievements({ canEdit }: { canEdit: boolean }) {
  const achievements = useAchievements(true);
  const [creating, setCreating] = useState(false);

  return (
    <>
      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setCreating((value) => !value)}>
            {creating ? "Свернуть" : "+ Новая ачивка"}
          </Button>
        </div>
      )}

      {creating && <AchievementForm onDone={() => setCreating(false)} />}

      {achievements.isPending && <Loading />}
      {achievements.isError && <ErrorState error={achievements.error} />}

      <ul className="space-y-2">
        {achievements.data?.map((achievement) => (
          <AchievementRow key={achievement.id} achievement={achievement} canEdit={canEdit} />
        ))}
      </ul>
    </>
  );
}

function AchievementRow({
  achievement,
  canEdit,
}: {
  achievement: Achievement;
  canEdit: boolean;
}) {
  const update = useUpdateAchievement();
  const [points, setPoints] = useState(String(achievement.ratingPoints));
  const [granting, setGranting] = useState(false);

  return (
    <li className="card p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">
          {achievement.icon ?? "🏅"}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{achievement.title}</p>
            {!achievement.isActive && <Badge tone="red">скрыта</Badge>}
            {achievement.isRepeatable && <Badge>повторная</Badge>}
          </div>
          {achievement.description && (
            <p className="mt-0.5 text-sm text-stone-400">{achievement.description}</p>
          )}
          {achievement.holdersCount != null && achievement.holdersCount > 0 && (
            <p className="mt-0.5 text-xs text-stone-500">выдана {achievement.holdersCount} раз</p>
          )}
        </div>

        <span className="nums shrink-0 font-semibold text-gold-400">
          {formatPoints(achievement.ratingPoints)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-felt-800 pt-3">
        <Button size="sm" variant="secondary" onClick={() => setGranting((value) => !value)}>
          {granting ? "Свернуть" : "Выдать игроку"}
        </Button>

        {canEdit && (
          <>
            <div>
              <label className="label" htmlFor={`points-${achievement.id}`}>
                Рейтинг
              </label>
              <input
                id={`points-${achievement.id}`}
                type="number"
                className="field nums w-24"
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </div>
            <Button
              size="sm"
              loading={update.isPending}
              disabled={Number(points) === achievement.ratingPoints}
              onClick={() =>
                update.mutate({
                  id: achievement.id,
                  input: { ratingPoints: Number(points) },
                })
              }
            >
              Сохранить
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={update.isPending}
              onClick={() =>
                update.mutate({
                  id: achievement.id,
                  input: { isActive: !achievement.isActive },
                })
              }
            >
              {achievement.isActive ? "Скрыть" : "Показать"}
            </Button>
          </>
        )}
      </div>

      {update.isError && <p className="mt-2 text-xs text-chip-red">{(update.error as Error).message}</p>}

      {granting && <GrantPanel achievementId={achievement.id} />}
    </li>
  );
}

function GrantPanel({ achievementId }: { achievementId: string }) {
  const [search, setSearch] = useState("");
  const players = usePlayers(search, search.length >= 2);
  const grant = useGrantAchievement();

  return (
    <div className="mt-3 space-y-2 border-t border-felt-800 pt-3">
      <input
        type="search"
        className="field"
        value={search}
        placeholder="Начните вводить ник игрока"
        onChange={(event) => setSearch(event.target.value)}
      />

      {grant.isError && <p className="text-xs text-chip-red">{(grant.error as Error).message}</p>}
      {grant.isSuccess && <p className="text-xs text-emerald-400">Ачивка выдана.</p>}

      <ul className="max-h-56 divide-y divide-felt-800 overflow-y-auto">
        {players.data?.items.map((player) => (
          <li key={player.id} className="flex items-center gap-2 py-1.5">
            <Avatar nickname={player.nickname} url={player.avatarUrl} size={24} />
            <span className="min-w-0 flex-1 truncate text-sm">{player.nickname}</span>
            <Button
              size="sm"
              variant="ghost"
              loading={grant.isPending}
              onClick={() => grant.mutate({ achievementId, userId: player.id })}
            >
              Выдать
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AchievementForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAchievement();
  const [form, setForm] = useState({
    title: "",
    description: "",
    icon: "🏅",
    ratingPoints: "50",
    isRepeatable: false,
  });

  return (
    <Card className="mb-4 space-y-3">
      <div className="grid grid-cols-[4rem_1fr] gap-3">
        <div>
          <label className="label" htmlFor="a-icon">
            Иконка
          </label>
          <input
            id="a-icon"
            className="field text-center"
            value={form.icon}
            onChange={(event) => setForm({ ...form, icon: event.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="a-title">
            Название
          </label>
          <input
            id="a-title"
            className="field"
            value={form.title}
            placeholder="Например: Железный характер"
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="a-desc">
          Описание
        </label>
        <input
          id="a-desc"
          className="field"
          value={form.description}
          placeholder="За что выдаётся"
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </div>

      <div>
        <label className="label" htmlFor="a-points">
          Рейтинг
        </label>
        <input
          id="a-points"
          type="number"
          className="field nums max-w-40"
          value={form.ratingPoints}
          onChange={(event) => setForm({ ...form, ratingPoints: event.target.value })}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-stone-300">
        <input
          type="checkbox"
          checked={form.isRepeatable}
          onChange={(event) => setForm({ ...form, isRepeatable: event.target.checked })}
        />
        Можно выдавать одному игроку несколько раз
      </label>

      {create.isError && <p className="text-xs text-chip-red">{(create.error as Error).message}</p>}

      <div className="flex gap-2">
        <Button
          loading={create.isPending}
          disabled={form.title.trim().length < 2}
          onClick={() =>
            create.mutate(
              {
                title: form.title.trim(),
                description: form.description.trim() || null,
                icon: form.icon || null,
                ratingPoints: Number(form.ratingPoints),
                isRepeatable: form.isRepeatable,
              } as CreateAchievementInput,
              { onSuccess: onDone },
            )
          }
        >
          Создать
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </Card>
  );
}

