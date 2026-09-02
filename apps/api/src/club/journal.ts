import type { JournalEntry } from "@poker/contracts";

/**
 * Turning the audit trail into something a person can read down.
 *
 * The audit table stores whatever each service thought was worth keeping, which
 * is the right trade for a forensic record and the wrong one for a screen. This
 * is the single place that knows how to say those payloads out loud, so adding
 * a staff action means adding one case here and nothing anywhere else.
 */

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
};

export type Described = { label: string; amountRub: number; playerId: string | null };

const KIND_TITLE: Record<string, string> = {
  entry: "Вход",
  rebuy: "Ребай",
  addon: "Адон",
  drink: "Напиток",
  other: "Прочее",
};

export function describe(row: AuditRow, achievementTitles: Map<string, string>): Described {
  const after = asRecord(row.after);
  const before = asRecord(row.before);
  const player = str(after, "userId") ?? str(before, "userId") ?? playerFromKey(row);

  switch (row.action) {
    case "payment.add": {
      const times = num(after, "multiplier") ?? 1;
      const what = str(after, "title") ?? KIND_TITLE[str(after, "kind") ?? ""] ?? "Оплата";
      return {
        label: `Оплата · ${what}${times > 1 ? ` ×${times}` : ""}`,
        amountRub: num(after, "amountRub") ?? 0,
        playerId: player,
      };
    }
    case "payment.void": {
      const what = str(before, "note") ?? KIND_TITLE[str(before, "kind") ?? ""] ?? "оплата";
      // Negative, so the column adds up to what the evening actually took.
      return {
        label: `Отмена оплаты · ${what}`,
        amountRub: -(num(before, "amountRub") ?? 0),
        playerId: player,
      };
    }
    case "prize.grant": {
      const count = num(after, "count") ?? 1;
      return {
        label: `Начислен приз · ${str(after, "title") ?? "приз"}${count > 1 ? ` (${count} шт)` : ""}`,
        amountRub: 0,
        playerId: player,
      };
    }
    case "prize.redeem":
      return {
        label: `Списан приз · ${str(after, "title") ?? "приз"}`,
        amountRub: 0,
        playerId: player,
      };
    case "prize.revoke":
      return {
        label: `Приз отменён · ${str(before, "title") ?? "приз"}`,
        amountRub: 0,
        playerId: player,
      };
    case "result.place": {
      const place = num(after, "place");
      return {
        label: place == null ? "Место снято" : `Занял ${place} место`,
        amountRub: 0,
        playerId: player,
      };
    }
    case "registration.create":
      return { label: "Записан на игру", amountRub: 0, playerId: player };
    case "registration.cancel":
      return { label: "Запись отменена", amountRub: 0, playerId: player };
    case "achievement.grant": {
      const code = str(after, "code");
      return {
        label: `Комбинация · ${(code && achievementTitles.get(code)) ?? code ?? "ачивка"}`,
        amountRub: 0,
        playerId: player,
      };
    }
    case "achievement.revoke": {
      const code = str(before, "code");
      return {
        label: `Комбинация снята · ${(code && achievementTitles.get(code)) ?? code ?? "ачивка"}`,
        amountRub: 0,
        playerId: player,
      };
    }
    case "tournament.finish": {
      const players = num(after, "players");
      return {
        label: `Вечер закрыт${players == null ? "" : ` · ${players} игроков`}`,
        amountRub: 0,
        playerId: null,
      };
    }
    case "tournament.reopen":
      return { label: "Вечер открыт заново", amountRub: 0, playerId: null };
    case "tournament.results.clear":
      return { label: "Результаты сброшены", amountRub: 0, playerId: null };
    case "tournament.create":
      return { label: "Турнир создан", amountRub: 0, playerId: null };
    case "tournament.update":
      return { label: `Турнир изменён${changedFields(before, after)}`, amountRub: 0, playerId: null };
    default:
      return { label: row.action, amountRub: 0, playerId: player };
  }
}

/** "· цена входа, стек" — enough to see what an edit touched without a diff view. */
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const changed = Object.keys(after).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  if (changed.length === 0 || changed.length > 4) return "";
  return ` · ${changed.join(", ")}`;
}

/** Registration rows key themselves as "tournamentId:userId". */
function playerFromKey(row: AuditRow): string | null {
  if (row.entity !== "Registration" || !row.entityId) return null;
  const [, userId] = row.entityId.split(":");
  return userId ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" ? value : null;
}

export function summariseStaff(entries: JournalEntry[]): {
  name: string;
  actions: number;
  amountRub: number;
}[] {
  const byName = new Map<string, { name: string; actions: number; amountRub: number }>();
  for (const entry of entries) {
    const name = entry.actor ?? "Система";
    const line = byName.get(name) ?? { name, actions: 0, amountRub: 0 };
    line.actions += 1;
    line.amountRub += entry.amountRub;
    byName.set(name, line);
  }
  return [...byName.values()].sort((a, b) => b.actions - a.actions);
}
