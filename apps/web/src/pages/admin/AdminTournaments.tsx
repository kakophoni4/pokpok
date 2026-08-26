import type {
  CreateTournamentInput,
  TournamentSummary,
  UpdateTournamentInput,
} from "@poker/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, ErrorState, Loading, cx } from "../../components/ui";
import {
  formatFullDate,
  formatTime,
  fromClubParts,
  toClubParts,
  TOURNAMENT_STATUS_LABELS,
} from "../../lib/format";
import {
  useCreateTournament,
  useDeleteTournament,
  useTournaments,
  useUpdateTournament,
} from "../../lib/queries";

export function AdminTournaments({ canDelete }: { canDelete: boolean }) {
  const [creating, setCreating] = useState(false);
  const tournaments = useTournaments("all");

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setCreating((value) => !value)}>
          {creating ? "Свернуть" : "+ Новый турнир"}
        </Button>
      </div>

      {creating && <TournamentForm onDone={() => setCreating(false)} />}

      {tournaments.isPending && <Loading />}
      {tournaments.isError && <ErrorState error={tournaments.error} />}

      <ul className="space-y-2">
        {tournaments.data?.map((tournament) => (
          <TournamentRow key={tournament.id} tournament={tournament} canDelete={canDelete} />
        ))}
      </ul>
    </>
  );
}

function TournamentRow({
  tournament,
  canDelete,
}: {
  tournament: TournamentSummary;
  canDelete: boolean;
}) {
  const update = useUpdateTournament(tournament.id);
  const remove = useDeleteTournament();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  const isPublished = tournament.status !== "draft";

  return (
    <li className="card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/t/${tournament.id}`} className="font-medium hover:text-gold-400">
            {tournament.title}
          </Link>
          <p className="nums mt-0.5 text-xs text-stone-400">
            {formatFullDate(tournament.startsAt)} · {formatTime(tournament.startsAt)} ·{" "}
            {tournament.paidPlaces} призовых · ×{tournament.ratingMultiplier}
          </p>
          <p className="nums mt-0.5 text-xs text-stone-500">
            {tournament.registeredCount}
            {tournament.capacity != null && `/${tournament.capacity}`} записались
            {tournament.waitlistCount > 0 && `, ${tournament.waitlistCount} в ожидании`}
          </p>
        </div>

        <Badge
          tone={
            tournament.status === "finished"
              ? "neutral"
              : tournament.status === "draft"
                ? "red"
                : "green"
          }
        >
          {TOURNAMENT_STATUS_LABELS[tournament.status]}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setEditing((value) => !value)}>
          {editing ? "Свернуть" : "Изменить дату и детали"}
        </Button>

        {!isPublished && (
          <Button
            size="sm"
            loading={update.isPending}
            onClick={() => update.mutate({ status: "reg_open" })}
          >
            Опубликовать и открыть запись
          </Button>
        )}
        {tournament.status === "reg_open" && (
          <Button
            size="sm"
            variant="secondary"
            loading={update.isPending}
            onClick={() => update.mutate({ status: "reg_closed" })}
          >
            Закрыть запись
          </Button>
        )}
        {tournament.status === "reg_closed" && (
          <Button
            size="sm"
            variant="secondary"
            loading={update.isPending}
            onClick={() => update.mutate({ status: "reg_open" })}
          >
            Открыть запись снова
          </Button>
        )}
        {canDelete && tournament.status !== "finished" && (
          <Button
            size="sm"
            variant={confirming ? "danger" : "ghost"}
            loading={remove.isPending}
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              remove.mutate(tournament.id);
            }}
          >
            {confirming ? "Точно удалить?" : "Удалить"}
          </Button>
        )}
      </div>

      {(update.isError || remove.isError) && (
        <p className="mt-2 text-xs text-chip-red">
          {((update.error ?? remove.error) as Error).message}
        </p>
      )}

      {editing && (
        <div className="mt-3 border-t border-felt-800 pt-3">
          <TournamentForm tournament={tournament} onDone={() => setEditing(false)} />
        </div>
      )}
    </li>
  );
}

