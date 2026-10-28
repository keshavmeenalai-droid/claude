import Link from "next/link";
import { Activity, AlertTriangle, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { AllocationDonut, GrowthChart, PnlBars, SectorBars } from "@/components/charts";
import { DbMissing, SeedPrompt } from "@/components/setup";
import { Card, Chip, LightPill, PageHeader, SeverityBadge, Stat, StopMeter } from "@/components/ui";
import { loadState } from "@/lib/data";
import { db, isDbConfigured, must } from "@/lib/db";
import { dateTime, money, pct, shortDate, tone, usd } from "@/lib/format";
import type { AlertRow } from "@/lib/types";
import { positionRows, sectorShares } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  if (!isDbConfigured()) return <DbMissing />;
  const [s, alertsRes, histRes, tasksRes] = await Promise.all([
    loadState(),
    db().from("alerts").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(50),
    db().from("portfolio_history").select("date, growth_usd").order("date").limit(400),
    db().from("tasks").select("id, due_date, status").neq("status", "done"),
  ]);
  if (!s.instruments.length) {
    return (
      <>
        <PageHeader title="Welcome to Northgate AlertGuard" subtitle="Tracks the QVM Compass trades, checks prices every day and emails the team when to re-check or exit." />
        <SeedPrompt />
      </>
    );
  }
  const alerts = must(alertsRes, "Load alerts") as AlertRow[];
  const order = { EXIT: 0, RECHECK: 1, NEW_TRADE: 2, INFO: 3 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  const history = (must(histRes, "Load history") as Array<{ date: string; growth_usd: number }>).map((h) => ({ date: shortDate(h.date), growth: Number(h.growth_usd) }));
  const tasks = must(tasksRes, "Load tasks") as Array<{ due_date: string | null }>;
  const overdue = tasks.filter((t) => t.due_date && t.due_date < s.today).length;

  const rows = positionRows(s);
  const pending = s.instruments.filter((i) => i.status === "pending");
  const buys = s.instruments.filter((i) => (i.status === "pending" || i.status === "watchlist") && i.last_verdict === "BUY");
  const reserve = 245000;
  const pnlCostBase = rows.reduce((t, r) => t + (r.costUsd ?? 0), 0);
  const counts = { EXIT: 0, RECHECK: 0, NEW_TRADE: 0, INFO: 0 };
  for (const a of alerts) counts[a.severity]++;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Prices as of ${shortDate(s.market.as_of)} · growth money is what the QVM rules size from (INDY + stocks + cash).`} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Growth money" value={usd(s.growthUsd)} sub={`Stocks ${usd(s.stocksUsd)} · INDY ${usd(s.etfUsd)} · cash ${usd(s.cashUsd)}`} icon={<Wallet className="h-4 w-4" />} />
        <Stat
          label="Unrealised P&L"
          value={usd(s.unrealizedUsd)}
          tone={tone(s.unrealizedUsd)}
          sub={pnlCostBase ? pct((s.unrealizedUsd / pnlCostBase) * 100, 2) + " on cost" : "—"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <Stat
          label="Market light"
          value={<LightPill light={s.market.light} />}
          sub={`SPY ${money(s.market.spy_price, "USD")} vs avg ${money(s.market.spy_ma, "USD")} · Phase ${s.market.phase}`}
          icon={<Activity className="h-4 w-4" />}
        />
        <Stat label="Hurdle" value={`${s.market.hurdle.toFixed(2)}%`} sub={`10y Treasury ${s.market.treasury_yield.toFixed(2)}% + ${s.params.premiumPts} pts`} icon={<Landmark className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Action board"
          subtitle="Open alerts from the daily check, most urgent first"
          action={
            <div className="flex flex-wrap gap-2">
              {counts.EXIT > 0 && <Chip tone="red">{counts.EXIT} exit</Chip>}
              {counts.RECHECK > 0 && <Chip tone="amber">{counts.RECHECK} re-check</Chip>}
              {counts.NEW_TRADE > 0 && <Chip tone="green">{counts.NEW_TRADE} new trade</Chip>}
              {counts.INFO > 0 && <Chip tone="sky">{counts.INFO} info</Chip>}
            </div>
          }
        >
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-500/5 p-4 text-sm text-emerald-200 ring-1 ring-emerald-500/20">
              <PiggyBank className="h-5 w-5" /> Nothing needs attention. Every holding is inside its rules.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {alerts.slice(0, 8).map((a) => (
                <li key={a.id} className="flex gap-3 py-3">
                  <div className="pt-0.5">
                    <SeverityBadge severity={a.severity} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{a.message}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[11px] text-slate-500">{dateTime(a.created_at, s.teamTz)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/alerts" className="text-sky-300 hover:underline">All alerts →</Link>
            {buys.length > 0 && <Link href="/pipeline" className="text-emerald-300 hover:underline">{buys.length} buy signal(s) →</Link>}
            {overdue > 0 && (
              <Link href="/team" className="flex items-center gap-1 text-rose-300 hover:underline">
                <AlertTriangle className="h-3.5 w-3.5" /> {overdue} overdue task(s)
              </Link>
            )}
          </div>
        </Card>

        <Card title="Growth money split" subtitle="Plan after all orders: INDY 32% · stocks 64% · cash 4%">
          <AllocationDonut
            data={[
              { name: "Stocks", value: Math.round(s.stocksUsd) },
              { name: "INDY (India 50)", value: Math.round(s.etfUsd) },
              { name: "Cash", value: Math.round(s.cashUsd) },
            ]}
          />
          <p className="mt-4 border-t border-white/5 pt-3 text-xs text-slate-400">
            Operating reserve (Treasury ladder, held to maturity): ≈ {usd(reserve)} · not part of the stock engine.
          </p>
        </Card>

        <Card className="xl:col-span-2" title="Growth money over time" subtitle="Saved by every daily check">
          <GrowthChart data={history} />
        </Card>

        <Card title="Order plan" subtitle={`${pending.length} planned order(s) not yet filled`}>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-400">All planned orders are filled.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {pending.slice(0, 8).map((p) => (
                <li key={p.ticker} className="flex items-center justify-between gap-2">
                  <Link href={`/positions/${encodeURIComponent(p.ticker)}`} className="font-mono text-slate-100 hover:text-sky-300">{p.ticker}</Link>
                  <span className="truncate text-xs text-slate-400">{p.target_shares} sh · {shortDate(p.planned_date)}</span>
                  {p.last_verdict && <Chip tone={p.last_verdict === "BUY" ? "green" : p.last_verdict === "REJECT" ? "red" : "amber"}>{p.last_verdict}</Chip>}
                </li>
              ))}
            </ul>
          )}
          <Link href="/pipeline" className="mt-4 inline-block text-sm text-sky-300 hover:underline">Entry checks →</Link>
        </Card>

        <Card className="xl:col-span-2" title="Positions" subtitle="Distance to stop: amber within 5% (re-check), red at or below the stop (exit)">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Day</th>
                  <th className="text-right">P&L</th>
                  <th className="text-right">Weight</th>
                  <th>To stop</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.inst.ticker}>
                    <td>
                      <Link href={`/positions/${encodeURIComponent(r.inst.ticker)}`} className="font-mono font-semibold text-slate-100 hover:text-sky-300">{r.inst.ticker}</Link>
                    </td>
                    <td className="text-right font-mono">{money(r.price, r.inst.ccy)}</td>
                    <td className={`text-right font-mono ${tone(r.quote?.day_change_pct)}`}>{pct(r.quote?.day_change_pct)}</td>
                    <td className={`text-right font-mono ${tone(r.pnlPct)}`}>{pct(r.pnlPct)}</td>
                    <td className="text-right font-mono">{pct(r.weightPct, 1, false)}</td>
                    <td>{r.inst.kind === "stock" ? <StopMeter distancePct={r.stopDistPct} /> : <span className="text-xs text-slate-500">ETF</span>}</td>
                    <td>{r.aboveMa === null ? <span className="text-xs text-slate-500">—</span> : r.aboveMa ? <Chip tone="green">above avg</Chip> : <Chip tone="amber">below avg</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Unrealised P&L by position">
          <PnlBars data={rows.filter((r) => r.pnlPct !== null).map((r) => ({ ticker: r.inst.ticker, pnlPct: Math.round((r.pnlPct as number) * 100) / 100, pnlUsd: r.pnlUsd ?? 0 }))} />
        </Card>

        <Card className="xl:col-span-3" title="Sector exposure" subtitle={`Share of stock money at market · limit ${s.params.sectorMaxPct}% per sector, ${s.params.maxPerIndustry} per industry, ${s.params.maxPerTheme} per theme${rows.filter((r) => r.inst.kind === "stock").length < 5 ? " · limit applies once 5+ stocks are held" : ""}`}>
          <SectorBars data={sectorShares(rows)} limit={s.params.sectorMaxPct} enforce={rows.filter((r) => r.inst.kind === "stock").length >= 5} />
        </Card>
      </div>
    </>
  );
}
