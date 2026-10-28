import { fxRate, stopPriceOf } from "./rules";
import type { AppState } from "./data";
import type { Instrument, Quote } from "./types";

export interface PositionRow {
  inst: Instrument;
  quote: Quote | undefined;
  price: number | null;
  valueUsd: number | null;
  costUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  weightPct: number | null;
  stop: number | null;
  stopDistPct: number | null;
  aboveMa: boolean | null;
  spark: number[];
}

export function positionRows(s: AppState): PositionRow[] {
  return s.instruments
    .filter((i) => i.status === "held" && i.shares > 0)
    .map((inst) => {
      const quote = s.quotes[inst.yahoo_symbol];
      const r = fxRate(s.fx, inst.ccy);
      const price = quote?.price ?? null;
      const valueUsd = price !== null && r !== null ? price * inst.shares * r : null;
      const costUsd = inst.avg_cost !== null && r !== null ? inst.avg_cost * inst.shares * r : null;
      const pnlUsd = valueUsd !== null && costUsd !== null ? valueUsd - costUsd : null;
      const stop = inst.kind === "stock" ? stopPriceOf(inst) : null;
      return {
        inst,
        quote,
        price,
        valueUsd,
        costUsd,
        pnlUsd,
        pnlPct: price !== null && inst.avg_cost ? (price / inst.avg_cost - 1) * 100 : null,
        weightPct: valueUsd !== null && s.growthUsd > 0 ? (valueUsd / s.growthUsd) * 100 : null,
        stop,
        stopDistPct: stop !== null && price !== null ? (price / stop - 1) * 100 : null,
        aboveMa: quote?.ma200 != null && price !== null ? price > quote.ma200 : null,
        spark: (quote?.closes ?? []).slice(-60).map((p) => p.c),
      };
    })
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}

export function sectorShares(rows: PositionRow[]): Array<{ sector: string; pct: number }> {
  const stocks = rows.filter((r) => r.inst.kind === "stock" && r.valueUsd !== null);
  const total = stocks.reduce((s, r) => s + (r.valueUsd as number), 0);
  if (!total) return [];
  const by = new Map<string, number>();
  for (const r of stocks) by.set(r.inst.sector ?? "Unclassified", (by.get(r.inst.sector ?? "Unclassified") ?? 0) + (r.valueUsd as number));
  return [...by.entries()].map(([sector, v]) => ({ sector, pct: Math.round((v / total) * 1000) / 10 })).sort((a, b) => b.pct - a.pct);
}
