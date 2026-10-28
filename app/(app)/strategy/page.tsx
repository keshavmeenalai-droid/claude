import { changeParam, saveThresholds } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DbMissing, SeedPrompt } from "@/components/setup";
import { Card, Field, inputCls, LightPill, PageHeader } from "@/components/ui";
import { loadState } from "@/lib/data";
import { db, isDbConfigured, must } from "@/lib/db";
import { dateTime, money, shortDate } from "@/lib/format";
import { PARAM_META } from "@/lib/params";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strategy" };

const EXIT_RULES = [
  ["X1", "Thesis break", "A sell trigger for that stock happens", "Sell all within 5 trading days", "Team marks it on the position page → EXIT alert"],
  ["X2", "Score decay", "QVM below the sell score at the quarterly re-score", "Sell all", "Automatic once the new QVM is entered"],
  ["X3", "Valuation", "Expected return below Treasury + 1 pt / below Treasury", "Sell half / sell all", "Automatic, daily 10-year yield"],
  ["X4", "Hard stop", "Price at or below the stop (25% / 30% below cost)", "Sells automatically in WInS", "Daily; re-check alert within 5% of the stop"],
  ["X5", "Trend break", "Month-end close below the average AND 12-1 momentum negative", "Sell half; next month-end sell the rest", "Automatic at each month-end"],
  ["X6", "Too big", "Position above 8% of growth money", "Trim to 6%", "Automatic, daily"],
  ["X7", "Better idea", "New stock passes entry and scores 15+ above the weakest holding", "Swap (max 2 a quarter)", "NEW TRADE alert"],
  ["X8", "Laura's timeline", "Glide-path date or Phase-2 RED", "Trim lowest QVM; move to SGOV", "INFO alert 14 days ahead; RED in Phase 2 = EXIT"],
];

