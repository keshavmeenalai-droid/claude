"use client";

import { useActionState, useState } from "react";
import { importWins, type ActionResult } from "@/app/actions";
import { SubmitButton } from "./forms";
import { Chip, Field, inputCls } from "./ui";

interface Plan {
  plan: Array<{ row: { symbol: string; name: string | null; quantity: number; avgCost: number | null; currency: string | null; line: number }; ticker: string | null; before: { shares: number; avg_cost: number | null; status: string } | null }>;
  skipped: Array<{ line: number; reason: string; text: string }>;
  missing: string[];
  columns: Record<string, string | null>;
}

export function WinsImport() {
  const [text, setText] = useState("");
  const [state, action] = useActionState<ActionResult | null, FormData>(importWins, null);
  const preview = state?.ok && state.data ? (state.data as Plan) : null;
  return (
    <form action={action} className="space-y-3">
      <Field label="Paste WInS Open Positions" hint="In WInS open Portfolio → Open Positions, select the table (or export it as CSV) and paste here. Bonds and cash lines are skipped automatically.">
        <textarea name="text" rows={8} value={text} onChange={(e) => setText(e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder={"Symbol\tDescription\tQuantity\tPrice Paid\tLast Price\nMU\tMicron Technology\t2\t885.10\t890.00"} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cash balance in WInS (USD, optional)">
          <input name="cash" type="number" step="any" min={0} className={inputCls} />
        </Field>
        <label className="mt-6 flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" name="zero_missing" className="h-4 w-4 accent-sky-500" />
          Close holdings that are not in the paste (sold in WInS)
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" name="mode" value="preview" className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10 hover:bg-white/10">Preview</button>
        {preview && <SubmitButton variant="success" name="mode" value="apply">Apply import</SubmitButton>}
      </div>
      {state && !state.data && <p className={`text-xs ${state.ok ? "text-emerald-300" : "text-rose-300"}`}>{state.message}</p>}
      {preview && (
        <div className="space-y-3 rounded-xl bg-ink-950/50 p-3 ring-1 ring-white/5">
          <p className="text-xs text-slate-400">
            Columns found: {Object.entries(preview.columns).filter(([, v]) => v).map(([k, v]) => `${k} = “${v}”`).join(" · ")}
          </p>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Symbol</th><th>Matches</th><th className="text-right">Qty</th><th className="text-right">Avg cost</th><th>Change</th></tr></thead>
              <tbody>
                {preview.plan.map((p) => (
                  <tr key={p.row.line}>
                    <td className="font-mono">{p.row.symbol}</td>
                    <td>{p.ticker ? <Chip tone="green">{p.ticker}</Chip> : <Chip tone="amber">new</Chip>}</td>
                    <td className="text-right font-mono">{p.row.quantity}</td>
                    <td className="text-right font-mono">{p.row.avgCost ?? "—"}</td>
                    <td className="text-xs text-slate-400">
                      {p.before ? `${p.before.status} ${p.before.shares} sh → held ${p.row.quantity} sh` : "will be created as a holding"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.skipped.length > 0 && <p className="text-xs text-slate-500">Skipped: {preview.skipped.map((s) => `line ${s.line} (${s.reason})`).join("; ")}</p>}
          {preview.missing.length > 0 && <p className="text-xs text-amber-300">Held here but not in the paste: {preview.missing.join(", ")}</p>}
        </div>
      )}
    </form>
  );
}
