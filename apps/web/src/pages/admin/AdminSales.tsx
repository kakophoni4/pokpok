import type { SalesPeriod } from "@poker/contracts";
import { useMemo, useState } from "react";
import { Card, EmptyState, ErrorState, Loading, Select, Tabs } from "../../components/ui";
import { formatFullDate, formatNumber, formatRub, formatTime, PAYMENT_KIND_LABELS } from "../../lib/format";
import { useJournal, useSales, useSeasons, useTournaments } from "../../lib/queries";

const PERIODS: { value: SalesPeriod; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "season", label: "Сезон" },
  { value: "all", label: "Всё время" },
];

export function AdminSales() {
  const [period, setPeriod] = useState<SalesPeriod>("month");
  const [seasonId, setSeasonId] = useState("");
  const [sort, setSort] = useState<"amount" | "count">("amount");
  const seasons = useSeasons();
  const report = useSales(period, period === "season" ? seasonId || undefined : undefined);
  const tournaments = useTournaments("all");
  const evenings = useMemo(
    () =>
      [...(tournaments.data ?? [])]
        .filter((row) => row.status !== "draft" && row.status !== "cancelled")
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    [tournaments.data],
  );
  const [eveningId, setEveningId] = useState("");
  const activeEvening = eveningId || evenings[0]?.id || "";
  const journal = useJournal(activeEvening || undefined);

  const lines = [...(report.data?.lines ?? [])].sort((a, b) =>
    sort === "count" ? b.count - a.count || b.amountRub - a.amountRub : b.amountRub - a.amountRub,
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-stone-200">Касса</h2>
        <Tabs value={period} onChange={setPeriod} options={PERIODS} />

        {period === "season" && (
          <Select
            aria-label="Сезон"
            className="max-w-72"
            value={seasonId || seasons.data?.find((row) => row.isActive)?.id || seasons.data?.[0]?.id || ""}
            onChange={setSeasonId}
            options={(seasons.data ?? []).map((season) => ({
              value: season.id,
              label: `${season.title}${season.isActive ? " · сейчас" : ""}`,
            }))}
          />
        )}

        {report.isPending && <Loading label="Считаем кассу…" />}
        {report.isError && <ErrorState error={report.error} onRetry={() => void report.refetch()} />}

        {report.data && (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Выручка" value={formatRub(report.data.totalRub)} />
              <Stat label="Оплат" value={formatNumber(report.data.paymentCount)} />
              <Stat label="Вечеров" value={formatNumber(report.data.tournamentCount)} />
              <Stat
                label="Фишек выдано"
                value={report.data.totalChips > 0 ? formatNumber(report.data.totalChips) : "-"}
              />
            </dl>

            {report.data.seasonTitle && period === "season" && (
              <p className="text-sm text-stone-400">{report.data.seasonTitle}</p>
            )}

            {lines.length === 0 ? (
              <EmptyState title="Покупок за этот период нет" />
            ) : (
              <Card className="overflow-hidden p-0">
                <div className="flex justify-end gap-2 border-b border-gold-500/20 px-3 py-2">
                  <button
                    type="button"
                    className={sort === "amount" ? "text-sm text-gold-400" : "text-sm text-stone-400"}
                    onClick={() => setSort("amount")}
                  >
                    по сумме
                  </button>
                  <button
                    type="button"
                    className={sort === "count" ? "text-sm text-gold-400" : "text-sm text-stone-400"}
                    onClick={() => setSort("count")}
                  >
                    по числу
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_4rem_5.5rem] gap-2 border-b border-gold-500/20 px-3 py-3 text-sm text-stone-300 sm:grid-cols-[1fr_5rem_4rem_5.5rem]">
                  <span>Позиция</span>
                  <span className="hidden sm:block">Тип</span>
                  <span className="text-right">Раз</span>
                  <span className="text-right">Сумма</span>
                </div>
                <ul className="divide-y divide-felt-800">
                  {lines.map((line) => (
                    <li
                      key={`${line.kind}:${line.title}`}
                      className="grid grid-cols-[1fr_4rem_5.5rem] items-center gap-2 px-3 py-3 sm:grid-cols-[1fr_5rem_4rem_5.5rem]"
                    >
                      <span className="min-w-0 truncate">{line.title}</span>
                      <span className="hidden text-sm text-stone-400 sm:block">
                        {PAYMENT_KIND_LABELS[line.kind] ?? line.kind}
                      </span>
                      <span className="nums text-right text-stone-300">{line.count}</span>
                      <span className="nums text-right font-medium text-gold-400">
                        {formatRub(line.amountRub)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-stone-200">Журнал вечера</h2>
        <p className="text-sm text-stone-400">
          Кто что вписал, кто отменил, кому начислили приз — по одному вечеру.
        </p>

        {evenings.length === 0 ? (
          <EmptyState title="Вечеров пока нет" />
        ) : (
          <Select
            aria-label="Вечер"
            className="max-w-full"
            value={activeEvening}
            onChange={setEveningId}
            options={evenings.map((row) => ({
              value: row.id,
              label: `${row.title} · ${formatFullDate(row.startsAt)}`,
            }))}
          />
        )}

        {journal.isPending && activeEvening && <Loading label="Собираем журнал…" />}
        {journal.isError && <ErrorState error={journal.error} onRetry={() => void journal.refetch()} />}

        {journal.data && (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Касса вечера" value={formatRub(journal.data.totalRub)} />
              <Stat label="Действий" value={formatNumber(journal.data.entries.length)} />
              <Stat label="За кассой" value={formatNumber(journal.data.staff.length)} />
            </dl>

            {journal.data.staff.length > 0 && (
              <Card className="overflow-hidden p-0">
                <ul className="divide-y divide-felt-800">
                  {journal.data.staff.map((row) => (
                    <li key={row.name} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="min-w-0 truncate">{row.name}</span>
                      <span className="shrink-0 text-sm text-stone-400">
                        {row.actions} · {formatRub(row.amountRub)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {journal.data.entries.length === 0 ? (
              <EmptyState title="За этот вечер ещё ничего не записывали" />
            ) : (
              <Card className="overflow-hidden p-0">
                <ul className="divide-y divide-felt-800">
                  {journal.data.entries.map((entry) => (
                    <li key={entry.id} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm text-stone-200">{entry.label}</p>
                        <p className="nums shrink-0 text-sm text-gold-400">
                          {entry.amountRub === 0 ? "" : signedRub(entry.amountRub)}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {formatTime(entry.at)}
                        {entry.actor ? ` · ${entry.actor}` : ""}
                        {entry.player ? ` · ${entry.player}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function signedRub(value: number): string {
  return `${value < 0 ? "−" : ""}${formatRub(Math.abs(value))}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-3">
      <dt className="text-sm text-stone-400">{label}</dt>
      <dd className="nums mt-0.5 text-lg font-semibold text-gold-400">{value}</dd>
    </div>
  );
}
