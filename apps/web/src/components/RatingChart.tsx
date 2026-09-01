import type { PlayerStats } from "@poker/contracts";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDayMonth } from "../lib/format";

/** Cumulative rating over the season — the one chart players actually look at. */
export function RatingChart({ progression }: { progression: PlayerStats["progression"] }) {
  if (progression.length < 2) return null;

  const data = progression.map((point) => ({
    date: formatDayMonth(point.date),
    points: point.points,
  }));

  return (
    <div className="card p-3">
      <p className="mb-2 px-1 text-sm text-stone-400">Динамика рейтинга</p>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4a94e" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#d4a94e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fill: "#8a8a80", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: "#8a8a80", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "#101a17",
              border: "1px solid #1e3229",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: "#8a8a80" }}
            formatter={(value) => [`${String(value)} очков`, ""]}
          />
          <Area
            type="monotone"
            dataKey="points"
            stroke="#d4a94e"
            strokeWidth={2}
            fill="url(#ratingFill)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
