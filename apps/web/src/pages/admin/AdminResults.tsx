import { useMemo, useState } from "react";
import { Avatar, Badge, Button, Card, ErrorState, Loading, cx } from "../../components/ui";
import { formatFullDate } from "../../lib/format";
import {
  useRegistrations,
  useSetRegistrationStatus,
  useSubmitResults,
  useTournaments,
} from "../../lib/queries";

/**
 * Results entry, optimised for one person typing at the venue right after the
 * final hand: the participant list is already there, places are plain number
 * inputs, and the form tells you exactly what is still wrong before you submit.
 */
export function AdminResults() {
  const tournaments = useTournaments("all");
  const [selectedId, setSelectedId] = useState<string>("");

  const candidates = useMemo(
    () =>
      (tournaments.data ?? []).filter((tournament) =>
        ["reg_open", "reg_closed", "running", "finished"].includes(tournament.status),
      ),
    [tournaments.data],
  );

  if (tournaments.isPending) return <Loading />;
  if (tournaments.isError) return <ErrorState error={tournaments.error} />;

  return (
    <>
      <Card className="mb-4">
        <label className="label" htmlFor="result-tournament">
          Турнир
        </label>
        <select
          id="result-tournament"
          className="field"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">— выберите турнир —</option>
          {candidates.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {formatFullDate(tournament.startsAt)} · {tournament.title}
              {tournament.status === "finished" ? " (результаты внесены)" : ""}
            </option>
          ))}
        </select>
      </Card>

      {selectedId && <ResultsForm key={selectedId} tournamentId={selectedId} />}
    </>
  );
}

function ResultsForm({ tournamentId }: { tournamentId: string }) {
  const registrations = useRegistrations(tournamentId);
  const submit = useSubmitResults(tournamentId);
  const setStatus = useSetRegistrationStatus(tournamentId);
  const [places, setPlaces] = useState<Record<string, string>>({});
  const [knockouts, setKnockouts] = useState<Record<string, string>>({});

  const players = (registrations.data ?? []).filter((row) => row.status !== "waitlist");

  const entries = players
    .map((row) => ({
      userId: row.user.id,
      place: Number(places[row.user.id] ?? ""),
      knockouts: knockouts[row.user.id] ? Number(knockouts[row.user.id]) : null,
    }))
    .filter((entry) => Number.isInteger(entry.place) && entry.place > 0);

  const problem = validate(entries.map((entry) => entry.place));

  if (registrations.isPending) return <Loading />;
  if (registrations.isError) return <ErrorState error={registrations.error} />;

  if (players.length === 0) {
    return (
      <Card className="text-sm text-stone-400">
        На этот турнир никто не записан. Сначала запишите участников — результаты вносятся по
        списку участников.
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-400">
          Участников: <span className="nums">{players.length}</span>. Проставьте места от 1 до{" "}
          {players.length}.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            // Sequential numbering as a starting point; usually faster to fix a
            // couple of rows than to type every place from scratch.
            const next: Record<string, string> = {};
            players.forEach((row, index) => {
              next[row.user.id] = String(index + 1);
            });
            setPlaces(next);
          }}
        >
          Заполнить по порядку
        </Button>
      </div>

      <ul className="divide-y divide-felt-800">
        {players.map((row) => (
          <li key={row.id} className="flex items-center gap-2 py-2">
            <input
              type="number"
              min={1}
              max={players.length}
              inputMode="numeric"
              aria-label={`Место игрока ${row.user.nickname}`}
              value={places[row.user.id] ?? ""}
              onChange={(event) =>
                setPlaces({ ...places, [row.user.id]: event.target.value })
              }
              className={cx(
                "field nums w-16 shrink-0 text-center",
                places[row.user.id] && "border-gold-500/50",
              )}
            />
            <Avatar nickname={row.user.nickname} url={row.user.avatarUrl} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm">{row.user.nickname}</span>

            <input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label={`Нокауты игрока ${row.user.nickname}`}
              placeholder="KO"
              value={knockouts[row.user.id] ?? ""}
              onChange={(event) =>
                setKnockouts({ ...knockouts, [row.user.id]: event.target.value })
              }
              className="field nums w-16 shrink-0 text-center"
            />

            {row.status === "no_show" ? (
              <Badge tone="red">не явился</Badge>
            ) : (
              <button
                title="Отметить неявку"
                className="shrink-0 px-1 text-stone-500 hover:text-chip-red"
                onClick={() => setStatus.mutate({ userId: row.user.id, status: "no_show" })}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {problem && <p className="text-sm text-chip-red">{problem}</p>}
      {submit.isError && <p className="text-sm text-chip-red">{(submit.error as Error).message}</p>}
      {submit.isSuccess && !problem && (
        <p className="text-sm text-emerald-400">
          Результаты сохранены, рейтинг пересчитан. Повторная отправка просто перезапишет их.
        </p>
      )}

      <Button
        loading={submit.isPending}
        disabled={Boolean(problem)}
        onClick={() => submit.mutate({ entries })}
      >
        Сохранить результаты и начислить рейтинг
      </Button>
    </Card>
  );
}

/** Mirrors the server-side rule, so the operator sees the problem before submitting. */
function validate(places: number[]): string | null {
  if (places.length < 2) return "Нужно проставить места минимум двум игрокам.";

  const unique = new Set(places);
  if (unique.size !== places.length) return "Одно и то же место занято дважды.";

  const sorted = [...places].sort((a, b) => a - b);
  const contiguous = sorted.every((place, index) => place === index + 1);
  if (!contiguous) return `Места должны идти без пропусков от 1 до ${places.length}.`;

  return null;
}