export default async function StrategyPage() {
  if (!isDbConfigured()) return <DbMissing />;
  const s = await loadState();
  if (!s.instruments.length) return <SeedPrompt />;
  const changes = must(await db().from("strategy_changes").select("*").order("changed_at", { ascending: false }).limit(50), "Load change log") as Array<{ id: number; changed_at: string; param: string; old_value: string; new_value: string; reason: string; approved_by: string }>;
  const reserve = (s.settings.reserve as { holdings?: Array<Record<string, unknown>> } | undefined)?.holdings ?? [];

  return (
    <>
      <PageHeader title="Strategy" subtitle="QVM Compass rules as the daily check applies them. Parameters change only inside their allowed range, with a reason and an approver (the January review rule). Never to rescue a position." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Market light (S&P 500 via SPY)" subtitle={s.market.reason}>
          <div className="flex items-center gap-4">
            <LightPill light={s.market.light} />
            <div className="text-sm text-slate-300">
              SPY {money(s.market.spy_price, "USD")} · {s.params.maDays}-day avg {money(s.market.spy_ma, "USD")}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Phase</dt><dd className="text-slate-100">{s.market.phase} {s.market.phase === 1 ? "(to Dec 2030)" : "(2031–2032)"}</dd></div>
            <div><dt className="text-xs text-slate-400">10-year Treasury</dt><dd className="text-slate-100">{s.market.treasury_yield.toFixed(2)}%</dd></div>
            <div><dt className="text-xs text-slate-400">Hurdle (E2)</dt><dd className="text-slate-100">{s.market.hurdle.toFixed(2)}%</dd></div>
            <div><dt className="text-xs text-slate-400">As of</dt><dd className="text-slate-100">{shortDate(s.market.as_of)}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-slate-400">GREEN: normal buying · YELLOW: half size (Phase 2: no new buys) · RED (month-end below): no new buys (Phase 2: cut stocks 50% into SGOV).</p>
        </Card>

        <Card className="xl:col-span-2" title="Exit rules (any one triggers a sale)" subtitle="Not reasons to sell: a bad day or week, a scary headline that is not a sell trigger, other teams' picks, “feels expensive” when X3 has not fired.">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Rule</th><th>Trigger</th><th>Action</th><th>How AlertGuard checks it</th></tr></thead>
              <tbody>
                {EXIT_RULES.map(([id, name, trigger, action, how]) => (
                  <tr key={id}>
                    <td className="font-mono font-semibold text-slate-100">{id} <span className="font-sans font-normal text-slate-400">{name}</span></td>
                    <td className="whitespace-normal text-xs text-slate-300">{trigger}</td>
                    <td className="whitespace-normal text-xs text-slate-300">{action}</td>
                    <td className="whitespace-normal text-xs text-sky-200">{how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-2" title="Parameters" subtitle="Current values with the allowed range from the strategy reference (section 6)">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>ID</th><th>Parameter</th><th className="text-right">Value</th><th>Allowed</th></tr></thead>
              <tbody>
                {PARAM_META.map((m) => (
                  <tr key={m.key}>
                    <td className="font-mono text-slate-400">{m.id}</td>
                    <td>{m.label}</td>
                    <td className="text-right font-mono text-slate-100">{String(s.params[m.key])}{m.unit === "%" ? "%" : m.unit ? ` ${m.unit}` : ""}</td>
                    <td className="text-xs text-slate-400">{m.min}–{m.max}</td>
                  </tr>
                ))}
                <tr><td className="font-mono text-slate-400">P11</td><td>Volatile if monthly SD above</td><td className="text-right font-mono">{s.params.volatileSd}</td><td className="text-xs text-slate-400">fixed</td></tr>
                <tr><td className="font-mono text-slate-400">P17</td><td>Phase 2 start</td><td className="text-right font-mono">{s.params.phase2Start}</td><td className="text-xs text-slate-400">fixed</td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Change a parameter" subtitle="Two-person rule: one writes, another approves">
          <ActionForm action={changeParam} resetOnSuccess className="space-y-3">
            <Field label="Parameter">
              <select name="key" className={inputCls}>
                {PARAM_META.map((m) => <option key={m.key} value={m.key}>{m.id} · {m.label} (now {String(s.params[m.key])})</option>)}
              </select>
            </Field>
            <Field label="New value"><input name="value" type="number" step="any" required className={inputCls} /></Field>
            <Field label="Reason"><textarea name="reason" rows={2} required className={inputCls} /></Field>
            <Field label="Approved by"><input name="approved_by" required className={inputCls} /></Field>
            <SubmitButton>Save change</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Alert thresholds" subtitle="Team settings for the dip and re-check emails (not strategy rules)">
          <ActionForm action={saveThresholds} className="grid grid-cols-2 gap-3">
            <Field label="Daily dip (%)" hint="Re-check email when a holding falls this much in a day"><input name="dailyDipPct" type="number" step="any" defaultValue={s.thresholds.dailyDipPct} className={inputCls} /></Field>
            <Field label="Below cost (%)" hint="Re-check when this far below average cost"><input name="drawdownPct" type="number" step="any" defaultValue={s.thresholds.drawdownPct} className={inputCls} /></Field>
            <Field label="Near stop (%)" hint="Review calendar: within 5% of the stop"><input name="stopWarnPct" type="number" step="any" defaultValue={s.thresholds.stopWarnPct} className={inputCls} /></Field>
            <Field label="S&P 500 dip (%)" hint="Info email when SPY falls this much"><input name="indexDipPct" type="number" step="any" defaultValue={s.thresholds.indexDipPct} className={inputCls} /></Field>
            <div className="col-span-2"><SubmitButton variant="ghost">Save thresholds</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card className="xl:col-span-2" title="Operating reserve: Treasury ladder" subtitle="Held to maturity for the ten $50,000 payments, 2033–2042. Never sold to buy stocks; WInS price moves here are paper only. Confirm units in WInS Open Positions.">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Bond</th><th className="text-right">Units</th><th className="text-right">YTM</th><th>Pays for</th><th>Plan</th></tr></thead>
              <tbody>
                {reserve.map((b) => (
                  <tr key={String(b.bond)}>
                    <td>{String(b.bond)}</td>
                    <td className="text-right font-mono">{String(b.units)}</td>
                    <td className="text-right font-mono">{b.ytm_pct !== undefined ? `${b.ytm_pct}%` : "—"}</td>
                    <td className="text-xs text-slate-300">{String(b.pays_for ?? "")}</td>
                    <td className="text-xs text-slate-300">{String(b.plan ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-3" title="Change log">
          {changes.length === 0 ? (
            <p className="text-sm text-slate-400">No parameter changes since the strategy was loaded. (P10 risk 1% → 1.25% and P14 10 → 15 stocks were changed on 23 Oct 2026 in the strategy file.)</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>When</th><th>Parameter</th><th>Old → new</th><th>Reason</th><th>Approved by</th></tr></thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id}>
                      <td>{dateTime(c.changed_at, s.teamTz)}</td>
                      <td>{c.param}</td>
                      <td className="font-mono">{c.old_value} → {c.new_value}</td>
                      <td className="whitespace-normal text-xs text-slate-300">{c.reason}</td>
                      <td>{c.approved_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
