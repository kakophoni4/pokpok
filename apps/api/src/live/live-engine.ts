import type {
  ClockView,
  LiveConfig,
  LiveSeat,
  LiveState,
} from "@poker/contracts";

export function initialState(config: LiveConfig): LiveState {
  return {
    config,
    tables: Array.from({ length: config.maxTables }, (_, i) => ({
      number: i + 1,
      dealerId: null,
      open: false,
      breakRequested: false,
    })),
    seats: [],
    orders: [],
    bounties: [],
    alerts: [],
    clock: { running: false, elapsedSeconds: 0, startedAt: null },
  };
}
export function clockView(state: LiveState, now = Date.now()): ClockView {
  const elapsed =
    state.clock.elapsedSeconds +
    (state.clock.running && state.clock.startedAt
      ? Math.max(
          0,
          Math.floor((now - Date.parse(state.clock.startedAt)) / 1000),
        )
      : 0);
  let rest = elapsed;
  for (const [index, level] of state.config.levels.entries()) {
    if (rest < level.seconds)
      return {
        index,
        remaining: level.seconds - rest,
        level,
        next: state.config.levels[index + 1] ?? null,
        elapsed,
        complete: false,
      };
    rest -= level.seconds;
  }
  const index = state.config.levels.length - 1;
  return {
    index,
    remaining: 0,
    level: state.config.levels[index]!,
    next: null,
    elapsed,
    complete: true,
  };
}
export function rebuyOpen(state: LiveState, now = Date.now()): boolean {
  const c = clockView(state, now);
  return !c.complete && c.index + 1 <= state.config.rebuyClosesLevel;
}
export function occupancy(state: LiveState, table: number): number {
  return state.seats.filter((s) => s.state === "playing" && s.table === table)
    .length;
}
export function assignSeat(
  state: LiveState,
  player: LiveSeat,
  exclude?: number,
): boolean {
  const tables = state.tables
    .filter(
      (t) =>
        t.open &&
        t.dealerId &&
        t.number !== exclude &&
        occupancy(state, t.number) < state.config.seatsPerTable,
    )
    .sort(
      (a, b) =>
        (exclude === undefined
          ? 0
          : occupancy(state, a.number) - occupancy(state, b.number)) ||
        a.number - b.number,
    );
  let table = tables[0];
  if (
    !table &&
    !clockView(state).complete &&
    clockView(state).index + 1 <= state.config.registrationClosesLevel
  ) {
    table = state.tables.find(
      (t) =>
        !t.open &&
        t.dealerId &&
        t.number !== exclude &&
        occupancy(state, t.number) === 0,
    );
    if (table) table.open = true;
  }
  if (!table) {
    player.table = null;
    player.seat = null;
    return false;
  }
  const used = new Set(
    state.seats
      .filter(
        (s) =>
          s.state === "playing" &&
          s.table === table.number &&
          s.userId !== player.userId,
      )
      .map((s) => s.seat),
  );
  player.table = table.number;
  player.seat = Array.from(
    { length: state.config.seatsPerTable },
    (_, i) => i + 1,
  ).find((n) => !used.has(n))!;
  return true;
}
export function canBreak(state: LiveState, table: number): boolean {
  const others = state.tables.filter(
    (t) => t.open && t.dealerId && t.number !== table,
  );
  return (
    others.reduce(
      (sum, t) => sum + state.config.seatsPerTable - occupancy(state, t.number),
      0,
    ) >= occupancy(state, table)
  );
}
export function balanceSuggestions(
  state: LiveState,
): { from: number; to: number; userIds: string[] }[] {
  const tables = state.tables
    .filter((t) => t.open && t.dealerId)
    .sort((a, b) => occupancy(state, b.number) - occupancy(state, a.number));
  if (tables.length < 2) return [];
  const from = tables[0]!,
    to = tables[tables.length - 1]!;
  return occupancy(state, from.number) - occupancy(state, to.number) >= 2
    ? [
        {
          from: from.number,
          to: to.number,
          userIds: state.seats
            .filter((s) => s.state === "playing" && s.table === from.number)
            .map((s) => s.userId),
        },
      ]
    : [];
}

export function automaticPlaces(
  state: LiveState,
  paidPlaces: number,
): { userId: string; place: number }[] {
  const c = clockView(state);
  if (!c.complete && c.index + 1 <= state.config.registrationClosesLevel)
    return [];
  const eliminated = state.seats
    .filter((p) => p.state === "eliminated")
    .sort((a, b) =>
      (a.eliminatedAt ?? a.bustedAt ?? a.arrivedAt).localeCompare(
        b.eliminatedAt ?? b.bustedAt ?? b.arrivedAt,
      ),
    );
  const places = eliminated
    .map((p, index) => ({
      userId: p.userId,
      place: state.seats.length - index,
    }))
    .filter((p) => p.place <= paidPlaces);
  const remaining = state.seats.filter((p) => p.state !== "eliminated");
  if (remaining.length === 1)
    places.push({ userId: remaining[0]!.userId, place: 1 });
  return places;
}
