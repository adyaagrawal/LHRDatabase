"use client";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekPoint } from "@/lib/dashboard";
import { money, moneyShort } from "@/lib/format";

export function CumulativeChart({ data, budget }: { data: WeekPoint[]; budget: number | null }) {
  if (data.length === 0)
    return <p className="py-10 text-center text-sm text-muted">The season hasn't started yet.</p>;
  return (
    <div className="h-72 w-full" role="img" aria-label="Cumulative committed spend by week with a 7-week projection">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#EEEAE3" vertical={false} />
          <XAxis
            dataKey="week"
            tickFormatter={(w: number) => `W${w}`}
            tick={{ fontSize: 12, fill: "#5C5A55" }}
            axisLine={{ stroke: "#DEDAD2" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => moneyShort(v)}
            tick={{ fontSize: 12, fill: "#5C5A55" }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            formatter={(v, name) => [money(Number(v)), String(name)]}
            labelFormatter={(w: number) => {
              const p = data.find((d) => d.week === w);
              return `Week ${w}${p ? ` (through ${p.date})` : ""}`;
            }}
            contentStyle={{ borderRadius: 6, borderColor: "#DEDAD2", fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          {budget ? (
            <ReferenceLine
              y={budget}
              stroke="#5C5A55"
              strokeDasharray="4 4"
              label={{ value: `Budget ${moneyShort(budget)}`, fill: "#5C5A55", fontSize: 12, position: "insideTopRight" }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="actual"
            name="Committed"
            stroke="#BF5700"
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="projection"
            name="Projection (last 3 weeks)"
            stroke="#BF5700"
            strokeWidth={2}
            strokeDasharray="6 5"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