/**
 * One form for both creating a tournament and editing an existing one, so the
 * date, capacity and multiplier are entered exactly the same way in both cases.
 */
function TournamentForm({
  tournament,
  onDone,
}: {
  tournament?: TournamentSummary;
  onDone: () => void;
}) {
  const isEdit = tournament != null;
  const create = useCreateTournament();
  const update = useUpdateTournament(tournament?.id ?? "");
  const mutation = isEdit ? update : create;

  const [form, setForm] = useState(() => {
    if (!tournament) {
      return {
        title: "",
        date: defaultDate(),
        time: "19:00",
        capacity: "16",
        ratingMultiplier: "1",
        paidPlaces: "9",
        description: "",
      };
    }

    const parts = toClubParts(tournament.startsAt);
    return {
      title: tournament.title,
      date: parts.date,
      time: parts.time,
      capacity: tournament.capacity == null ? "" : String(tournament.capacity),
      ratingMultiplier: String(tournament.ratingMultiplier),
      paidPlaces: String(tournament.paidPlaces),
      description: "",
    };
  });

  function submit(): void {
    // The typed time is the club's wall clock, not the browser's.
    const startsAt = fromClubParts(form.date, form.time);

    const shared = {
      title: form.title.trim(),
      startsAt: startsAt.toISOString(),
      // Registration closes when the cards go in the air.
      regClosesAt: startsAt.toISOString(),
      capacity: form.capacity ? Number(form.capacity) : null,
      ratingMultiplier: Number(form.ratingMultiplier),
      paidPlaces: form.paidPlaces ? Number(form.paidPlaces) : null,
      // Editing keeps whatever description exists unless something was typed.
      ...(form.description.trim() || !isEdit
        ? { description: form.description.trim() || null }
        : {}),
    };

    if (isEdit) {
      update.mutate(shared as unknown as UpdateTournamentInput, { onSuccess: onDone });
      return;
    }

    create.mutate({ ...shared, status: "reg_open" } as unknown as CreateTournamentInput, {
      onSuccess: onDone,
    });
  }

  return (
    <Card className="mb-4 space-y-3">
      <div>
        <label className="label" htmlFor="t-title">
          Название
        </label>
        <input
          id="t-title"
          className="field"
          value={form.title}
          placeholder="Weekly Freezeout #17"
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="t-date">
            Дата
          </label>
          <input
            id="t-date"
            type="date"
            className="field"
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="t-time">
            Время
          </label>
          <input
            id="t-time"
            type="time"
            className="field"
            value={form.time}
            onChange={(event) => setForm({ ...form, time: event.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor="t-capacity">
            Мест
          </label>
          <input
            id="t-capacity"
            type="number"
            min={2}
            className="field"
            value={form.capacity}
            onChange={(event) => setForm({ ...form, capacity: event.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="t-mult">
            Коэффициент
          </label>
          <input
            id="t-mult"
            type="number"
            step="0.5"
            min="0.5"
            className="field"
            value={form.ratingMultiplier}
            onChange={(event) => setForm({ ...form, ratingMultiplier: event.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="t-places">
            Призовых мест
          </label>
          <input
            id="t-places"
            type="number"
            min={1}
            className="field nums"
            value={form.paidPlaces}
            onChange={(event) => setForm({ ...form, paidPlaces: event.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="t-desc">
          Описание
        </label>
        <textarea
          id="t-desc"
          rows={2}
          className={cx("field", "resize-y")}
          value={form.description}
          placeholder="Формат, стек, особенности турнира"
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </div>

      {mutation.isError && (
        <p className="text-xs text-chip-red">{(mutation.error as Error).message}</p>
      )}

      {isEdit && tournament.registeredCount > 0 && (
        <p className="text-xs text-stone-500">
          На турнир уже записаны {tournament.registeredCount} игроков. Смену даты они увидят
          сразу — предупредите их сообщением в чате.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          loading={mutation.isPending}
          disabled={form.title.trim().length < 3}
          onClick={submit}
        >
          {isEdit ? "Сохранить изменения" : "Создать и открыть запись"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </Card>
  );
}

function defaultDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return toClubParts(date.toISOString()).date;
}
