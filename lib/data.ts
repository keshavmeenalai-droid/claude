import "server-only";
import { db, must } from "./db";
import { mergeParams, mergeThresholds } from "./params";
import { marketLight, positionValueUsd, type Ctx } from "./rules";
import { todayIn } from "./tasks";
import type { AlertThresholds, Instrument, MarketState, Quote, StrategyParams } from "./types";

export const TREASURY_SYMBOL = "^TNX";
export const INDEX_SYMBOL = "SPY";
export const MARKET_TZ = "America/New_York";

export const DEFAULT_FX: Record<string, number> = { CAD: 0.71415, SEK: 0.10061, NOK: 0.10715, JPY: 0.0063743 };

export interface AppState {
  params: StrategyParams;
  thresholds: AlertThresholds;
  settings: Record<string, unknown>;
  instruments: Instrument[];
  quotes: Record<string, Quote>;
  fx: Record<string, number>;
  cashUsd: number;
  growthUsd: number;
  stocksUsd: number;
  etfUsd: number;
  unrealizedUsd: number;
  market: MarketState;
  today: string;
  teamTz: string;
}

export async function loadSettings(): Promise<Record<string, unknown>> {
  const rows = must(await db().from("settings").select("key, value"), "Load settings") as Array<{ key: string; value: unknown }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  must(await db().from("settings").upsert({ key, value, updated_at: new Date().toISOString() }), `Save setting ${key}`);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Postgres numeric columns arrive as strings or numbers; normalise them. */
export function normInstrument(r: Record<string, unknown>): Instrument {
  return {
    ...(r as unknown as Instrument),
    shares: num(r.shares) ?? 0,
    avg_cost: num(r.avg_cost),
    stop_pct: num(r.stop_pct) ?? 25,
    stop_price: num(r.stop_price),
    target_shares: num(r.target_shares),
    ref_price: num(r.ref_price),
    qvm: num(r.qvm),
    q: num(r.q),
    v: num(r.v),
    m: num(r.m),
    exp_return_pct: num(r.exp_return_pct),
    monthly_sd: num(r.monthly_sd),
    thesis_breakers: Array.isArray(r.thesis_breakers) ? (r.thesis_breakers as string[]) : [],
  };
}

export function normQuote(r: Record<string, unknown>): Quote {
  return {
    ...(r as unknown as Quote),
    price: num(r.price) ?? 0,
    prev_close: num(r.prev_close),
    day_change_pct: num(r.day_change_pct),
    ma200: num(r.ma200),
    ret_52w: num(r.ret_52w),
    ret_30d: num(r.ret_30d),
    mom12_1: num(r.mom12_1),
    high_52w: num(r.high_52w),
    low_52w: num(r.low_52w),
    closes: Array.isArray(r.closes) ? (r.closes as Quote["closes"]) : [],
  };
}

export function treasuryFrom(quote: Quote | undefined, fallback: number): number {
  if (!quote || !(quote.price > 0)) return fallback;
  // ^TNX is quoted in percent (e.g. 4.25). Older feeds quoted ×10.
  const y = quote.price > 20 ? quote.price / 10 : quote.price;
  return Math.round(y * 100) / 100;
}

export async function loadState(): Promise<AppState> {
  const [settings, instRes, quoteRes] = await Promise.all([
    loadSettings(),
    db().from("instruments").select("*").order("ticker"),
    db().from("quotes").select("*"),
  ]);
  const instruments = (must(instRes, "Load instruments") as Record<string, unknown>[]).map(normInstrument);
  const quoteRows = (must(quoteRes, "Load quotes") as Record<string, unknown>[]).map(normQuote);
  const quotes: Record<string, Quote> = Object.fromEntries(quoteRows.map((q) => [q.symbol, q]));
  return buildState(settings, instruments, quotes);
}

export function buildState(settings: Record<string, unknown>, instruments: Instrument[], quotes: Record<string, Quote>, now = new Date()): AppState {
  const params = mergeParams(settings.params);
  const thresholds = mergeThresholds(settings.thresholds);
  const storedFx = (settings.fx_reference as Record<string, number> | undefined) ?? DEFAULT_FX;
  const fx: Record<string, number> = { USD: 1, ...storedFx };
  for (const q of Object.values(quotes)) {
    const m = q.symbol.match(/^([A-Z]{3})USD=X$/);
    if (m && q.price > 0) fx[m[1]] = q.price;
  }
  const cashUsd = num(settings.cash_usd) ?? 0;
  let stocksUsd = 0;
  let etfUsd = 0;
  let unrealizedUsd = 0;
  for (const i of instruments) {
    if (i.status !== "held" || !i.shares) continue;
    const q = quotes[i.yahoo_symbol];
    const r = fx[i.ccy.toUpperCase()];
    const px = q?.price ?? i.avg_cost ?? 0;
    const v = r ? i.shares * px * r : 0;
    if (i.kind === "etf") etfUsd += v;
    else stocksUsd += v;
    if (i.avg_cost && r) unrealizedUsd += (px - i.avg_cost) * i.shares * r;
  }
  const today = todayIn(MARKET_TZ, now);
  const marketSetting = (settings.market as { treasury_yield?: number } | undefined) ?? {};
  const treasury = treasuryFrom(quotes[TREASURY_SYMBOL], marketSetting.treasury_yield ?? 5.13);
  const market = marketLight(quotes[INDEX_SYMBOL], params, treasury, today);
  const teamTz = typeof settings.team_timezone === "string" ? settings.team_timezone : "Asia/Kolkata";
  return {
    params,
    thresholds,
    settings,
    instruments,
    quotes,
    fx,
    cashUsd,
    growthUsd: stocksUsd + etfUsd + cashUsd,
    stocksUsd,
    etfUsd,
    unrealizedUsd,
    market,
    today,
    teamTz,
  };
}

export function ctxOf(s: AppState): Ctx {
  return { params: s.params, thresholds: s.thresholds, market: s.market, growthUsd: s.growthUsd, fx: s.fx, today: s.today };
}

export { positionValueUsd };
