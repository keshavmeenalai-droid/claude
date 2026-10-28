export type InstrumentStatus = "held" | "pending" | "watchlist" | "alternate" | "sold";
export type Severity = "EXIT" | "RECHECK" | "NEW_TRADE" | "INFO";
export type Light = "GREEN" | "YELLOW" | "RED";
export type Verdict = "BUY" | "WAIT" | "REJECT" | "WATCHLIST";

export interface Instrument {
  ticker: string;
  yahoo_symbol: string;
  name: string | null;
  exchange: string | null;
  country: string | null;
  ccy: string;
  sector: string | null;
  industry: string | null;
  theme: string | null;
  kind: "stock" | "etf";
  status: InstrumentStatus;
  shares: number;
  avg_cost: number | null; // local currency
  stop_pct: number;
  stop_price: number | null; // local currency, as placed in WInS
  target_shares: number | null;
  ref_price: number | null;
  tranche: string | null;
  planned_date: string | null;
  order_type: string | null;
  qvm: number | null;
  q: number | null;
  v: number | null;
  m: number | null;
  exp_return_pct: number | null;
  monthly_sd: number | null;
  next_earnings: string | null;
  earnings_note: string | null;
  thesis_breakers: string[];
  why: string | null;
  thesis_broken: boolean;
  thesis_note: string | null;
  lockout_until: string | null;
  opened_at: string | null;
  last_verdict: string | null;
  notes: string | null;
}

export interface PricePoint {
  d: string; // YYYY-MM-DD
  c: number;
}

export interface MonthEndSnapshot {
  date: string;
  close: number;
  ma: number | null;
  mom12_1: number | null;
}

export interface Quote {
  symbol: string;
  price: number;
  prev_close: number | null;
  day_change_pct: number | null;
  ma200: number | null;
  ret_52w: number | null;
  ret_30d: number | null;
  mom12_1: number | null;
  high_52w: number | null;
  low_52w: number | null;
  currency: string;
  last_date: string;
  month_end: MonthEndSnapshot | null;
  prev_month_end: MonthEndSnapshot | null;
  closes: PricePoint[];
  fetched_at?: string;
  error?: string | null;
}

export interface StrategyParams {
  riskPct: number; // P10 % of growth money risked per stock
  stopNormal: number; // P11
  stopVolatile: number; // P11
  volatileSd: number; // P11 monthly SD threshold
  maxAtCostPct: number; // P12
  trimAbovePct: number; // P12 / X6
  trimToPct: number; // P12 / X6
  buyQvm: number; // P5
  pillarMin: number; // P5
  sellQvm: number; // P6 / X2
  premiumPts: number; // P7
  maDays: number; // P9
  sectorMaxPct: number; // P13
  maxPerIndustry: number; // P13
  maxPerTheme: number; // P13
  numStocks: number; // P14
  swapGap: number; // P15
  valuationHalfPts: number; // P16
  valuationAllPts: number; // P16
  phase2Start: string; // P17
  priceDriftPct: number; // execution: recompute shares if > x% above ref
  earningsWindowDays: number; // trading days
  rebuyLockoutMonths: number;
  minPrice: number; // D4
}

export interface AlertThresholds {
  dailyDipPct: number; // alert when a holding falls this much in one day
  drawdownPct: number; // alert when price is this far below average cost
  stopWarnPct: number; // alert when price is within x% above the stop
  indexDipPct: number; // alert when SPY falls this much in one day
}

export interface MarketState {
  light: Light;
  spy_price: number | null;
  spy_ma: number | null;
  treasury_yield: number;
  hurdle: number;
  phase: 1 | 2;
  as_of: string | null;
  reason: string;
}

export interface RuleHit {
  ticker: string | null;
  rule: string; // e.g. X4, STOP_NEAR, DIP, NEW_BUY
  severity: Severity;
  title: string;
  message: string;
  /** "state" hits stay open while the condition holds; "event" hits fire once per eventKey */
  kind: "state" | "event";
  eventKey?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string | null;
  active: boolean;
  notify_alerts: boolean;
  notify_tasks: boolean;
}

export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  recurrence: Recurrence;
  priority: "low" | "normal" | "high";
  status: "todo" | "in_progress" | "done";
  last_reminded_on: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AlertRow {
  id: number;
  created_at: string;
  rule_key: string;
  dedupe_key: string;
  ticker: string | null;
  rule: string;
  severity: Severity;
  title: string;
  message: string;
  status: "open" | "acknowledged" | "resolved";
  last_seen_at: string;
  resolved_at: string | null;
  acknowledged_by: string | null;
  emailed: boolean;
}
