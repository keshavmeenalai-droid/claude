"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Dark-mode categorical slots (validated reference palette), fixed order.
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const GOOD = "#199e70";
const BAD = "#e66767";
const GRID = "rgba(148,163,184,0.12)";
const AXIS = { fill: "#94a3b8", fontSize: 11 };

const tooltipStyle = {
  contentStyle: { background: "#0b1324", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, fontSize: 12, color: "#e2e8f0" },
  labelStyle: { color: "#94a3b8", marginBottom: 4 },
  itemStyle: { color: "#e2e8f0" },
};

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function GrowthChart({ data }: { data: Array<{ date: string; growth: number }> }) {
  if (data.length < 2) {
    return <div className="flex h-56 items-center justify-center text-sm text-slate-500">The value history fills in after a few daily checks.</div>;
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="g-growth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={usd0} domain={["auto", "auto"]} />
          <Tooltip {...tooltipStyle} formatter={(v) => [usd0(Number(v)), "Growth money"]} cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="growth" stroke={SERIES[0]} strokeWidth={2} fill="url(#g-growth)" activeDot={{ r: 4, strokeWidth: 2, stroke: "#0b1324" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AllocationDonut({ data }: { data: Array<{ name: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="#0b1324" strokeWidth={2} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.name} fill={SERIES[i % SERIES.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v, n) => [`${usd0(Number(v))} · ${total ? ((Number(v) / total) * 100).toFixed(1) : 0}%`, String(n)]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Growth</span>
          <span className="font-mono text-sm font-semibold text-slate-100">{usd0(total)}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
              {d.name}
            </span>
            <span className="font-mono text-slate-200">
              {usd0(d.value)} <span className="text-slate-500">{total ? ((d.value / total) * 100).toFixed(1) : "0.0"}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SectorBars({ data, limit, enforce }: { data: Array<{ sector: string; pct: number }>; limit: number; enforce: boolean }) {
  if (!data.length) return <div className="py-10 text-center text-sm text-slate-500">No stock positions yet.</div>;
  return (
    <div style={{ height: Math.max(140, data.length * 34 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} domain={[0, Math.max(limit + 10, ...data.map((d) => Math.ceil(d.pct / 10) * 10))]} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="sector" tick={{ ...AXIS, fill: "#cbd5e1" }} tickLine={false} axisLine={false} width={150} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,.04)" }} formatter={(v) => [`${Number(v).toFixed(1)}% of stock money`, "Share"]} />
          <ReferenceLine x={limit} stroke={BAD} strokeDasharray="4 4" label={{ value: `${limit}% limit`, fill: BAD, fontSize: 11, position: "top" }} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fill: "#cbd5e1", fontSize: 11, formatter: (v: unknown) => `${Number(v).toFixed(1)}%` }}>
            {data.map((d) => (
              <Cell key={d.sector} fill={enforce && d.pct > limit ? BAD : SERIES[0]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PnlBars({ data }: { data: Array<{ ticker: string; pnlPct: number; pnlUsd: number }> }) {
  if (!data.length) return <div className="py-10 text-center text-sm text-slate-500">No positions yet.</div>;
  return (
    <div style={{ height: Math.max(140, data.length * 28 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 4 }} barCategoryGap={5}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="ticker" tick={{ ...AXIS, fill: "#cbd5e1", fontFamily: "monospace" }} tickLine={false} axisLine={false} width={52} />
          <ReferenceLine x={0} stroke="#64748b" />
          <Tooltip
            {...tooltipStyle}
            cursor={{ fill: "rgba(255,255,255,.04)" }}
            formatter={(v, _n, item) => [`${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(2)}% (${usd0((item?.payload as { pnlUsd: number }).pnlUsd)})`, "Unrealised P&L"]}
          />
          <Bar dataKey="pnlPct" radius={4} isAnimationActive={false} label={{ position: "right", fill: "#cbd5e1", fontSize: 11, formatter: (v: unknown) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}%` }}>
            {data.map((d) => (
              <Cell key={d.ticker} fill={d.pnlPct >= 0 ? GOOD : BAD} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceChart({
  data,
  avgCost,
  stop,
  ccy,
  maDays,
}: {
  data: Array<{ d: string; c: number; ma: number | null }>;
  avgCost: number | null;
  stop: number | null;
  ccy: string;
  maDays: number;
}) {
  if (data.length < 2) return <div className="flex h-72 items-center justify-center text-sm text-slate-500">No price history yet: run the daily check.</div>;
  const values = data.flatMap((p) => [p.c, p.ma ?? p.c]).concat([avgCost ?? data[0].c, stop ?? data[0].c]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.06 || 1;
  const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: SERIES[0] }} />Close</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: SERIES[1] }} />{maDays}-day average</span>
        {avgCost !== null && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-slate-300" />Average cost</span>}
        {stop !== null && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: BAD }} />Stop</span>}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="d" tick={AXIS} tickLine={false} axisLine={false} minTickGap={48} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={60} domain={[lo - pad, hi + pad]} tickFormatter={fmt} />
            <Tooltip
              {...tooltipStyle}
              cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }}
              formatter={(v, n) => [`${ccy} ${Number(v).toFixed(2)}`, n === "c" ? "Close" : `${maDays}-day avg`]}
            />
            {avgCost !== null && <ReferenceLine y={avgCost} stroke="#cbd5e1" strokeDasharray="2 4" label={{ value: `cost ${fmt(avgCost)}`, fill: "#cbd5e1", fontSize: 11, position: "insideTopLeft" }} />}
            {stop !== null && <ReferenceLine y={stop} stroke={BAD} label={{ value: `stop ${fmt(stop)}`, fill: BAD, fontSize: 11, position: "insideBottomLeft" }} />}
            <Line type="monotone" dataKey="ma" stroke={SERIES[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="c" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#0b1324" }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <span className="text-xs text-slate-600">—</span>;
  const w = 88;
  const h = 26;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 2 - ((p - lo) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke={up ? GOOD : BAD} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
