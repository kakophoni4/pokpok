import { z } from "zod";

export const BlindLevel = z
  .object({
    title: z.string().trim().min(1).max(80),
    seconds: z.number().int().min(60).max(14400),
    small: z.number().int().nonnegative(),
    big: z.number().int().nonnegative(),
    ante: z.number().int().nonnegative().optional(),
    break: z.boolean().default(false),
  })
  .transform((level) => ({ ...level, ante: level.break ? 0 : level.big }));
export type BlindLevel = z.infer<typeof BlindLevel>;
export const LiveConfig = z.object({
  maxTables: z.number().int().min(1).max(30),
  seatsPerTable: z.number().int().min(2).max(10),
  registrationClosesLevel: z.number().int().min(1).max(100),
  rebuyClosesLevel: z.number().int().min(1).max(100),
  addonLevel: z.number().int().min(1).max(100),
  levels: z.array(BlindLevel).min(1).max(100),
  bountyMode: z.enum(["none", "rating", "lottery"]),
  bountyPoints: z.number().int().min(0).max(100000),
});
export type LiveConfig = z.infer<typeof LiveConfig>;
export type LiveSeat = {
  userId: string;
  table: number | null;
  seat: number | null;
  lastTable?: number;
  state: "playing" | "busted" | "eliminated";
  stack: number;
  measuredAt: string;
  arrivedAt: string;
  eliminatedAt?: string;
  bustedAt?: string;
  wantsMove: boolean;
};
export type LiveTable = {
  number: number;
  dealerId: string | null;
  open: boolean;
  breakRequested: boolean;
  balanceDeferredUntil?: string;
};
export type LiveOrder = {
  id: string;
  userId: string;
  menuItemId: string;
  title: string;
  priceRub: number;
  quantity: number;
  state: "pending" | "fulfilled" | "cancelled";
  createdAt: string;
  actorId?: string;
  paymentIds?: string[];
};
export type BountyRecord = {
  id: string;
  userId: string;
  victimId: string;
  actorId: string;
  mode: "rating" | "lottery";
  points: number;
  createdAt: string;
  voided: boolean;
  award?: {
    title: string;
    points: number;
    menuItemId?: string;
    quantity: number;
    actorId: string;
    prizeIds: string[];
    at: string;
  };
};
export type LiveAlert = {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  acknowledgedBy: string | null;
  kind?: "bust" | "purchase";
  table?: number | null;
  seat?: number | null;
};
export type LiveState = {
  config: LiveConfig;
  tables: LiveTable[];
  seats: LiveSeat[];
  orders: LiveOrder[];
  bounties: BountyRecord[];
  alerts: LiveAlert[];
  clock: { running: boolean; elapsedSeconds: number; startedAt: string | null };
  deferredBalanceChecks?: boolean;
};
export type ClockView = {
  index: number;
  remaining: number;
  level: BlindLevel;
  next: BlindLevel | null;
  elapsed: number;
  complete: boolean;
};
export type AccountView = {
  userId: string;
  debtRub: number;
  creditRub: number;
  accounts: {
    tournamentId: string;
    title: string;
    chargedRub: number;
    paidRub: number;
    dueRub: number;
    purchases: {
      id: string;
      title: string;
      amountRub: number;
      deferred: boolean;
      voided: boolean;
      createdAt: string;
    }[];
    receipts: {
      id: string;
      amountRub: number;
      method: string;
      actor: string;
      createdAt: string;
      voided: boolean;
    }[];
  }[];
};
export type LiveView = {
  id: string;
  title: string;
  status: string;
  paidPlaces?: number;
  handOfDay?: string | null;
  serverTime: string;
  state: LiveState | null;
  clock: ClockView | null;
  players: { id: string; name: string; place?: number | null }[];
  balances: { userId: string; dueRub: number }[];
  displayToken?: string;
  displayCode?: string | null;
  leaderboard: { name: string; points: number }[];
};

export const LiveAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("openTable"),
    table: z.number().int().positive(),
    open: z.boolean(),
  }),
  z.object({ type: z.literal("configure"), config: LiveConfig }),
  z.object({
    type: z.literal("table"),
    table: z.number().int().positive(),
    dealerId: z.string().min(1),
    open: z.boolean(),
  }),
  z.object({
    type: z.literal("clock"),
    command: z.enum([
      "start",
      "pause",
      "reset",
      "next",
      "previous",
      "skipBreak",
    ]),
  }),
  z.object({
    type: z.literal("editLevel"),
    index: z.number().int().min(0),
    level: BlindLevel,
  }),
  z.object({ type: z.literal("arrive"), userId: z.string().min(1) }),
  z.object({
    type: z.literal("bust"),
    userId: z.string().min(1),
    final: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("correctPlace"),
    userId: z.string().min(1),
    place: z.number().int().positive().nullable(),
    expected: z.number().int().positive().nullable(),
    swapUserId: z.string().optional(),
    confirm: z.literal(true),
  }),
  z.object({
    type: z.literal("restore"),
    userId: z.string().min(1),
    stack: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("stack"),
    userId: z.string().min(1),
    stack: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("wantMove"),
    userId: z.string().min(1),
    wanted: z.boolean(),
  }),
  z.object({
    type: z.literal("rebox"),
    userId: z.string().min(1),
    seat: z.number().int().min(1).max(10),
    expectedSeat: z.number().int().min(1).max(10),
    expectedOccupant: z.string().nullable(),
  }),
  z.object({
    type: z.literal("move"),
    userId: z.string().min(1),
    targetTable: z.number().int().positive(),
    swapUserId: z.string().optional(),
  }),
  z.object({
    type: z.literal("breakRequest"),
    table: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("breakApprove"),
    table: z.number().int().positive(),
    confirm: z.literal(true),
  }),
  z.object({ type: z.literal("ack"), alertId: z.string().min(1) }),
  z.object({
    type: z.literal("deferBalance"),
    table: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("bounty"),
    userId: z.string().min(1),
    victimId: z.string().min(1),
  }),
  z.object({
    type: z.literal("lottery"),
    bountyId: z.string().min(1),
    title: z.string().trim().min(1).max(100),
    points: z.number().int().min(0).max(100000),
    menuItemId: z.string().optional(),
    quantity: z.number().int().min(1).max(20),
  }),
  z.object({ type: z.literal("voidBounty"), bountyId: z.string().min(1) }),
  z.object({ type: z.literal("cancelLottery"), bountyId: z.string().min(1) }),
]);
export type LiveAction = z.infer<typeof LiveAction>;
export const PlaceOrderInput = z.object({
  tournamentId: z.string().min(1),
  userId: z.string().optional(),
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(3),
  requestId: z.string().uuid(),
});
export type PlaceOrderInput = z.infer<typeof PlaceOrderInput>;
export const ReceiptInput = z.object({
  tournamentId: z.string().min(1),
  userId: z.string().min(1),
  amountRub: z.number().int().positive().max(1000000),
  method: z.enum(["cash", "terminal"]),
  requestId: z.string().uuid(),
});
export type ReceiptInput = z.infer<typeof ReceiptInput>;

export const DEFAULT_LIVE_CONFIG: LiveConfig = {
  maxTables: 3,
  seatsPerTable: 9,
  registrationClosesLevel: 6,
  rebuyClosesLevel: 6,
  addonLevel: 7,
  bountyMode: "none",
  bountyPoints: 300,
  levels: [
    100, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000, 4000, 6000,
  ].map((small, i) => ({
    title: `Уровень ${i + 1}`,
    seconds: 1200,
    small,
    big: small * 2,
    ante: small * 2,
    break: false,
  })),
};
