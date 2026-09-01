import type { PaymentKind, TournamentDetail, TournamentPlayer } from "@poker/contracts";
import type { ClubSettings } from "@poker/contracts";
import { freePlaces, isPrizePlace, nextPlace, stacksOf } from "@poker/contracts";
import { useMemo, useState } from "react";
import { Avatar, Badge, Button, Card, ErrorState, Loading, cx } from "../../components/ui";
import {
  formatFullDate,
  formatNumber,
  formatRub,
  formatTime,
  PAYMENT_KIND_LABELS,
  placeLabel,
} from "../../lib/format";
import {
  useAddPayment,
  useClubSettings,
  useFinishTournament,
  useSetPlace,
  useTournament,
  useTournaments,
  useUpdateTournament,
  useVoidPayment,
} from "../../lib/queries";

/**
 * The cash desk for one evening: who paid what, who is out, and what the whole
 * thing is worth in rating. Mirrors the bot's game topic, for the times it is
 * easier to work from a laptop than from a phone.
 */
export function AdminGame() {
  const tournaments = useTournaments("all");
  const [selectedId, setSelectedId] = useState<string>("");

  const candidates = useMemo(
    () =>
      (tournaments.data ?? []).filter((tournament) =>
        ["reg_open", "reg_closed", "running", "finished"].includes(tournament.status),
      ),
    [tournaments.data],
  );

  // Default to whatever is running, or the closest thing to it.
  const activeId =
    selectedId || candidates.find((row) => row.status === "running")?.id || candidates[0]?.id || "";

  if (tournaments.isPending) return <Loading />;
  if (tournaments.isError) return <ErrorState error={tournaments.error} />;

  return (
    <>
      <Card className="mb-4">
        <label className="label" htmlFor="game-tournament">
          Турнир
        </label>
        <select
          id="game-tournament"
          className="field"
          value={activeId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {candidates.length === 0 && <option value="">— нет подходящих турниров —</option>}
          {candidates.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {formatFullDate(tournament.startsAt)} · {tournament.title}
              {tournament.status === "finished" ? " (завершён)" : ""}
            </option>
          ))}
        </select>
      </Card>

      {activeId && <GameDesk key={activeId} tournamentId={activeId} />}
    </>
  );
}

