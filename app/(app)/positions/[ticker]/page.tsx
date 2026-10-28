import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteInstrument, updateInstrument } from "@/app/actions";
import { PriceChart } from "@/components/charts";
import { ActionForm, SubmitButton } from "@/components/forms";
import { TradeForm } from "@/components/trade-form";
import { DbMissing } from "@/components/setup";
import { Card, Chip, Field, inputCls, PageHeader, SeverityBadge, Stat, VerdictBadge } from "@/components/ui";
import { ctxOf, loadState } from "@/lib/data";
import { db, isDbConfigured, must } from "@/lib/db";
import { dateTime, money, num, pct, shortDate, tone, usd } from "@/lib/format";
import { movingAverage } from "@/lib/indicators";
import { evaluateCandidate, fxRate, stopPriceOf } from "@/lib/rules";
import type { AlertRow, Verdict } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  return { title: decodeURIComponent((await params).ticker) };
}

export default async function PositionPage({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<{ side?: string }> }) {
  if (!isDbConfigured()) return <DbMissing />;
  const ticker = decodeURIComponent((await params).ticker).toUpperCase();
  const { side } = await searchParams;
  const s = await loadState();
  const inst = s.instruments.find((i) => i.ticker === ticker);
  if (!inst) notFound();
  const [tradesRes, alertsRes] = await Promise.all([
    db().from("trades").select("*").eq("ticker", ticker).order("traded_at", { ascending: false }).limit(50),
    db().from("alerts").select("*").eq("ticker", ticker).order("created_at", { ascending: false }).limit(30),
  ]);
  const trades = must(tradesRes, "Load trades") as Array<{ id: number; side: string; shares: number; price: number; ccy: string; traded_at: string; commission_usd: number; realized_pnl_usd: number | null; note: string | null; created_by: string | null }>;
  const alerts = must(alertsRes, "Load alerts") as AlertRow[];

  const q = s.quotes[inst.yahoo_symbol];
  const closes = q?.closes ?? [];
  const chart = closes.slice(-260).map((p, i, arr) => {
    const idx = closes.length - arr.length + i;
    const ma = movingAverage(closes, s.params.maDays, idx);
    return { d: p.d, c: p.c, ma: ma === null ? null : Math.round(ma * 100) / 100 };
  });
  const held = inst.status === "held" && inst.shares > 0;
  const stop = inst.kind === "stock" && held ? stopPriceOf(inst) : null;
  const r = fxRate(s.fx, inst.ccy);
  const valueUsd = held && q && r !== null ? inst.shares * q.price * r : null;
  const pnlPct = held && q && inst.avg_cost ? (q.price / inst.avg_cost - 1) * 100 : null;
  const book = { held: s.instruments.filter((i) => i.status === "held"), pending: s.instruments.filter((i) => i.status === "pending"), quotes: s.quotes };
  const entry = !held && inst.status !== "sold" ? evaluateCandidate(inst, q, ctxOf(s), book) : null;
  const tickers = s.instruments.filter((i) => i.status !== "sold" || i.ticker === ticker).map((i) => ({ ticker: i.ticker, ccy: i.ccy }));

  return (
    <>
      <PageHeader
        title={`${inst.ticker} · ${inst.name ?? ""}`}
        subtitle={[inst.exchange, inst.sector, inst.industry, inst.theme ? `theme ${inst.theme}` : null, `Yahoo ${inst.yahoo_symbol}`].filter(Boolean).join(" · ")}
      >
        <div className="flex items-center gap-2">
          <Chip tone={held ? "green" : inst.status === "sold" ? "red" : "amber"}>{inst.status}</Chip>
          {entry && <VerdictBadge verdict={entry.verdict as Verdict} />}
        </div>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Price" value={money(q?.price, inst.ccy)} sub={<span className={tone(q?.day_change_pct)}>{pct(q?.day_change_pct)} today · {shortDate(q?.last_date)}</span>} />
        <Stat label={`${s.params.maDays}-day avg`} value={money(q?.ma200, inst.ccy)} sub={q?.ma200 ? (q.price > q.ma200 ? "Price above: trend OK" : "Price below: trend warning") : "—"} tone={q?.ma200 ? (q.price > q.ma200 ? "text-emerald-300" : "text-amber-300") : undefined} />
        <Stat label="Position" value={held ? `${num(inst.shares)} sh` : "—"} sub={held ? `${usd(valueUsd)} · avg ${money(inst.avg_cost, inst.ccy)}` : `Target ${inst.target_shares ?? "—"} sh`} />
        <Stat label="P&L" value={pct(pnlPct)} tone={tone(pnlPct)} sub={held && valueUsd !== null && inst.avg_cost && r ? usd(valueUsd - inst.avg_cost * inst.shares * r) : "—"} />
        <Stat label="Stop" value={money(stop, inst.ccy)} sub={stop && q ? `${pct((q.price / stop - 1) * 100, 1, false)} above · ${inst.stop_price ? "placed in WInS" : "not placed yet"}` : `${inst.stop_pct}% below cost`} tone={stop && q && q.price <= stop * 1.05 ? "text-amber-300" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Price, trend and stop" subtitle={`Last ${chart.length} trading days · 12-1 momentum ${pct(q?.mom12_1)} · 52-week ${money(q?.low_52w, inst.ccy)} – ${money(q?.high_52w, inst.ccy)}`}>
          <PriceChart data={chart} avgCost={held ? inst.avg_cost : null} stop={stop} ccy={inst.ccy} maDays={s.params.maDays} />
        </Card>

        <Card title="Thesis card" subtitle={inst.why ?? undefined}>
          <div className="mb-4 grid grid-cols-4 gap-2 text-center">
            {[
              ["QVM", inst.qvm],
              ["Q", inst.q],
              ["V", inst.v],
              ["M", inst.m],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-white/5 py-2">
                <div className="text-[10px] uppercase text-slate-400">{k}</div>
                <div className="font-mono text-lg text-slate-100">{v ?? "—"}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">Expected return {pct(inst.exp_return_pct, 1, false)} vs hurdle {s.market.hurdle.toFixed(2)}% · monthly SD {inst.monthly_sd ?? "—"}</p>
          <p className="mt-1 text-xs text-slate-400">Next results: {inst.next_earnings ? `${shortDate(inst.next_earnings)}${inst.earnings_note ? ` (${inst.earnings_note})` : ""}` : inst.earnings_note ?? "—"}</p>
          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Sell if (X1)</h3>
          <ul className="space-y-1.5 text-sm text-slate-200">
            {inst.thesis_breakers.length ? inst.thesis_breakers.map((b) => <li key={b} className="flex gap-2"><span className="text-rose-400">✕</span>{b}</li>) : <li className="text-slate-500">No sell triggers written yet.</li>}
          </ul>
          <ActionForm action={updateInstrument} className="mt-4 rounded-xl bg-rose-500/5 p-3 ring-1 ring-rose-500/20" confirmText={inst.thesis_broken ? undefined : "Mark a sell trigger as fired? This raises an EXIT alert (X1: sell all within 5 trading days) for the whole team."}>
            <input type="hidden" name="ticker" value={inst.ticker} />
            <input type="hidden" name="thesis_flag" value="1" />
            {inst.thesis_broken ? (
              <>
                <p className="mb-2 text-sm text-rose-200">Sell trigger fired: {inst.thesis_note ?? "—"}</p>
                <input type="hidden" name="thesis_note" value="" />
                <SubmitButton variant="ghost">Clear thesis break</SubmitButton>
              </>
            ) : (
              <>
                <input type="hidden" name="thesis_broken" value="on" />
                <Field label="A sell trigger fired? Say which">
                  <input name="thesis_note" required className={inputCls} placeholder="e.g. Q3 revenue fell for the 2nd quarter" />
                </Field>
                <SubmitButton variant="danger" className="mt-2">Mark thesis break (X1)</SubmitButton>
              </>
            )}
          </ActionForm>
        </Card>

        {entry && (
          <Card className="xl:col-span-3" title="Entry check (E1–E4)" subtitle={entry.reason}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {entry.checks.map((c) => (
                <div key={c.id} className={`rounded-lg p-3 text-xs ring-1 ${c.pass ? "bg-emerald-500/5 ring-emerald-500/20" : "bg-rose-500/5 ring-rose-500/20"}`}>
                  <div className={`font-bold ${c.pass ? "text-emerald-300" : "text-rose-300"}`}>{c.pass ? "✓" : "✕"} {c.id}</div>
                  <div className="mt-1 text-slate-300">{c.detail}</div>
                </div>
              ))}
            </div>
            {entry.sizing && (
              <p className="mt-4 text-sm text-slate-300">
                Size today: <b className="font-mono text-white">{entry.sizing.halfTranche ? Math.max(1, Math.round(entry.sizing.shares / 2)) : entry.sizing.shares} shares</b>
                {entry.sizing.halfTranche ? " (first half: results within 5 trading days)" : ""} · position {usd(entry.sizing.positionUsd)} · stop {entry.sizing.stopPct}% (≈ {money(entry.sizing.stopPriceLocal, inst.ccy)})
                {entry.sizing.driftPct !== null ? ` · price ${pct(entry.sizing.driftPct)} vs reference` : ""}
              </p>
            )}
          </Card>
        )}

        <Card className="xl:col-span-2" title="Record a trade" subtitle="Updates shares, average cost and cash. Commission is $25 per trade in WInS.">
          <TradeForm tickers={tickers} defaultTicker={inst.ticker} defaultSide={side === "SELL" ? "SELL" : "BUY"} defaultShares={held ? null : inst.target_shares} today={s.today} />
        </Card>

        <Card title="Edit details" subtitle="Stop price as placed in WInS, scores after a re-score, symbol fixes">
          <ActionForm action={updateInstrument} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="ticker" value={inst.ticker} />
            <Field label={`Stop price placed (${inst.ccy})`} className="col-span-2" hint={inst.avg_cost ? `Rule: ${money(inst.avg_cost * (1 - inst.stop_pct / 100), inst.ccy)} = avg cost × ${(1 - inst.stop_pct / 100).toFixed(2)}` : undefined}>
              <input name="stop_price" type="number" step="any" min={0} defaultValue={inst.stop_price ?? ""} className={inputCls} />
            </Field>
            <Field label="Stop %"><input name="stop_pct" type="number" step="any" defaultValue={inst.stop_pct} className={inputCls} /></Field>
            <Field label="Yahoo symbol"><input name="yahoo_symbol" defaultValue={inst.yahoo_symbol} className={inputCls} /></Field>
            <Field label="QVM"><input name="qvm" type="number" step="any" defaultValue={inst.qvm ?? ""} className={inputCls} /></Field>
            <Field label="Expected return %"><input name="exp_return_pct" type="number" step="any" defaultValue={inst.exp_return_pct ?? ""} className={inputCls} /></Field>
            <Field label="Q"><input name="q" type="number" step="any" defaultValue={inst.q ?? ""} className={inputCls} /></Field>
            <Field label="V"><input name="v" type="number" step="any" defaultValue={inst.v ?? ""} className={inputCls} /></Field>
            <Field label="M"><input name="m" type="number" step="any" defaultValue={inst.m ?? ""} className={inputCls} /></Field>
            <Field label="Monthly SD"><input name="monthly_sd" type="number" step="any" defaultValue={inst.monthly_sd ?? ""} className={inputCls} /></Field>
            <Field label="Next results"><input name="next_earnings" type="date" defaultValue={inst.next_earnings ?? ""} className={inputCls} /></Field>
            <Field label="Results note"><input name="earnings_note" defaultValue={inst.earnings_note ?? ""} className={inputCls} /></Field>
            <Field label="Status">
              <select name="status" defaultValue={inst.status} className={inputCls}>
                {["held", "pending", "watchlist", "alternate", "sold"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Target shares"><input name="target_shares" type="number" step="1" defaultValue={inst.target_shares ?? ""} className={inputCls} /></Field>
            <Field label="Sell triggers (one per line)" className="col-span-2">
              <textarea name="thesis_breakers" rows={3} defaultValue={inst.thesis_breakers.join("\n")} className={inputCls} />
            </Field>
            <Field label="Notes" className="col-span-2"><textarea name="notes" rows={2} defaultValue={inst.notes ?? ""} className={inputCls} /></Field>
            <div className="col-span-2"><SubmitButton>Save</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card className="xl:col-span-2" title="Trade history">
          {trades.length === 0 ? (
            <p className="text-sm text-slate-400">No trades recorded here yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Side</th><th className="text-right">Shares</th><th className="text-right">Price</th><th className="text-right">Realised</th><th>Note</th><th>By</th></tr></thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.id}>
                      <td>{shortDate(t.traded_at)}</td>
                      <td><Chip tone={t.side === "BUY" ? "green" : "red"}>{t.side}</Chip></td>
                      <td className="text-right font-mono">{num(Number(t.shares))}</td>
                      <td className="text-right font-mono">{money(Number(t.price), t.ccy)}</td>
                      <td className={`text-right font-mono ${tone(t.realized_pnl_usd === null ? null : Number(t.realized_pnl_usd))}`}>{t.realized_pnl_usd === null ? "—" : usd(Number(t.realized_pnl_usd), 2)}</td>
                      <td className="max-w-xs truncate text-xs text-slate-400">{t.note}</td>
                      <td className="text-xs text-slate-500">{t.created_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Alert history">
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-400">No alerts for {inst.ticker}.</p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a) => (
                <li key={a.id} className={a.status === "resolved" ? "opacity-50" : ""}>
                  <div className="flex items-center gap-2"><SeverityBadge severity={a.severity} /><span className="text-[11px] text-slate-500">{dateTime(a.created_at, s.teamTz)} · {a.status}</span></div>
                  <p className="mt-1 text-sm text-slate-200">{a.title}</p>
                </li>
              ))}
            </ul>
          )}
          {!held && (
            <ActionForm action={deleteInstrument} className="mt-6 border-t border-white/5 pt-4" confirmText={`Remove ${inst.ticker} from AlertGuard?`}>
              <input type="hidden" name="ticker" value={inst.ticker} />
              <SubmitButton variant="danger">Remove {inst.ticker}</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
      <p className="mt-6 text-sm"><Link href="/positions" className="text-sky-300 hover:underline">← All positions</Link></p>
    </>
  );
}
