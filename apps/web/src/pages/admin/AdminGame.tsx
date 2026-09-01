import type { Achievement, PaymentKind, TournamentDetail, TournamentPlayer } from "@poker/contracts";
import type { ClubSettings } from "@poker/contracts";
import { freePlaces, isEveningHand, isPrizePlace, nextPlace, stacksOf } from "@poker/contracts";
import { useMemo, useState } from "react";
import { Avatar, Badge, Button, Card, ErrorState, Loading, Select, cx } from "../../components/ui";
import {
  formatFullDate,
  formatNumber,
  formatRub,
  formatTime,
  placeLabel,
} from "../../lib/format";
import {
  useAchievements,
  useAddPayment,
  useClubSettings,
  useFinishTournament,
  useGrantAchievement,
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
        <Select
          id="game-tournament"
          aria-label="Турнир"
          value={activeId}
          onChange={setSelectedId}
          options={
            candidates.length === 0
              ? [{ value: "", label: "- нет подходящих турниров -" }]
              : candidates.map((tournament) => ({
                  value: tournament.id,
                  label: `${formatFullDate(tournament.startsAt)} · ${tournament.title}${
                    tournament.status === "finished" ? " (завершён)" : ""
                  }`,
                }))
          }
        />
      </Card>

      {activeId && <GameDesk key={activeId} tournamentId={activeId} />}
    </>
  );
}

