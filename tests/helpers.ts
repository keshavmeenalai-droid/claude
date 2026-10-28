import { computeIndicators } from "@/lib/indicators";
import { DEFAULT_PARAMS, DEFAULT_THRESHOLDS } from "@/lib/params";
import type { Ctx } from "@/lib/rules";
import type { Instrument, MarketState, PricePoint, Quote } from "@/lib/types";

/** Weekday closes ending on `end`, produced by `f(i)` where i = 0 is the oldest. */
export function series(end: string, count: number, f: (i: number) => number): PricePoint[] {
  const dates: string[] = [];
  const d = new Date(`${end}T00:00:00Z`);
  while (dates.length < count) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  dates.reverse();
  return dates.map((date, i) => ({ d: date, c: f(i) }));
}

export function quoteFrom(symbol: string, closes: PricePoint[], currency = "USD"): Quote {
  const ind = computeIndicators(closes, 200)!;
  return { symbol, ...ind, currency, closes, error: null };
}

export function inst(over: Partial<Instrument> = {}): Instrument {
  return {
    ticker: "TEST",
    yahoo_symbol: "TEST",
    name: "Test Co",
    exchange: "Nasdaq",
    country: "US",
    ccy: "USD",
    sector: "Information Technology",
    industry: "Software",
    theme: null,
    kind: "stock",
    status: "held",
    shares: 10,
    avg_cost: 100,
    stop_pct: 25,
    stop_price: 75,
    target_shares: 10,
    ref_price: 100,
    tranche: null,
    planned_date: null,
    order_type: null,
    qvm: 70,
    q: 70,
    v: 70,
    m: 70,
    exp_return_pct: 12,
    monthly_sd: 0.08,
    next_earnings: null,
    earnings_note: null,
    thesis_breakers: ["revenue falls"],
    why: null,
    thesis_broken: false,
    thesis_note: null,
    lockout_until: null,
    opened_at: "2025-01-01",
    last_verdict: null,
    notes: null,
    ...over,
  };
}

export function market(over: Partial<MarketState> = {}): MarketState {
  return { light: "GREEN", spy_price: 760, spy_ma: 726, treasury_yield: 5.13, hurdle: 8.63, phase: 1, as_of: "2026-10-23", reason: "", ...over };
}

export function ctx(over: Partial<Ctx> = {}): Ctx {
  return {
    params: DEFAULT_PARAMS,
    thresholds: DEFAULT_THRESHOLDS,
    market: market(),
    growthUsd: 52255,
    fx: { USD: 1, CAD: 0.71415, NOK: 0.10715 },
    today: "2026-10-23",
    ...over,
  };
}

/** A quote with explicit fields (no history needed). */
export function flatQuote(over: Partial<Quote> = {}): Quote {
  return {
    symbol: "TEST",
    price: 100,
    prev_close: 100,
    day_change_pct: 0,
    ma200: 90,
    ret_52w: 20,
    ret_30d: 2,
    mom12_1: 17.6,
    high_52w: 120,
    low_52w: 80,
    currency: "USD",
    last_date: "2026-10-23",
    month_end: null,
    prev_month_end: null,
    closes: [],
    error: null,
    ...over,
  };
}
