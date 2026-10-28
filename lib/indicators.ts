import type { MonthEndSnapshot, PricePoint } from "./types";

/** Simple moving average of the `days` closes ending at index `idx` (inclusive). */
export function movingAverage(closes: PricePoint[], days: number, idx = closes.length - 1): number | null {
  if (days <= 0 || idx < days - 1 || idx >= closes.length) return null;
  let sum = 0;
  for (let i = idx - days + 1; i <= idx; i++) sum += closes[i].c;
  return sum / days;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Index of the last close on or before `iso`, or -1. Closes must be sorted ascending. */
export function indexOnOrBefore(closes: PricePoint[], iso: string, upTo = closes.length - 1): number {
  for (let i = Math.min(upTo, closes.length - 1); i >= 0; i--) {
    if (closes[i].d <= iso) return i;
  }
  return -1;
}

/** Percent return from the close `lookbackDays` calendar days before closes[idx] to closes[idx]. */
export function trailingReturn(closes: PricePoint[], lookbackDays: number, idx = closes.length - 1): number | null {
  if (idx < 0 || idx >= closes.length) return null;
  const target = shiftDate(closes[idx].d, -lookbackDays);
  const j = indexOnOrBefore(closes, target, idx);
  if (j < 0) return null;
  // Require the history to actually reach back roughly that far (within 7 days).
  const gapDays = (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${closes[j].d}T00:00:00Z`)) / 86_400_000;
  if (gapDays > 7) return null;
  return (closes[idx].c / closes[j].c - 1) * 100;
}

/** 12-1 momentum in percent: ((1 + r52w) / (1 + r30d) - 1) * 100. */
export function momentum12_1(ret52w: number | null, ret30d: number | null): number | null {
  if (ret52w === null || ret30d === null) return null;
  const denom = 1 + ret30d / 100;
  if (denom <= 0) return null;
  return ((1 + ret52w / 100) / denom - 1) * 100;
}

/**
 * Last trading day of the most recent *completed* calendar month before the
 * month of the latest close. Returns its close, moving average and 12-1 momentum.
 * `monthsBack` = 1 gives the latest month-end, 2 gives the one before it.
 */
export function monthEndSnapshot(closes: PricePoint[], maDays: number, monthsBack = 1): MonthEndSnapshot | null {
  if (closes.length === 0) return null;
  const last = closes[closes.length - 1].d;
  const y = Number(last.slice(0, 4));
  const m = Number(last.slice(5, 7)); // 1-12
  // First day of the month that is (monthsBack - 1) months before the latest month.
  const firstOfMonth = new Date(Date.UTC(y, m - 1 - (monthsBack - 1), 1));
  const dayBefore = new Date(firstOfMonth.getTime() - 86_400_000).toISOString().slice(0, 10);
  const idx = indexOnOrBefore(closes, dayBefore);
  if (idx < 0) return null;
  // The found close must belong to that month (no data gaps longer than a month).
  if (closes[idx].d.slice(0, 7) !== dayBefore.slice(0, 7)) return null;
  const r52 = trailingReturn(closes, 365, idx);
  const r30 = trailingReturn(closes, 30, idx);
  return {
    date: closes[idx].d,
    close: closes[idx].c,
    ma: movingAverage(closes, maDays, idx),
    mom12_1: momentum12_1(r52, r30),
  };
}

export interface ComputedIndicators {
  price: number;
  prev_close: number | null;
  day_change_pct: number | null;
  ma200: number | null;
  ret_52w: number | null;
  ret_30d: number | null;
  mom12_1: number | null;
  high_52w: number | null;
  low_52w: number | null;
  last_date: string;
  month_end: MonthEndSnapshot | null;
  prev_month_end: MonthEndSnapshot | null;
}

export function computeIndicators(closes: PricePoint[], maDays: number): ComputedIndicators | null {
  if (closes.length === 0) return null;
  const n = closes.length;
  const price = closes[n - 1].c;
  const prev = n >= 2 ? closes[n - 2].c : null;
  const ret52 = trailingReturn(closes, 365);
  const ret30 = trailingReturn(closes, 30);
  const yearAgo = shiftDate(closes[n - 1].d, -365);
  const lastYear = closes.filter((p) => p.d > yearAgo);
  return {
    price,
    prev_close: prev,
    day_change_pct: prev ? (price / prev - 1) * 100 : null,
    ma200: movingAverage(closes, maDays),
    ret_52w: ret52,
    ret_30d: ret30,
    mom12_1: momentum12_1(ret52, ret30),
    high_52w: lastYear.length ? Math.max(...lastYear.map((p) => p.c)) : null,
    low_52w: lastYear.length ? Math.min(...lastYear.map((p) => p.c)) : null,
    last_date: closes[n - 1].d,
    month_end: monthEndSnapshot(closes, maDays, 1),
    prev_month_end: monthEndSnapshot(closes, maDays, 2),
  };
}

/** Number of weekdays strictly after `fromIso` up to and including `toIso`. Negative if `toIso` is earlier. */
export function tradingDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return NaN;
  const sign = to >= from ? 1 : -1;
  const [a, b] = sign === 1 ? [from, to] : [to, from];
  let count = 0;
  for (let t = a + 86_400_000; t <= b; t += 86_400_000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count * sign;
}