function GameDesk({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournament(tournamentId);
  const settings = useClubSettings(true);
  const catalogue = useAchievements();
  const finish = useFinishTournament(tournamentId);
  const update = useUpdateTournament(tournamentId);
  const [confirming, setConfirming] = useState(false);
  const [query, setQuery] = useState("");

  if (tournament.isPending || settings.isPending) return <Loading />;
  if (tournament.isError) return <ErrorState error={tournament.error} />;
  if (!tournament.data || !settings.data) return null;

  const detail = tournament.data;
  const seats = seatsOf(detail);
  const playing = seats.filter((seat) => seat.paid.entry);
  const isFinished = detail.status === "finished";
  const needle = query.trim().toLowerCase();
  const visibleSeats = needle
    ? seats.filter((seat) => seat.user.nickname.toLowerCase().includes(needle))
    : seats;

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
          На турнир никто не записан. Запишите игроков в расписании или проведите оплату входа - тот,
          кто заплатил, автоматически попадает в список.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-felt-800 px-3 py-2">
            <input
              type="search"
              className="field max-w-80"
              value={query}
              placeholder="Поиск по нику"
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Поиск игрока по нику"
            />
            <span className="text-xs text-stone-500">
              {visibleSeats.length} из {seats.length}
            </span>
          </div>

          {visibleSeats.length === 0 ? (
            <p className="px-3 py-6 text-sm text-stone-400">Никого с таким ником нет.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-felt-950 text-left text-xs font-medium text-stone-400">
                  <tr className="border-b border-felt-800">
                    <th className="w-[14rem] px-3 py-2 font-medium">Игрок</th>
                    <th className="w-[6.5rem] px-2 py-2 font-medium">Вход</th>
                    <th className="w-[9.5rem] px-2 py-2 font-medium">Ребай</th>
                    <th className="w-[9.5rem] px-2 py-2 font-medium">Адон</th>
                    <th className="px-2 py-2 font-medium">Бар</th>
                    <th className="px-2 py-2 font-medium">Комбинации</th>
                    <th className="w-[13rem] px-2 py-2 font-medium">Место</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSeats.map((seat) => (
                    <PlayerRow
                      key={seat.user.id}
                      seat={seat}
                      detail={detail}
                      prices={settings.data}
                      hands={eveningHands(catalogue.data ?? [])}
                      locked={isFinished}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function PlayerRow({
  seat,
  detail,
  prices,
  hands,
  locked,
}: {
  seat: Seat;
  detail: TournamentDetail;
  prices: ClubSettings;
  hands: Achievement[];
  locked: boolean;
}) {
  const addPayment = useAddPayment(detail.id);
  const voidPayment = useVoidPayment(detail.id);
  const setPlace = useSetPlace(detail.id);
  const grant = useGrantAchievement();
  const busy = addPayment.isPending || voidPayment.isPending || setPlace.isPending || grant.isPending;

  const priceOf: Record<Exclude<PaymentKind, "other">, number> = {
    entry: prices.entryPriceRub,
    rebuy: prices.rebuyPriceRub,
    addon: prices.addonPriceRub,
    drink: prices.drinkPriceRub,
  };

  const extras = (prices.menuItems ?? []).filter((item) => item.isActive && !item.isFixed);
  const upcoming = nextPlace(detail);
  const rowError =
    (addPayment.error as Error | null)?.message ??
    (grant.error as Error | null)?.message ??
    (setPlace.error as Error | null)?.message;

  return (
    <tr className="h-14 border-b border-felt-800/80 last:border-b-0">
      <td className="px-3 py-1.5 align-middle">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar nickname={seat.user.nickname} url={seat.user.avatarUrl} size={28} />
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{seat.user.nickname}</p>
            <p className="truncate text-xs text-stone-500">
              {seat.totalRub > 0 ? formatRub(seat.totalRub) : "не оплачен"}
              {seat.chips > 0 ? ` · ${formatNumber(seat.chips)} фишек` : ""}
              {seat.lastPaymentId && !locked ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="text-stone-400 hover:text-chip-red"
                    disabled={busy}
                    onClick={() => voidPayment.mutate(seat.lastPaymentId as string)}
                  >
                    отмена
                  </button>
                </>
              ) : null}
            </p>
            {rowError ? <p className="truncate text-xs text-chip-red">{rowError}</p> : null}
          </div>
        </div>
      </td>

      <td className="px-2 py-1.5 align-middle">
        {locked ? (
          <span className="text-xs text-stone-400">{seat.paid.entry ? "оплачен" : "-"}</span>
        ) : (
          <Button
            size="sm"
            variant={seat.paid.entry ? "secondary" : "ghost"}
            className="h-8 w-[5.5rem]"
            disabled={busy || seat.paid.entry}
            onClick={() =>
              addPayment.mutate({ userId: seat.user.id, kind: "entry", amountRub: priceOf.entry })
            }
          >
            {seat.paid.entry ? "оплачен" : `${priceOf.entry} ₽`}
          </Button>
        )}
      </td>

      <td className="px-2 py-1.5 align-middle">
        <QtyCharge
          count={seat.paid.rebuys}
          unitPrice={priceOf.rebuy}
          disabled={busy || locked}
          locked={locked}
          onCharge={(times) =>
            addPayment.mutate({
              userId: seat.user.id,
              kind: "rebuy",
              amountRub: priceOf.rebuy * times,
              multiplier: times,
            })
          }
        />
      </td>

      <td className="px-2 py-1.5 align-middle">
        <QtyCharge
          count={seat.paid.addons}
          unitPrice={priceOf.addon}
          disabled={busy || locked}
          locked={locked}
          onCharge={(times) =>
            addPayment.mutate({
              userId: seat.user.id,
              kind: "addon",
              amountRub: priceOf.addon * times,
              multiplier: times,
            })
          }
        />
      </td>

      <td className="px-2 py-1.5 align-middle">
        <div className="flex h-8 items-center gap-1">
          {extras.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant="ghost"
              disabled={busy || locked}
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
        </div>
      </td>

      <td className="px-2 py-1.5 align-middle">
        <div className="flex h-8 flex-nowrap items-center gap-1">
          {hands.map((hand) => {
            const count = grantCount(detail, seat.user.id, hand.id);
            return (
              <button
                key={hand.id}
                type="button"
                title={hand.title}
                disabled={busy || locked}
                onClick={() =>
                  grant.mutate({
                    userId: seat.user.id,
                    achievementId: hand.id,
                    tournamentId: detail.id,
                  })
                }
                className={cx(
                  "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs whitespace-nowrap",
                  count > 0
                    ? "border-gold-500/40 bg-gold-500/10 text-gold-400"
                    : "border-gold-500/20 text-stone-300 hover:bg-gold-500/10",
                  "disabled:opacity-40",
                )}
              >
                {hand.icon ? <span aria-hidden>{hand.icon}</span> : null}
                {hand.title}
                {count > 0 ? <span className="nums text-gold-400">×{count}</span> : null}
              </button>
            );
          })}
        </div>
      </td>

      <td className="px-2 py-1.5 align-middle">
        <div className="flex h-8 items-center gap-1">
          {!locked && (
            <Button
              size="sm"
              className="min-w-[7.5rem]"
              disabled={busy || seat.place != null || upcoming == null}
              onClick={() => {
                if (upcoming != null) setPlace.mutate({ userId: seat.user.id, place: upcoming });
              }}
            >
              {seat.place != null
                ? `${seat.place} место`
                : upcoming != null
                  ? `Выбыл - ${upcoming}`
                  : "в игре"}
            </Button>
          )}
          {locked ? (
            <span className="nums text-stone-200">
              {isPrizePlace(seat.place, detail.paidPlaces) ? placeLabel(seat.place as number) : "-"}
            </span>
          ) : (
            <select
              aria-label={`Место игрока ${seat.user.nickname}`}
              className="field h-8 w-[6.5rem] py-0 text-xs"
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
          )}
        </div>
      </td>
    </tr>
  );
}

const QTY = [1, 2, 3] as const;

function QtyCharge({
  count,
  unitPrice,
  disabled,
  locked,
  onCharge,
}: {
  count: number;
  unitPrice: number;
  disabled: boolean;
  locked: boolean;
  onCharge: (times: number) => void;
}) {
  if (locked) {
    return <span className="nums text-stone-300">{count > 0 ? `×${count}` : "-"}</span>;
  }

  return (
    <div className="flex h-8 items-center gap-1">
      <span className="nums w-4 text-center text-xs text-stone-400">{count > 0 ? count : ""}</span>
      <span className="inline-flex overflow-hidden rounded-lg border border-gold-500/25">
        {QTY.map((times) => (
          <button
            key={times}
            type="button"
            disabled={disabled}
            title={`${times} × ${unitPrice} ₽`}
            onClick={() => onCharge(times)}
            className="h-8 w-8 border-l border-gold-500/15 text-xs text-gold-400 first:border-l-0 hover:bg-gold-500/15 disabled:opacity-40"
          >
            ×{times}
          </button>
        ))}
      </span>
    </div>
  );
}

function grantCount(detail: TournamentDetail, userId: string, achievementId: string): number {
  return (detail.eveningGrants ?? []).filter(
    (row) => row.userId === userId && row.achievementId === achievementId,
  ).length;
}

const HAND_ORDER = ["hand_of_the_day", "quads", "straight_flush", "royal_flush"];

function eveningHands(list: Achievement[]): Achievement[] {
  return list
    .filter(isEveningHand)
    .sort((a, b) => {
      const ai = HAND_ORDER.indexOf(a.code);
      const bi = HAND_ORDER.indexOf(b.code);
      if (ai === -1 && bi === -1) return b.ratingPoints - a.ratingPoints;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
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

