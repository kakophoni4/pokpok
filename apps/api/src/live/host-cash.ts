import type { HostCashDay } from "@poker/contracts";

const offset = 4 * 60 * 60 * 1000; // Club day: Ulyanovsk, UTC+4.
export function clubDay(now = new Date()) {
  const date = new Date(now.getTime() + offset).toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00+04:00`);
  return { date, start, end: new Date(start.getTime() + 86400000) };
}

type Purchase = { kind: string; note: string | null; amountRub: number; deferred: boolean; method: string | null; prize: { id: string } | null };
type Receipt = { amountRub: number; method: string };
const titles: Record<string, string> = { entry: "Вход", rebuy: "Ребай", addon: "Аддон", drink: "Напитки", other: "Прочее" };

// Only issued, non-voided purchase rows enter here; pending orders are not sales.
export function cashDayReport(date: string, purchases: Purchase[], receipts: Receipt[]): HostCashDay {
  const result: HostCashDay = { date, cashRub: 0, terminalRub: 0, unspecifiedRub: 0, paidRub: 0, items: [] };
  const collect = (amount: number, method: string | null) => {
    if (method === "cash") result.cashRub += amount;
    else if (method === "terminal") result.terminalRub += amount;
    else result.unspecifiedRub += amount;
    result.paidRub += amount;
  };
  const items = new Map<string, HostCashDay["items"][number]>();
  for (const p of purchases) {
    if (!p.deferred && !p.prize) collect(p.amountRub, p.method);
    const title = p.note?.trim() || titles[p.kind] || p.kind;
    const key = JSON.stringify([p.kind, title]);
    const item = items.get(key) ?? { kind: p.kind, title, quantity: 0, prizeQuantity: 0, chargedRub: 0 };
    if (p.prize) item.prizeQuantity++;
    else { item.quantity++; item.chargedRub += p.amountRub; }
    items.set(key, item);
  }
  for (const r of receipts) collect(r.amountRub, r.method);
  result.items = [...items.values()].sort((a, b) => Object.keys(titles).indexOf(a.kind) - Object.keys(titles).indexOf(b.kind) || a.title.localeCompare(b.title, "ru"));
  return result;
}
