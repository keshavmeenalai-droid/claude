import { yahooSymbolFor } from "./yahoo";
import type { Instrument } from "./types";

/* Shape of config/qvm_strategy.json (only the parts the app reads). */
interface CfgStock {
  ticker: string;
  name: string;
  exchange: string;
  country: string;
  ccy: string;
  sector: string;
  industry: string;
  theme: string | null;
  qvm: number;
  q: number;
  v: number;
  m: number;
  exp_return_pct: number;
  monthly_sd: number;
  stop_pct: number;
  target_shares: number;
  ref_price: number;
  next_earnings: string;
  thesis_breakers: string[];
  why: string;
}
interface CfgOrder {
  date: string;
  ticker: string;
  shares: number;
  type: string;
  tranche: string;
  condition?: string;
}
export interface StrategyConfig {
  stocks: CfgStock[];
  pending_orders: CfgOrder[];
  positions: Array<{ ticker: string; shares?: number | string; avg_cost_usd?: number }>;
  alternates: Array<{ sector: string; ticker: string; name: string; exchange: string; qvm: number; note?: string }>;
  watchlist_fails_E3_only: Array<{ ticker: string; name: string; qvm: number }>;
  etfs: Array<{ ticker: string; name: string; status: string; units?: string | number; price?: number }>;
  cash_plan_usd: { after_MU: number };
  live_inputs: { us_10y_treasury_yield_pct: { value: number } };
  bonds: { holdings: Array<Record<string, unknown>> };
  account: { buckets: { growth_bucket: { value_usd_at_sizing: number } } };
}

/** "2026-10-29 (after close)" → { date, note }; "reported 2026-10-21" → { date: null, note }. */
export function parseEarnings(raw: string | null | undefined): { date: string | null; note: string | null } {
  if (!raw) return { date: null, note: null };
  const s = raw.trim();
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) return { date: null, note: s };
  if (/reported/i.test(s)) return { date: null, note: s };
  const paren = s.match(/\(([^)]+)\)/);
  return { date: m[1], note: paren ? paren[1] : null };
}

const CCY_BY_EXCHANGE: Array<[RegExp, string]> = [
  [/toronto|tsx/i, "CAD"],
  [/tokyo/i, "JPY"],
  [/stockholm/i, "SEK"],
  [/oslo/i, "NOK"],
  [/london/i, "GBP"],
  [/amsterdam|madrid|paris|frankfurt|milan/i, "EUR"],
  [/shanghai|shenzhen/i, "CNY"],
  [/korea/i, "KRW"],
  [/hong kong/i, "HKD"],
];

export function ccyForExchange(exchange: string | null | undefined): string {
  if (!exchange) return "USD";
  for (const [re, c] of CCY_BY_EXCHANGE) if (re.test(exchange)) return c;
  return "USD";
}

const WATCHLIST_EXCHANGE: Record<string, string> = {
  HMY: "NYSE",
  AU: "NYSE",
  LUG: "Toronto (TSX)",
  "005930": "Korea Exchange",
  NBIX: "Nasdaq",
  GOOG: "Nasdaq",
  "600519": "Shanghai",
};

function base(ticker: string): Instrument {
  return {
    ticker,
    yahoo_symbol: ticker,
    name: null,
    exchange: null,
    country: null,
    ccy: "USD",
    sector: null,
    industry: null,
    theme: null,
    kind: "stock",
    status: "watchlist",
    shares: 0,
    avg_cost: null,
    stop_pct: 25,
    stop_price: null,
    target_shares: null,
    ref_price: null,
    tranche: null,
    planned_date: null,
    order_type: null,
    qvm: null,
    q: null,
    v: null,
    m: null,
    exp_return_pct: null,
    monthly_sd: null,
    next_earnings: null,
    earnings_note: null,
    thesis_breakers: [],
    why: null,
    thesis_broken: false,
    thesis_note: null,
    lockout_until: null,
    opened_at: null,
    last_verdict: null,
    notes: null,
  };
}

