import type { SalesPeriod } from "@poker/contracts";
import { useState } from "react";
import { Card, EmptyState, ErrorState, Loading, Select, Tabs } from "../../components/ui";
import { formatNumber, formatRub, PAYMENT_KIND_LABELS } from "../../lib/format";
import { useSales, useSeasons } from "../../lib/queries";

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

  const lines = [...(report.data?.lines ?? [])].sort((a, b) =>
    sort === "count" ? b.count - a.count || b.amountRub - a.amountRub : b.amountRub - a.amountRub,
  );

  return (
    <div className="space-y-4">
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
              value={report.data.totalChips > 0 ? formatNumber(report.data.totalChips) : "—"}
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-3">
      <dt className="text-sm text-stone-400">{label}</dt>
      <dd className="nums mt-0.5 text-lg font-semibold text-gold-400">{value}</dd>
    </div>
  );
}
