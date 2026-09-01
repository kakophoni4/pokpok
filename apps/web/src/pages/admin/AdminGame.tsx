import type { Achievement, ClubMenuItem, PaymentKind, TournamentDetail, TournamentPlayer } from "@poker/contracts";
import type { ClubSettings } from "@poker/contracts";
import { freePlaces, isEveningHand, isPrizePlace, nextPlace, stacksOf } from "@poker/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  useRevokeAchievement,
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
    <GameDesk
      key={activeId || "none"}
      tournamentId={activeId}
      picker={
        <div>
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
        </div>
      }
    />
  );
}

function GameDesk({
  tournamentId,
  picker,
}: {
  tournamentId: string;
  picker: React.ReactNode;
}) {
  const tournament = useTournament(tournamentId);
  const settings = useClubSettings(true);
  const catalogue = useAchievements();
  const finish = useFinishTournament(tournamentId);
  const update = useUpdateTournament(tournamentId);
  const [confirming, setConfirming] = useState(false);
  const [query, setQuery] = useState("");

  if (!tournamentId) {
    return <Card>{picker}</Card>;
  }

  if (tournament.isPending || settings.isPending) {
    return (
      <Card>
        {picker}
        <Loading />
      </Card>
    );
  }
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
    <Card className="overflow-visible p-0">
      <div className="space-y-4 p-3">
        {picker}

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

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Играют" value={String(playing.length)} />
          <Stat label="Фишек в игре" value={formatNumber(detail.chipsInPlay)} />
          <Stat label="Касса" value={formatRub(detail.totalRub ?? 0)} />
          <Stat label="Первое место" value={`${formatNumber(detail.ratingPool)} очков`} />
        </dl>

        <div className="flex flex-wrap items-end gap-3 border-t border-felt-800 pt-3">
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
          <p className="text-sm text-chip-red">{(finish.error as Error).message}</p>
        )}

        {seats.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-felt-800 pt-3">
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
        )}
      </div>

      {seats.length === 0 ? (
        <p className="border-t border-felt-800 px-3 py-4 text-sm text-stone-400">
          На турнир никто не записан. Запишите игроков в расписании или проведите оплату входа - тот,
          кто заплатил, автоматически попадает в список.
        </p>
      ) : visibleSeats.length === 0 ? (
        <p className="border-t border-felt-800 px-3 py-4 text-sm text-stone-400">
          Никого с таким ником нет.
        </p>
      ) : (
        <div className="border-t border-felt-800">
          <div className="hidden grid-cols-[minmax(0,1.3fr)_4.5rem_6.75rem_6.75rem_5.75rem_6.6rem] gap-2 px-3 py-2 text-xs text-stone-400 sm:grid">
            <span>Игрок</span>
            <span>Вход</span>
            <span>Ребай</span>
            <span>Адон</span>
            <span>Бар</span>
            <span>Место</span>
          </div>
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
        </div>
      )}
    </Card>
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
  const revoke = useRevokeAchievement();
  const busy =
    addPayment.isPending ||
    voidPayment.isPending ||
    setPlace.isPending ||
    grant.isPending ||
    revoke.isPending;

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
    (revoke.error as Error | null)?.message ??
    (setPlace.error as Error | null)?.message;

  return (
    <div className="grid grid-cols-2 gap-2 border-t border-felt-800/80 px-3 py-2 sm:grid-cols-[minmax(0,1.3fr)_4.5rem_6.75rem_6.75rem_5.75rem_6.6rem] sm:items-center">
      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
        <Avatar nickname={seat.user.nickname} url={seat.user.avatarUrl} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{seat.user.nickname}</p>
          <p className="truncate text-xs text-stone-500">
            {seat.totalRub > 0 ? formatRub(seat.totalRub) : "не оплачен"}
            {seat.chips > 0 ? ` · ${formatNumber(seat.chips)} фишек` : ""}
            {seat.paid.extras > 0 ? ` · бар ×${seat.paid.extras}` : ""}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-7 px-2 text-xs"
            disabled={busy || locked || !seat.lastPaymentId}
            onClick={() => {
              if (seat.lastPaymentId) voidPayment.mutate(seat.lastPaymentId);
            }}
          >
            Отменить оплату
          </Button>
          {rowError ? <p className="truncate text-xs text-chip-red">{rowError}</p> : null}
        </div>
      </div>

      <div>
        {locked ? (
          <span className="text-xs text-stone-400">{seat.paid.entry ? "оплачен" : "-"}</span>
        ) : (
          <Button
            size="sm"
            variant={seat.paid.entry ? "secondary" : "ghost"}
            className="h-8 w-full"
            disabled={busy || seat.paid.entry}
            onClick={() =>
              addPayment.mutate({ userId: seat.user.id, kind: "entry", amountRub: priceOf.entry })
            }
          >
            {seat.paid.entry ? "оплачен" : `${priceOf.entry} ₽`}
          </Button>
        )}
      </div>

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

      <BarPicker
        extras={extras}
        count={seat.paid.extras}
        disabled={busy || locked}
        locked={locked}
        onPick={(item) =>
          addPayment.mutate({
            userId: seat.user.id,
            kind: item.kind,
            amountRub: item.priceRub,
            menuItemId: item.id,
          })
        }
      />

      <div className="flex h-8 items-center gap-1">
        {!locked && (
          <Button
            size="sm"
            className="h-8 min-w-0 flex-1 px-2"
            disabled={busy || seat.place != null || upcoming == null}
            onClick={() => {
              if (upcoming != null) setPlace.mutate({ userId: seat.user.id, place: upcoming });
            }}
          >
            {seat.place != null ? `${seat.place}` : upcoming != null ? `Выбыл ${upcoming}` : "в игре"}
          </Button>
        )}
        {locked ? (
          <span className="nums text-stone-200">
            {isPrizePlace(seat.place, detail.paidPlaces) ? placeLabel(seat.place as number) : "-"}
          </span>
        ) : (
          <select
            aria-label={`Место игрока ${seat.user.nickname}`}
            className="field h-8 min-w-0 flex-1 py-0 text-xs"
            disabled={busy}
            value={isPrizePlace(seat.place, detail.paidPlaces) ? String(seat.place) : ""}
            onChange={(event) =>
              setPlace.mutate({
                userId: seat.user.id,
                place: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">игра</option>
            {placeOptions(detail, seat.place).map((place) => (
              <option key={place} value={place}>
                {place}
              </option>
            ))}
          </select>
        )}
      </div>

      {hands.length > 0 && (
        <div className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-6">
          {hands.map((hand) => {
            const count = grantCount(detail, seat.user.id, hand.id);
            const lastId = lastGrantId(detail, seat.user.id, hand.id);
            return (
              <span
                key={hand.id}
                className="inline-flex h-8 overflow-hidden rounded-lg border border-gold-500/25"
              >
                <button
                  type="button"
                  title={`Выдать: ${hand.title}`}
                  disabled={busy || locked}
                  onClick={() =>
                    grant.mutate({
                      userId: seat.user.id,
                      achievementId: hand.id,
                      tournamentId: detail.id,
                    })
                  }
                  className={cx(
                    "inline-flex h-8 items-center gap-1 px-2 text-xs whitespace-nowrap",
                    count > 0 ? "bg-gold-500/10 text-gold-400" : "text-stone-300 hover:bg-gold-500/10",
                    "disabled:opacity-40",
                  )}
                >
                  {hand.icon ? <span aria-hidden>{hand.icon}</span> : null}
                  {hand.title}
                  {count > 0 ? <span className="nums">×{count}</span> : null}
                </button>
                <button
                  type="button"
                  title={`Снять: ${hand.title}`}
                  disabled={busy || locked || !lastId}
                  onClick={() => {
                    if (lastId) revoke.mutate(lastId);
                  }}
                  className="h-8 w-7 border-l border-gold-500/20 text-sm text-stone-400 hover:bg-chip-red/20 hover:text-chip-red disabled:opacity-20"
                >
                  −
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

const QTY = [1, 2, 3] as const;

function BarPicker({
  extras,
  count,
  disabled,
  locked,
  onPick,
}: {
  extras: ClubMenuItem[];
  count: number;
  disabled: boolean;
  locked: boolean;
  onPick: (item: ClubMenuItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<DOMRect | null>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (root.current?.contains(target) || list.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function place() {
      setBox(button.current?.getBoundingClientRect() ?? null);
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  if (locked) {
    return <span className="nums text-xs text-stone-400">{count > 0 ? `×${count}` : "-"}</span>;
  }

  if (extras.length === 0) {
    return <span className="text-xs text-stone-600">-</span>;
  }

  return (
    <div ref={root} className="min-w-0">
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Бар"
        onClick={() => setOpen((current) => !current)}
        className="field flex h-8 w-full items-center justify-between gap-1 px-2 py-0 text-xs"
      >
        <span className="truncate">{count > 0 ? `Бар ×${count}` : "Бар"}</span>
        <svg viewBox="0 0 12 8" aria-hidden className={cx("size-2.5 shrink-0 text-gold-400", open && "rotate-180")}>
          <path
            d="M1.2 1.4L6 6.2L10.8 1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open &&
        box &&
        createPortal(
          <div
            ref={list}
            role="menu"
            style={{
              position: "fixed",
              top: box.bottom + 4,
              left: Math.min(box.left, window.innerWidth - 272),
              width: 256,
              zIndex: 80,
            }}
            className="max-h-72 overflow-auto rounded-xl border border-gold-500/25 bg-felt-950 py-1 shadow-[0_16px_40px_rgba(0,0,0,0.7)]"
          >
            {extras.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-stone-200 hover:bg-felt-800"
                onClick={() => {
                  onPick(item);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="nums shrink-0 text-gold-400">
                  {item.priceRub > 0 ? `${item.priceRub} ₽` : "0 ₽"}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

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

function lastGrantId(detail: TournamentDetail, userId: string, achievementId: string): string | null {
  const rows = (detail.eveningGrants ?? []).filter(
    (row) => row.userId === userId && row.achievementId === achievementId,
  );
  return rows.at(-1)?.id ?? null;
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
  paid: { entry: boolean; rebuys: number; addons: number; drinks: number; extras: number };
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
      paid: { entry: false, rebuys: 0, addons: 0, drinks: 0, extras: 0 },
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
        extras: player.payments.filter(
          (payment) => payment.kind !== "entry" && payment.kind !== "rebuy" && payment.kind !== "addon",
        ).length,
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

const PREVIEW_BAR: ClubMenuItem[] = [
  "Напиток",
  "Кальян",
  "Энергетик",
  "Кола",
  "Вода",
  "Чай",
  "Кофе",
  "Снэк",
  "Пицца",
  "Салат",
  "Десерт",
  "Сок",
  "Лимонад",
  "Морс",
  "Какао",
  "Мороженое",
  "Чипсы",
  "Сэндвич",
].map((title, index) => ({
  id: `preview-bar-${index}`,
  title,
  kind: "drink",
  priceRub: [200, 1500, 250, 150, 80, 100, 180, 300, 450, 400, 280, 220, 190, 160, 170, 200, 120, 350][index] ?? 100,
  chips: 0,
  isFixed: false,
  isPromo: false,
  isActive: true,
  sortOrder: index,
}));

/** DEV-only layout check: a full evening row with 18 bar items. */
export function EveningLayoutPreview() {
  return (
    <Card className="overflow-visible p-0">
      <p className="border-b border-felt-800 px-3 py-2 text-sm text-stone-400">
        Макет вечера: 18 позиций бара в списке, строка без горизонтальной прокрутки
      </p>
      <div className="hidden grid-cols-[minmax(0,1.3fr)_4.5rem_6.75rem_6.75rem_5.75rem_6.6rem] gap-2 px-3 py-2 text-xs text-stone-400 sm:grid">
        <span>Игрок</span>
        <span>Вход</span>
        <span>Ребай</span>
        <span>Адон</span>
        <span>Бар</span>
        <span>Место</span>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-felt-800/80 px-3 py-2 sm:grid-cols-[minmax(0,1.3fr)_4.5rem_6.75rem_6.75rem_5.75rem_6.6rem] sm:items-center">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <p className="font-medium">DenisPro</p>
          <p className="text-xs text-stone-500">1 500 ₽ · бар ×2</p>
          <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs">
            Отменить оплату
          </Button>
        </div>
        <Button size="sm" variant="secondary" className="h-8 w-full">
          оплачен
        </Button>
        <QtyCharge count={2} unitPrice={500} disabled={false} locked={false} onCharge={() => undefined} />
        <QtyCharge count={1} unitPrice={500} disabled={false} locked={false} onCharge={() => undefined} />
        <BarPicker extras={PREVIEW_BAR} count={2} disabled={false} locked={false} onPick={() => undefined} />
        <div className="flex h-8 gap-1">
          <Button size="sm" className="h-8 flex-1 px-2">
            Выбыл 9
          </Button>
          <span className="field flex h-8 flex-1 items-center px-2 text-xs">игра</span>
        </div>
      </div>
    </Card>
  );
}

