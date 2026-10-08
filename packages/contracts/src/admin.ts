import type { HostCashDay } from "./live.js";
export type ClubOverview = {
  at: string;
  defaultCreditLimitRub: number;
  cash: HostCashDay;
  players: number;
  staff: number;
  debtRub: number;
  debtors: { userId: string; name: string; debtRub: number; limitRub: number; individual: boolean }[];
  events: { id: string; title: string; startsAt: string; status: string; registered: number; inPlay: number; tables: number; paused: boolean; configured: boolean; pending: number }[];
  requests: { id: string; tournamentId: string; player: string; title: string; quantity: number; amountRub: number; table: number | null }[];
};
