import { DEFAULT_RATING_CONFIG, type Season } from "@poker/contracts";
import { useState } from "react";
import { Badge, Button, Card, ErrorState, Loading } from "../../components/ui";
import { formatFullDate, fromClubParts, toClubParts } from "../../lib/format";
import { useCreateSeason, useFinishSeason, useSeasons } from "../../lib/queries";

export function AdminSeasons() {
  const seasons = useSeasons();
  const [creating, setCreating] = useState(false);

  const current = (seasons.data ?? []).filter((row) => row.isActive);
  const archive = (seasons.data ?? []).filter((row) => !row.isActive);

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setCreating((value) => !value)}>
          {creating ? "Свернуть" : "+ Новый сезон"}
        </Button>
      </div>

      {creating && <SeasonForm onDone={() => setCreating(false)} />}

      {seasons.isPending && <Loading />}
      {seasons.isError && <ErrorState error={seasons.error} />}

      {current.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-400 uppercase">
            Сейчас
          </h2>
          <ul className="space-y-2">
            {current.map((season) => (
              <SeasonRow key={season.id} season={season} />
            ))}
          </ul>
        </section>
      )}

      {archive.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-400 uppercase">
            Завершённые
          </h2>
          <ul className="space-y-2">
            {archive.map((season) => (
              <SeasonRow key={season.id} season={season} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SeasonRow({ season }: { season: Season }) {
  const finish = useFinishSeason();
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{season.title}</p>
          <p className="mt-0.5 text-xs text-stone-400">
            {formatFullDate(season.startsAt)}
            {season.endsAt ? ` — ${formatFullDate(season.endsAt)}` : " — …"}
          </p>
        </div>
        <Badge tone={season.isActive ? "green" : "neutral"}>
          {season.isActive ? "идёт" : "завершён"}
        </Badge>
      </div>

      {season.isActive && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-felt-800 pt-3">
          {confirming ? (
            <>
              <Button
                size="sm"
                loading={finish.isPending}
                onClick={() => finish.mutate(season.id, { onSuccess: () => setConfirming(false) })}
              >
                Да, закрыть сезон
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Отмена
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              Завершить сезон
            </Button>
          )}
        </div>
      )}

      {finish.isError && (
        <p className="mt-2 text-xs text-chip-red">{(finish.error as Error).message}</p>
      )}
    </li>
  );
}

function SeasonForm({ onDone }: { onDone: () => void }) {
  const create = useCreateSeason();
  const today = toClubParts(new Date().toISOString()).date;
  const [title, setTitle] = useState("");
  const [starts, setStarts] = useState(today);
  const [ends, setEnds] = useState("");

  return (
    <Card className="mb-4 space-y-3">
      <div>
        <label className="label" htmlFor="s-title">
          Название
        </label>
        <input
          id="s-title"
          className="field"
          value={title}
          placeholder="Лето 2026"
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="s-from">
            С
          </label>
          <input
            id="s-from"
            type="date"
            className="field"
            value={starts}
            onChange={(event) => setStarts(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="s-to">
            По
          </label>
          <input
            id="s-to"
            type="date"
            className="field"
            value={ends}
            onChange={(event) => setEnds(event.target.value)}
          />
        </div>
      </div>

      {create.isError && <p className="text-xs text-chip-red">{(create.error as Error).message}</p>}

      <div className="flex gap-2">
        <Button
          loading={create.isPending}
          disabled={title.trim().length < 3 || !starts}
          onClick={() =>
            create.mutate(
              {
                title: title.trim(),
                startsAt: fromClubParts(starts, "00:00").toISOString(),
                endsAt: ends ? fromClubParts(ends, "23:59").toISOString() : null,
                isActive: true,
                ratingConfig: DEFAULT_RATING_CONFIG,
              },
              { onSuccess: onDone },
            )
          }
        >
          Открыть сезон
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </Card>
  );
}
