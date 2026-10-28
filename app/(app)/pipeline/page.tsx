import Link from "next/link";
import { addInstrument } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DbMissing, SeedPrompt } from "@/components/setup";
import { Card, Chip, Field, inputCls, LightPill, PageHeader, VerdictBadge } from "@/components/ui";
import { ctxOf, loadState } from "@/lib/data";
import { isDbConfigured } from "@/lib/db";
import { money, pct, shortDate, usd } from "@/lib/format";
import { evaluateCandidate } from "@/lib/rules";
import type { Instrument } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "New trades" };

export default async function PipelinePage() {
  if (!isDbConfigured()) return <DbMissing />;
  const s = await loadState();
  if (!s.instruments.length) return <SeedPrompt />;
  const ctx = ctxOf(s);
  const book = { held: s.instruments.filter((i) => i.status === "held"), pending: s.instruments.filter((i) => i.status === "pending"), quotes: s.quotes };
  const groups: Array<{ title: string; subtitle: string; items: Instrument[] }> = [
    { title: "Planned orders", subtitle: "From the 23 Oct order plan. Place only when the verdict is BUY on the day.", items: book.pending },
    { title: "Watchlist", subtitle: "Passed everything except the trend rule (E3) on 23 Oct. You get a NEW TRADE email when one turns BUY.", items: s.instruments.filter((i) => i.status === "watchlist") },
    { title: "Alternates", subtitle: "Use only if a pick fails its order-day check. Enter Q/V/M and expected return for a full check.", items: s.instruments.filter((i) => i.status === "alternate") },
  ];
  return (
    <>
      <PageHeader title="New trades" subtitle="Entry checker: E1 score · E2 price vs hurdle · E3 trend · E4 market light, plus limits, lockout and sizing (1.25% risk per stock).">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <LightPill light={s.market.light} />
          <span>Hurdle {s.market.hurdle.toFixed(2)}% · growth money {usd(s.growthUsd)}</span>
        </div>
      </PageHeader>
      <div className="space-y-6">
        {groups.map((g) => (
          <Card key={g.title} title={`${g.title} (${g.items.length})`} subtitle={g.subtitle}>
            {g.items.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing here.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Verdict</th>
                      <th>Checks</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">vs ref</th>
                      <th className="text-right">QVM</th>
                      <th className="text-right">Size today</th>
                      <th>Plan</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((i) => {
                      const q = s.quotes[i.yahoo_symbol];
                      const r = evaluateCandidate(i, q, ctx, book);
                      const shares = r.sizing ? (r.sizing.halfTranche ? Math.max(1, Math.round(r.sizing.shares / 2)) : r.sizing.shares) : null;
                      return (
                        <tr key={i.ticker}>
                          <td>
                            <Link href={`/positions/${encodeURIComponent(i.ticker)}`} className="group">
                              <div className="font-mono font-semibold text-slate-100 group-hover:text-sky-300">{i.ticker}</div>
                              <div className="max-w-[180px] truncate text-xs text-slate-500">{i.name} · {i.exchange ?? "—"}</div>
                            </Link>
                          </td>
                          <td>
                            <VerdictBadge verdict={r.verdict} />
                            <div className="mt-1 max-w-[240px] whitespace-normal text-[11px] text-slate-400">{r.reason}</div>
                          </td>
                          <td>
                            <div className="grid w-max grid-cols-2 gap-1">
                              {r.checks.filter((c) => ["E1", "E2", "E3", "E4"].includes(c.id) || !c.pass).map((c) => (
                                <span key={c.id} title={c.detail}>
                                  <Chip tone={c.pass ? "green" : "red"}>{c.pass ? "✓" : "✕"} {c.id}</Chip>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="text-right font-mono">{money(q?.price, i.ccy)}</td>
                          <td className="text-right font-mono">{r.sizing?.driftPct !== null && r.sizing ? <span className={r.sizing.recompute ? "text-amber-300" : ""}>{pct(r.sizing.driftPct)}</span> : "—"}</td>
                          <td className="text-right font-mono">{i.qvm ?? "—"}</td>
                          <td className="text-right font-mono">
                            {shares !== null ? `${shares} sh` : "—"}
                            {r.sizing && <div className="text-[11px] text-slate-500">stop {r.sizing.stopPct}%{r.sizing.halfTranche ? " · half" : ""}</div>}
                          </td>
                          <td className="max-w-[220px] whitespace-normal text-xs text-slate-400">
                            {i.status === "pending" ? `${i.target_shares ?? "—"} sh · ${shortDate(i.planned_date)} · ${i.order_type ?? ""} ${i.tranche ? `· ${i.tranche}` : ""}` : i.notes ?? ""}
                          </td>
                          <td>
                            <Link href={`/positions/${encodeURIComponent(i.ticker)}?side=BUY`} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10">
                              Record fill
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}

        <Card title="Add a stock to watch" subtitle="New idea from a re-score. The app looks up the Yahoo symbol from the exchange (e.g. Toronto → .TO).">
          <ActionForm action={addInstrument} resetOnSuccess className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Field label="Ticker"><input name="ticker" required className={inputCls} placeholder="GOOG" /></Field>
            <Field label="Name" className="col-span-2 md:col-span-2"><input name="name" className={inputCls} /></Field>
            <Field label="Exchange"><input name="exchange" className={inputCls} placeholder="Nasdaq / Toronto (TSX)" /></Field>
            <Field label="Currency"><input name="ccy" className={inputCls} defaultValue="USD" /></Field>
            <Field label="List">
              <select name="status" className={inputCls} defaultValue="watchlist">
                <option value="watchlist">Watchlist</option>
                <option value="pending">Planned order</option>
                <option value="alternate">Alternate</option>
              </select>
            </Field>
            <Field label="Sector"><input name="sector" className={inputCls} /></Field>
            <Field label="Industry"><input name="industry" className={inputCls} /></Field>
            <Field label="Theme"><input name="theme" className={inputCls} placeholder="AI (optional)" /></Field>
            <Field label="QVM"><input name="qvm" type="number" step="any" className={inputCls} /></Field>
            <Field label="Q / V / M">
              <div className="flex gap-1">
                <input name="q" type="number" step="any" className={inputCls} placeholder="Q" />
                <input name="v" type="number" step="any" className={inputCls} placeholder="V" />
                <input name="m" type="number" step="any" className={inputCls} placeholder="M" />
              </div>
            </Field>
            <Field label="Exp. return %"><input name="exp_return_pct" type="number" step="any" className={inputCls} /></Field>
            <Field label="Monthly SD"><input name="monthly_sd" type="number" step="any" className={inputCls} placeholder="0.12" /></Field>
            <Field label="Ref. price"><input name="ref_price" type="number" step="any" className={inputCls} /></Field>
            <Field label="Next results"><input name="next_earnings" type="date" className={inputCls} /></Field>
            <Field label="Yahoo symbol" hint="Leave blank to derive"><input name="yahoo_symbol" className={inputCls} /></Field>
            <Field label="Sell triggers (one per line)" className="col-span-2 md:col-span-3"><textarea name="thesis_breakers" rows={2} className={inputCls} /></Field>
            <Field label="Why it is in" className="col-span-2 md:col-span-3"><textarea name="why" rows={2} className={inputCls} /></Field>
            <div className="col-span-2 md:col-span-6"><SubmitButton>Add</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