export function buildSeedInstruments(cfg: StrategyConfig): Instrument[] {
  const out: Instrument[] = [];
  const heldPositions = new Map(cfg.positions.map((p) => [p.ticker, p]));

  for (const s of cfg.stocks) {
    const orders = cfg.pending_orders.filter((o) => o.ticker === s.ticker).sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = orders[0];
    const held = heldPositions.get(s.ticker);
    const e = parseEarnings(s.next_earnings);
    const inst: Instrument = {
      ...base(s.ticker),
      yahoo_symbol: yahooSymbolFor(s.ticker, s.exchange),
      name: s.name,
      exchange: s.exchange,
      country: s.country,
      ccy: s.ccy,
      sector: s.sector,
      industry: s.industry,
      theme: s.theme,
      stop_pct: s.stop_pct,
      ref_price: s.ref_price,
      qvm: s.qvm,
      q: s.q,
      v: s.v,
      m: s.m,
      exp_return_pct: s.exp_return_pct,
      monthly_sd: s.monthly_sd,
      next_earnings: e.date,
      earnings_note: e.note,
      thesis_breakers: s.thesis_breakers ?? [],
      why: s.why,
    };
    if (held && typeof held.shares === "number" && held.shares > 0) {
      inst.status = "held";
      inst.shares = held.shares;
      inst.avg_cost = held.avg_cost_usd ?? s.ref_price;
      inst.target_shares = s.target_shares;
      inst.opened_at = "2026-10-22";
      inst.notes = "Seeded from the strategy file: confirm the actual fill price in WInS.";
    } else {
      inst.status = "pending";
      inst.target_shares = first ? first.shares : s.target_shares;
      inst.planned_date = first ? first.date : null;
      inst.order_type = first ? first.type : null;
      inst.tranche =
        first && orders.length > 1
          ? `${first.tranche}; then ${orders[1].shares} more on ${orders[1].date}${orders[1].condition ? ` (${orders[1].condition})` : ""}`
          : first?.tranche ?? null;
      if (first?.condition) inst.notes = `Condition: ${first.condition}`;
    }
    out.push(inst);
  }

  const indy = cfg.etfs.find((e) => e.ticker === "INDY");
  if (indy) {
    const units = typeof indy.units === "number" ? indy.units : Number(String(indy.units ?? "").match(/\d+/)?.[0] ?? 0);
    out.push({
      ...base("INDY"),
      name: indy.name,
      exchange: "Nasdaq",
      country: "India (ETF)",
      sector: "India ETF",
      kind: "etf",
      status: "held",
      shares: units,
      avg_cost: indy.price ?? null,
      opened_at: "2026-10-01",
      why: "Growth: India's 50 largest companies",
      notes: "Units estimated from value in the strategy file: confirm in WInS.",
    });
  }

  for (const a of cfg.alternates) {
    out.push({
      ...base(a.ticker),
      yahoo_symbol: yahooSymbolFor(a.ticker, a.exchange),
      name: a.name,
      exchange: a.exchange,
      ccy: ccyForExchange(a.exchange),
      sector: a.sector,
      status: "alternate",
      qvm: a.qvm,
      notes: a.note ?? "Alternate: enter Q/V/M and expected return at the re-score to run the entry check.",
    });
  }

  for (const w of cfg.watchlist_fails_E3_only) {
    const ex = WATCHLIST_EXCHANGE[w.ticker] ?? null;
    out.push({
      ...base(w.ticker),
      yahoo_symbol: yahooSymbolFor(w.ticker, ex),
      name: w.name,
      exchange: ex,
      ccy: ccyForExchange(ex),
      status: "watchlist",
      qvm: w.qvm,
      notes: "Watchlist (failed only the trend rule E3 on 23 Oct). Enter Q/V/M and expected return to get a full entry check.",
    });
  }
  return out;
}

export interface SeedTask {
  title: string;
  description: string;
  due_date: string;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  priority: "low" | "normal" | "high";
}

function nextWeekday(fromIso: string, weekday: number): string {
  const d = new Date(`${fromIso}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== weekday);
  return d.toISOString().slice(0, 10);
}

function firstOfNextMonth(fromIso: string): string {
  const [y, m] = fromIso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/** Review calendar (section 9) and open items as starter tasks. */
export function buildSeedTasks(today: string): SeedTask[] {
  return [
    {
      title: "Confirm WInS quantities and fills",
      description: "Load the 6 bonds and quantities from WInS Open Positions (D5), confirm INDY units and the Micron fill price, then import Open Positions into AlertGuard (Trades → Import from WInS).",
      due_date: today,
      recurrence: "none",
      priority: "high",
    },
    {
      title: "Monday review (10 min)",
      description: "Market light · any stock within 5% of its stop · news vs sell triggers · results due this week.",
      due_date: nextWeekday(today, 1),
      recurrence: "weekly",
      priority: "normal",
    },
    {
      title: "Month-start check",
      description: "Month-end market light · X5 trend check · weights vs X6 and the sector limits.",
      due_date: firstOfNextMonth(today),
      recurrence: "monthly",
      priority: "normal",
    },
    {
      title: "Full re-score after the results season",
      description: "Re-score holdings and the pool, update thesis cards, decide X2, X3, X7. Enter new QVM / expected return on the Strategy page.",
      due_date: "2026-11-30",
      recurrence: "none",
      priority: "normal",
    },
    {
      title: "January review",
      description: "Parameter review and change log · glide-path steps · what worked and what didn't.",
      due_date: "2027-01-04",
      recurrence: "none",
      priority: "normal",
    },
  ];
}
