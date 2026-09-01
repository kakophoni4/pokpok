import type {
  CreateTournamentInput,
  TournamentSummary,
  UpdateTournamentInput,
} from "@poker/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, ErrorState, Loading, Tabs, cx } from "../../components/ui";
import {
  formatFullDate,
  formatTime,
  fromClubParts,
  toClubParts,
  TOURNAMENT_STATUS_LABELS,
} from "../../lib/format";
import {
  useClubSettings,
  useCreateTournament,
  useDeleteTournament,
  useTournaments,
  useUpdateTournament,
} from "../../lib/queries";

const LIVE: TournamentSummary["status"][] = [
  "draft",
  "announced",
  "reg_open",
  "reg_closed",
  "running",
];

export function AdminTournaments({ canDelete }: { canDelete: boolean }) {
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const tournaments = useTournaments("all");
  const rows = (tournaments.data ?? []).filter((tournament) =>
    scope === "upcoming" ? LIVE.includes(tournament.status) : !LIVE.includes(tournament.status),
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Tabs
          value={scope}
          onChange={setScope}
          options={[
            { value: "upcoming", label: "Текущие" },
            { value: "past", label: "Завершённые" },
          ]}
        />
        <Button size="sm" onClick={() => setCreating((value) => !value)}>
          {creating ? "Свернуть" : "+ Новый турнир"}
        </Button>
      </div>

      {creating && <TournamentForm onDone={() => setCreating(false)} />}

      {tournaments.isPending && <Loading />}
      {tournaments.isError && <ErrorState error={tournaments.error} />}

      {tournaments.data && rows.length === 0 && (
        <p className="text-sm text-stone-500">
          {scope === "upcoming" ? "Нет текущих турниров." : "Нет завершённых турниров."}
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((tournament) => (
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
            {tournament.minRating != null && tournament.minRating > 0
              ? ` · мин. ${tournament.minRating} очков`
              : ""}
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
  const settings = useClubSettings(true);
  const venues = settings.data?.venues ?? [];
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState(() => {
    if (!tournament) {
      return {
        title: "",
        date: defaultDate(),
        time: "19:00",
        capacity: "16",
        ratingMultiplier: "1",
        paidPlaces: "9",
        minRating: "",
        description: "",
        venueId: "",
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
      minRating: tournament.minRating == null ? "" : String(tournament.minRating),
      description: "",
      venueId: tournament.venue?.id ?? "",
    };
  });

  function submit(): void {
    setFormError(null);
    if (!form.date || !form.time) {
      setFormError("Укажите дату и время");
      return;
    }
    const startsAt = fromClubParts(form.date, form.time);
    if (Number.isNaN(startsAt.getTime())) {
      setFormError("Не получилось прочитать дату — проверьте поля");
      return;
    }

    const venueId = form.venueId || venues[0]?.id || null;

    const shared = {
      title: form.title.trim(),
      startsAt: startsAt.toISOString(),
      // Registration closes when the cards go in the air.
      regClosesAt: startsAt.toISOString(),
      capacity: form.capacity ? Number(form.capacity) : null,
      ratingMultiplier: Number(form.ratingMultiplier),
      paidPlaces: form.paidPlaces ? Number(form.paidPlaces) : null,
      minRating: form.minRating ? Number(form.minRating) : null,
      venueId,
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

      <div>
        <label className="label" htmlFor="t-venue">
          Адрес
        </label>
        {venues.length === 0 ? (
          <p className="text-sm text-stone-500">
            Сначала добавьте адрес в настройках клуба — тогда его можно будет выбрать здесь.
          </p>
        ) : (
          <select
            id="t-venue"
            className="field"
            value={form.venueId || venues[0]?.id || ""}
            onChange={(event) => setForm({ ...form, venueId: event.target.value })}
          >
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.address ? `${venue.title} — ${venue.address}` : venue.title}
              </option>
            ))}
          </select>
        )}
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
        <label className="label" htmlFor="t-min-rating">
          Мин. очков за 1 место
        </label>
        <input
          id="t-min-rating"
          type="number"
          min={0}
          className="field nums max-w-40"
          value={form.minRating}
          placeholder="как по фишкам"
          onChange={(event) => setForm({ ...form, minRating: event.target.value })}
        />
        <p className="mt-1 text-xs text-stone-500">
          Если придёт мало людей и фишек будет мало, первое место всё равно получит не меньше этого.
        </p>
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

      {(mutation.isError || formError) && (
        <p className="text-xs text-chip-red">
          {formError ?? (mutation.error as Error).message}
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