function GameDesk({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournament(tournamentId);
  const settings = useClubSettings(true);
  const finish = useFinishTournament(tournamentId);
  const update = useUpdateTournament(tournamentId);
  const [confirming, setConfirming] = useState(false);

  if (tournament.isPending || settings.isPending) return <Loading />;
  if (tournament.isError) return <ErrorState error={tournament.error} />;
  if (!tournament.data || !settings.data) return null;

  const detail = tournament.data;
  const seats = seatsOf(detail);
  const playing = seats.filter((seat) => seat.paid.entry);
  const isFinished = detail.status === "finished";

  return (
    <>
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{detail.title}</h2>
            <p className="text-sm text-stone-400">
              {formatFullDate(detail.startsAt)} в{" "}
              <span className="nums">{formatTime(detail.startsAt)}</span>
            </p>
          </div>
          {isFinished ? (
            <Badge tone="neutral">Завершён, рейтинг начислен</Badge>
          ) : (
            <Badge tone="green">Идёт</Badge>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Играют" value={String(playing.length)} />
          <Stat label="Фишек в игре" value={formatNumber(detail.chipsInPlay)} />
          <Stat label="Касса" value={formatRub(detail.totalRub ?? 0)} />
          <Stat label="Первое место" value={`${formatNumber(detail.ratingPool)} очков`} />
        </dl>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-felt-800 pt-3">
          <div>
            <label className="label" htmlFor="paid-places">
              Призовых мест
            </label>
            <input
              id="paid-places"
              type="number"
              min={1}
              max={500}
              className="field nums w-24"
              defaultValue={detail.paidPlaces}
              onBlur={(event) => {
                const places = Number(event.target.value);
                if (Number.isInteger(places) && places > 0 && places !== detail.paidPlaces) {
                  update.mutate({ paidPlaces: places });
                }
              }}
            />
          </div>

          <div className="flex-1" />

          {isFinished ? (
            <Button variant="ghost" loading={finish.isPending} onClick={() => finish.mutate(true)}>
              Вернуть в игру
            </Button>
          ) : confirming ? (
            <div className="flex gap-2">
              <Button
                loading={finish.isPending}
                onClick={() => {
                  finish.mutate(false);
                  setConfirming(false);
                }}
              >
                Да, завершить
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Отмена
              </Button>
            </div>
          ) : (
            <Button onClick={() => setConfirming(true)} disabled={detail.results.length === 0}>
              Завершить и начислить рейтинг
            </Button>
          )}
        </div>

        {finish.isError && (
          <p className="mt-2 text-sm text-chip-red">{(finish.error as Error).message}</p>
        )}
      </Card>

      {seats.length === 0 ? (
        <Card className="text-sm text-stone-400">
          На турнир никто не записан. Запишите игроков в расписании или проведите оплату входа — тот,
          кто заплатил, автоматически попадает в список.
        </Card>
      ) : (
        <ul className="space-y-2">
          {seats.map((seat) => (
            <PlayerRow
              key={seat.user.id}
              seat={seat}
              detail={detail}
              prices={settings.data}
              locked={isFinished}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function PlayerRow({
  seat,
  detail,
  prices,
  locked,
}: {
  seat: Seat;
  detail: TournamentDetail;
  prices: ClubSettings;
  locked: boolean;
}) {
  const addPayment = useAddPayment(detail.id);
  const voidPayment = useVoidPayment(detail.id);
  const setPlace = useSetPlace(detail.id);
  const busy = addPayment.isPending || voidPayment.isPending || setPlace.isPending;

  const priceOf: Record<Exclude<PaymentKind, "other">, number> = {
    entry: prices.entryPriceRub,
    rebuy: prices.rebuyPriceRub,
    addon: prices.addonPriceRub,
    drink: prices.drinkPriceRub,
  };

  const tab: string[] = [];
  if (seat.paid.entry) tab.push("вход");
  if (seat.paid.rebuys > 0) tab.push(`ребай ×${seat.paid.rebuys}`);
  if (seat.paid.addons > 0) tab.push(`адон ×${seat.paid.addons}`);
  if (seat.paid.drinks > 0) tab.push(`напиток ×${seat.paid.drinks}`);

  return (
    <li className="card p-3">
      <div className="flex items-center gap-3">
        <span
          className={cx(
            "nums w-8 shrink-0 text-center font-semibold",
            seat.place == null ? "text-stone-600" : "text-stone-200",
          )}
        >
          {isPrizePlace(seat.place, detail.paidPlaces) ? placeLabel(seat.place as number) : "—"}
        </span>
        <Avatar nickname={seat.user.nickname} url={seat.user.avatarUrl} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{seat.user.nickname}</p>
          <p className="truncate text-xs text-stone-500">
            {tab.length > 0 ? `${tab.join(", ")} — ${formatRub(seat.totalRub)}` : "ничего не оплачено"}
            {seat.chips > 0 && ` · ${formatNumber(seat.chips)} фишек`}
            {seat.ratingPoints != null && ` · ${formatNumber(seat.ratingPoints)} очков`}
          </p>
        </div>
      </div>

      {!locked && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-felt-800 pt-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || seat.paid.entry}
            onClick={() =>
              addPayment.mutate({ userId: seat.user.id, kind: "entry", amountRub: priceOf.entry })
            }
          >
            Вход {priceOf.entry}
          </Button>
          {(["rebuy", "addon"] as const).map((kind) => (
            <span key={kind} className="inline-flex gap-1">
              {([1, 2, 3] as const).map((times) => (
                <Button
                  key={times}
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    addPayment.mutate({
                      userId: seat.user.id,
                      kind,
                      amountRub: priceOf[kind] * times,
                      multiplier: times,
                    })
                  }
                >
                  {times === 1 ? `${PAYMENT_KIND_LABELS[kind]} ${priceOf[kind]}` : `×${times}`}
                </Button>
              ))}
            </span>
          ))}
          {(prices.menuItems ?? [])
            .filter((item) => item.isActive && !item.isFixed)
            .map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  addPayment.mutate({
                    userId: seat.user.id,
                    kind: item.kind,
                    amountRub: item.priceRub,
                    menuItemId: item.id,
                  })
                }
              >
                {item.title}
                {item.priceRub > 0 ? ` ${item.priceRub}` : ""}
              </Button>
            ))}

          {seat.place == null && nextPlace(detail) != null && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                const place = nextPlace(detail);
                if (place != null) setPlace.mutate({ userId: seat.user.id, place });
              }}
            >
              Выбыл — {nextPlace(detail)} место
            </Button>
          )}

          <select
            aria-label={`Место игрока ${seat.user.nickname}`}
            className="field h-8 w-auto py-0 text-sm"
            disabled={busy}
            value={isPrizePlace(seat.place, detail.paidPlaces) ? String(seat.place) : ""}
            onChange={(event) =>
              setPlace.mutate({
                userId: seat.user.id,
                place: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">в игре</option>
            {placeOptions(detail, seat.place).map((place) => (
              <option key={place} value={place}>
                {place} место
              </option>
            ))}
          </select>

          {seat.lastPaymentId && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => voidPayment.mutate(seat.lastPaymentId as string)}
            >
              Отменить оплату
            </Button>
          )}
        </div>
      )}

      {addPayment.isError && (
        <p className="mt-2 text-xs text-chip-red">{(addPayment.error as Error).message}</p>
      )}
      {setPlace.isError && (
        <p className="mt-2 text-xs text-chip-red">{(setPlace.error as Error).message}</p>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="nums mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

/** Free places plus the one this player already holds, deepest first. */
function placeOptions(detail: TournamentDetail, current: number | null): number[] {
  const open = freePlaces(detail);
  return current == null ? open : [current, ...open].sort((a, b) => b - a);
}

type Seat = {
  user: TournamentPlayer["user"];
  totalRub: number;
  chips: number;
  place: number | null;
  ratingPoints: number | null;
  paid: { entry: boolean; rebuys: number; addons: number; drinks: number };
  lastPaymentId: string | null;
};

/** Everyone signed up, plus anyone who walked in and paid. */
function seatsOf(detail: TournamentDetail): Seat[] {
  const placeByUser = new Map(detail.results.map((row) => [row.user.id, row.place]));
  const byId = new Map<string, Seat>();

  for (const registration of detail.registrations) {
    if (registration.status !== "registered") continue;
    byId.set(registration.user.id, {
      user: registration.user,
      totalRub: 0,
      chips: 0,
      place: placeByUser.get(registration.user.id) ?? null,
      ratingPoints: null,
      paid: { entry: false, rebuys: 0, addons: 0, drinks: 0 },
      lastPaymentId: null,
    });
  }

  for (const player of detail.players ?? []) {
    byId.set(player.user.id, {
      user: player.user,
      totalRub: player.totalRub,
      chips: player.chips,
      place: player.place ?? placeByUser.get(player.user.id) ?? null,
      ratingPoints: player.ratingPoints,
      paid: {
        entry: player.payments.some((payment) => payment.kind === "entry"),
        rebuys: stacksOf(player.payments, "rebuy", detail.startingStack),
        addons: stacksOf(player.payments, "addon", detail.addonChips),
        drinks: player.payments.filter((payment) => payment.kind === "drink").length,
      },
      lastPaymentId: player.payments.at(-1)?.id ?? null,
    });
  }

  return [...byId.values()].sort((a, b) => {
    if (a.place != null && b.place != null) return a.place - b.place;
    if (a.place != null) return -1;
    if (b.place != null) return 1;
    return a.user.nickname.localeCompare(b.user.nickname, "ru");
  });
}

