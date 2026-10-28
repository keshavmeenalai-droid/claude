import Link from "next/link";
import { Sparkline } from "@/components/charts";
import { DbMissing, SeedPrompt } from "@/components/setup";
import { Card, Chip, Empty, PageHeader, StopMeter } from "@/components/ui";
import { loadState } from "@/lib/data";
import { isDbConfigured } from "@/lib/db";
import { money, num, pct, tone, usd } from "@/lib/format";
import { positionRows } from "@/lib/view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Positions" };

export default async function PositionsPage() {
  if (!isDbConfigured()) return <DbMissing />;
  const s = await loadState();
  if (!s.instruments.length) return <SeedPrompt />;
  const rows = positionRows(s);
  const sold = s.instruments.filter((i) => i.status === "sold");
  return (
    <>
      <PageHeader title="Positions" subtitle="Everything currently held in WInS. Click a ticker for its chart, thesis card, stop and trade history." />
      <Card title={`${rows.length} holdings`} subtitle={`Total ${usd(s.stocksUsd + s.etfUsd)} · cash ${usd(s.cashUsd)}`}>
        {rows.length === 0 ? (
          <Empty title="No holdings yet">Record fills on the New trades page or import WInS Open Positions.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>60 days</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Avg cost</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Day</th>
                  <th className="text-right">Value (USD)</th>
                  <th className="text-right">P&L</th>
                  <th className="text-right">Weight</th>
                  <th className="text-right">Stop</th>
                  <th>To stop</th>
                  <th>QVM</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const i = r.inst;
                  const flags: Array<{ t: string; tone: "red" | "amber" | "sky" }> = [];
                  if (i.thesis_broken) flags.push({ t: "thesis break", tone: "red" });
                  if (i.kind === "stock" && !i.stop_price) flags.push({ t: "no stop placed", tone: "amber" });
                  if (r.aboveMa === false) flags.push({ t: "below avg", tone: "amber" });
                  if (r.weightPct !== null && r.weightPct > s.params.trimAbovePct) flags.push({ t: "trim (X6)", tone: "red" });
                  if (i.next_earnings && i.next_earnings >= s.today) flags.push({ t: `results ${i.next_earnings}`, tone: "sky" });
                  return (
                    <tr key={i.ticker}>
                      <td>
                        <Link href={`/positions/${encodeURIComponent(i.ticker)}`} className="group">
                          <div className="font-mono font-semibold text-slate-100 group-hover:text-sky-300">{i.ticker}</div>
                          <div className="max-w-[160px] truncate text-xs text-slate-500">{i.name}</div>
                        </Link>
                      </td>
                      <td><Sparkline points={r.spark} up={(r.spark.at(-1) ?? 0) >= (r.spark[0] ?? 0)} /></td>
                      <td className="text-right font-mono">{num(i.shares)}</td>
                      <td className="text-right font-mono">{money(i.avg_cost, i.ccy)}</td>
                      <td className="text-right font-mono">{money(r.price, i.ccy)}</td>
                      <td className={`text-right font-mono ${tone(r.quote?.day_change_pct)}`}>{pct(r.quote?.day_change_pct)}</td>
                      <td className="text-right font-mono">{usd(r.valueUsd)}</td>
                      <td className={`text-right font-mono ${tone(r.pnlUsd)}`}>
                        {usd(r.pnlUsd)} <span className="text-xs">({pct(r.pnlPct)})</span>
                      </td>
                      <td className="text-right font-mono">{pct(r.weightPct, 1, false)}</td>
                      <td className="text-right font-mono">{i.kind === "stock" ? money(r.stop, i.ccy) : "—"}</td>
                      <td>{i.kind === "stock" ? <StopMeter distancePct={r.stopDistPct} /> : <span className="text-xs text-slate-500">ETF</span>}</td>
                      <td className="font-mono">{i.qvm ?? "—"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {flags.map((f) => (
                            <Chip key={f.t} tone={f.tone}>{f.t}</Chip>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {sold.length > 0 && (
        <Card className="mt-6" title="Sold" subtitle="Re-buy only after the lockout and only if all entry rules pass">
          <div className="flex flex-wrap gap-2">
            {sold.map((i) => (
              <Link key={i.ticker} href={`/positions/${encodeURIComponent(i.ticker)}`}>
                <Chip>{i.ticker}{i.lockout_until && i.lockout_until > s.today ? ` · locked to ${i.lockout_until}` : ""}</Chip>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
