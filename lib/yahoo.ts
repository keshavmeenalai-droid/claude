import type { PricePoint } from "./types";

export interface ParsedChart {
  symbol: string;
  currency: string;
  closes: PricePoint[];
}

/** Exchange name (as written in the strategy) → Yahoo Finance symbol suffix. */
const EXCHANGE_SUFFIX: Array<[RegExp, string]> = [
  [/toronto|tsx/i, ".TO"],
  [/tokyo|tse/i, ".T"],
  [/stockholm/i, ".ST"],
  [/oslo/i, ".OL"],
  [/london|lse/i, ".L"],
  [/amsterdam/i, ".AS"],
  [/madrid/i, ".MC"],
  [/shanghai/i, ".SS"],
  [/shenzhen/i, ".SZ"],
  [/korea|kospi/i, ".KS"],
  [/hong kong|hkex/i, ".HK"],
  [/frankfurt|xetra/i, ".DE"],
  [/paris/i, ".PA"],
  [/swiss|six/i, ".SW"],
  [/milan/i, ".MI"],
  [/copenhagen/i, ".CO"],
  [/helsinki/i, ".HE"],
  [/australia|asx/i, ".AX"],
  [/national stock exchange|nse/i, ".NS"],
  [/bombay|bse/i, ".BO"],
];

export function yahooSymbolFor(ticker: string, exchange: string | null | undefined): string {
  const t = ticker.trim().toUpperCase();
  if (!exchange) return t;
  for (const [re, suffix] of EXCHANGE_SUFFIX) {
    if (re.test(exchange)) return t.endsWith(suffix) ? t : `${t}${suffix}`;
  }
  return t;
}

/**
 * Some exchanges quote in minor units (GBp = pence, ZAc = cents, ILA = agorot).
 * Returns the major currency and the factor to convert a minor-unit price into it.
 */
export function normalizeCurrency(currency: string | null | undefined): { ccy: string; factor: number } {
  const c = (currency ?? "USD").trim();
  if (c === "GBp" || c === "GBX") return { ccy: "GBP", factor: 0.01 };
  if (c === "ZAc" || c === "ZAC") return { ccy: "ZAR", factor: 0.01 };
  if (c === "ILA") return { ccy: "ILS", factor: 0.01 };
  return { ccy: c.toUpperCase(), factor: 1 };
}

/** Parse Yahoo's v8 chart response into ascending daily closes in major currency units. */
export function parseYahooChart(json: unknown): ParsedChart {
  const root = json as {
    chart?: {
      result?: Array<{
        meta?: { symbol?: string; currency?: string; regularMarketPrice?: number; regularMarketTime?: number; exchangeTimezoneName?: string; gmtoffset?: number };
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }> | null;
      error?: { description?: string } | null;
    };
  };
  const err = root?.chart?.error;
  if (err) throw new Error(err.description || "Yahoo returned an error");
  const r = root?.chart?.result?.[0];
  if (!r) throw new Error("No chart data returned");
  const { ccy, factor } = normalizeCurrency(r.meta?.currency);
  const ts = r.timestamp ?? [];
  const cl = r.indicators?.quote?.[0]?.close ?? [];
  const offset = r.meta?.gmtoffset ?? 0;
  const byDate = new Map<string, number>();
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i];
    if (c === null || c === undefined || !Number.isFinite(c) || c <= 0) continue;
    // Use the exchange's local date so a Tokyo close is not shifted to the previous day.
    const d = new Date((ts[i] + offset) * 1000).toISOString().slice(0, 10);
    byDate.set(d, c * factor);
  }
  const closes = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, c]) => ({ d, c: round(c, 6) }));
  if (closes.length === 0) throw new Error("No valid closes in chart data");
  return { symbol: r.meta?.symbol ?? "", currency: ccy, closes };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const HOSTS = process.env.MARKET_DATA_URL
  ? [process.env.MARKET_DATA_URL.replace(/\/$/, "")]
  : ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

export async function fetchChart(symbol: string, range = "2y"): Promise<ParsedChart> {
  let lastErr: unknown = null;
  for (const host of HOSTS) {
    const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false&events=div%2Csplit`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NorthgateAlertGuard/1.0)", Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${symbol}`);
        continue;
      }
      return parseYahooChart(await res.json());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Could not fetch ${symbol}`);
}

/** Yahoo FX symbol giving USD per one unit of `ccy`. */
export function fxSymbol(ccy: string): string | null {
  const c = ccy.toUpperCase();
  if (c === "USD") return null;
  return `${c}USD=X`;
}
