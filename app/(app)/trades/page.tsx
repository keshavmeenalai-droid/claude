import Link from "next/link";
import { setCash } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DbMissing, SeedPrompt } from "@/components/setup";
import { TradeForm } from "@/components/trade-form";
import { Card, Chip, Field, inputCls, PageHeader } from "@/components/ui";
import { WinsImport } from "@/components/wins-import";
import { loadState } from "@/lib/data";
import { db, isDbConfigured, must } from "@/lib/db";
import { money, num, shortDate, tone, usd } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trades & WInS import" };

interface TradeRow {
  id: number;
  ticker: string;
  side: string;
  shares: number;
  price: number;
  ccy: string;
  fx_usd: number;
  commission_usd: number;
  realized_pnl_usd: number | null;
  traded_at: string;
  note: string | null;
  source: string;
  created_by: string | null;
}

export default async function TradesPage() {
  if (!isDbConfigured()) return <DbMissing />;
  const s = await loadState();
  if (!s.instruments.length) return <SeedPrompt />;
  const trades = must(await db().from("trades").select("*").order("traded_at", { ascending: false }).order("id", { ascending: false }).limit(300), "Load trades") as TradeRow[];
  const realized = trades.reduce((t, x) => t + (x.realized_pnl_usd === null ? 0 : Number(x.realized_pnl_usd)), 0);
  const commissions = trades.reduce((t, x) => t + Number(x.commission_usd), 0);
  const tickers = s.instruments.filter((i) => i.status !== "sold").map((i) => ({ ticker: i.ticker, ccy: i.ccy }));
  return (
    <>
      <PageHeader title="Trades & WInS import" subtitle="WInS has no public API, so positions come in two ways: record each fill here, or paste the WInS Open Positions table to sync everything at once. Prices are fetched automatically every day." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Sync from WInS" subtitle="Updates shares and average cost for every position in the paste">
          <WinsImport />
        </Card>
        <div className="space-y-6">
          <Card title="Record a fill" subtitle="Commission is $25 per trade; a stop order costs $25 only if it executes">
            <TradeForm tickers={tickers} today={s.today} />
          </Card>
          <Card title="Cash" subtitle="Updated automatically by recorded trades; correct it here to match WInS">
            <ActionForm action={setCash} className="flex flex-wrap items-end gap-3">
              <Field label="Cash (USD)">
                <input name="cash" type="number" step="any" min={0} defaultValue={s.cashUsd} className={inputCls} />
              </Field>
              <SubmitButton variant="ghost">Save cash</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>

      <Card className="mt-6" title={`Trade log (${trades.length})`} subtitle={`Realised P&L ${usd(realized, 2)} · commissions ${usd(commissions)}`}>
        {trades.length === 0 ? (
          <p className="text-sm text-slate-400">No trades recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ticker</th>
                  <th>Side</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Value (USD)</th>
                  <th className="text-right">Realised</th>
                  <th>Note</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td>{shortDate(t.traded_at)}</td>
                    <td><Link href={`/positions/${encodeURIComponent(t.ticker)}`} className="font-mono font-semibold hover:text-sky-300">{t.ticker}</Link></td>
                    <td><Chip tone={t.side === "BUY" ? "green" : "red"}>{t.side}</Chip></td>
                    <td className="text-right font-mono">{num(Number(t.shares))}</td>
                    <td className="text-right font-mono">{money(Number(t.price), t.ccy)}</td>
                    <td className="text-right font-mono">{usd(Number(t.shares) * Number(t.price) * Number(t.fx_usd))}</td>
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
    </>
  );
}
