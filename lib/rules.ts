import { tradingDaysBetween } from "./indicators";
import type {
  AlertThresholds,
  Instrument,
  Light,
  MarketState,
  Quote,
  RuleHit,
  StrategyParams,
  Verdict,
} from "./types";

export interface Ctx {
  params: StrategyParams;
  thresholds: AlertThresholds;
  market: MarketState;
  growthUsd: number;
  fx: Record<string, number>; // USD per one unit of currency
  today: string; // YYYY-MM-DD
}

export const fmt = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export function fxRate(fx: Record<string, number>, ccy: string): number | null {
  if (!ccy || ccy.toUpperCase() === "USD") return 1;
  const r = fx[ccy.toUpperCase()];
  return r && Number.isFinite(r) && r > 0 ? r : null;
}

/** Stop price in local currency: the one placed in WInS, else average cost × (1 − stop%). */
export function stopPriceOf(inst: Pick<Instrument, "stop_price" | "avg_cost" | "stop_pct">): number | null {
  if (inst.stop_price && inst.stop_price > 0) return inst.stop_price;
  if (inst.avg_cost && inst.avg_cost > 0) return round2(inst.avg_cost * (1 - inst.stop_pct / 100));
  return null;
}

export function stopPctFor(monthlySd: number | null, fallback: number, params: StrategyParams): number {
  if (monthlySd === null || monthlySd === undefined) return fallback;
  return monthlySd > params.volatileSd ? params.stopVolatile : params.stopNormal;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function positionValueUsd(inst: Instrument, quote: Quote | undefined, fx: Record<string, number>): number | null {
  if (!quote || !inst.shares) return inst.shares ? null : 0;
  const r = fxRate(fx, inst.ccy);
  if (r === null) return null;
  return inst.shares * quote.price * r;
}

/** A quote is stale when its last close is more than 5 calendar days old (covers weekends and holidays). */
export function isStale(quote: Pick<Quote, "last_date">, today: string): boolean {
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${quote.last_date}T00:00:00Z`)) / 86_400_000;
  return !Number.isFinite(age) || age > 5;
}

// ---------------------------------------------------------------- market light

export function marketLight(
  spy: Quote | undefined,
  params: StrategyParams,
  treasuryYield: number,
  today: string,
): MarketState {
  const phase: 1 | 2 = today >= params.phase2Start ? 2 : 1;
  const hurdle = round2(treasuryYield + params.premiumPts);
  if (!spy || spy.ma200 === null || isStale(spy, today)) {
    return {
      light: "YELLOW",
      spy_price: spy?.price ?? null,
      spy_ma: null,
      treasury_yield: treasuryYield,
      hurdle,
      phase,
      as_of: spy?.last_date ?? null,
      reason: spy && spy.ma200 !== null
        ? `SPY data is stale (last close ${spy.last_date}): treated as YELLOW until prices load.`
        : "No SPY data: treated as YELLOW until prices load (no data, no trade).",
    };
  }
  const me = spy.month_end;
  let light: Light = "GREEN";
  let reason = `SPY ${fmt(spy.price)} above its ${params.maDays}-day average ${fmt(spy.ma200)}.`;
  if (me && me.ma !== null && me.close < me.ma) {
    light = "RED";
    reason = `Month-end close ${fmt(me.close)} on ${me.date} was below the ${params.maDays}-day average ${fmt(me.ma)}.`;
  } else if (spy.price < spy.ma200) {
    light = "YELLOW";
    reason = `SPY closed ${fmt(spy.price)} below its ${params.maDays}-day average ${fmt(spy.ma200)}; not yet confirmed at month-end.`;
  }
  return { light, spy_price: spy.price, spy_ma: spy.ma200, treasury_yield: treasuryYield, hurdle, phase, as_of: spy.last_date, reason };
}

export function marketHits(market: MarketState, spy: Quote | undefined, thresholds: AlertThresholds): RuleHit[] {
  const hits: RuleHit[] = [];
  if (market.light === "RED") {
    hits.push({
      ticker: "SPY",
      rule: "MARKET_RED",
      severity: market.phase === 2 ? "EXIT" : "RECHECK",
      kind: "state",
      title: "Market light RED",
      message:
        market.phase === 2
          ? `${market.reason} Phase 2 rule: cut the stock money by 50% (weakest QVM first) into SGOV; buy back after one month-end above.`
          : `${market.reason} Phase 1 rule: no new stock buys; holdings follow their own rules.`,
    });
  } else if (market.light === "YELLOW" && market.spy_ma !== null) {
    hits.push({
      ticker: "SPY",
      rule: "MARKET_YELLOW",
      severity: "RECHECK",
      kind: "state",
      title: "Market light YELLOW",
      message: `${market.reason} ${market.phase === 2 ? "Phase 2: no new buys." : "Phase 1: new buys at half size."}`,
    });
  }
  if (spy && spy.day_change_pct !== null && spy.day_change_pct <= -thresholds.indexDipPct) {
    hits.push({
      ticker: "SPY",
      rule: "MARKET_DIP",
      severity: "INFO",
      kind: "event",
      eventKey: spy.last_date,
      title: `S&P 500 fell ${fmt(Math.abs(spy.day_change_pct), 1)}% today`,
      message: `SPY closed at ${fmt(spy.price)} (${fmt(spy.day_change_pct, 1)}%). A bad day is not a reason to sell; check holdings near their stops.`,
    });
  }
  return hits;
}

// ---------------------------------------------------------------- held positions

export function holdingHits(inst: Instrument, quote: Quote | undefined, ctx: Ctx): RuleHit[] {
  const hits: RuleHit[] = [];
  const t = inst.ticker;
  const { params, thresholds } = ctx;
  if (inst.status !== "held" || !inst.shares) return hits;

  if (!quote || isStale(quote, ctx.today)) {
    hits.push({
      ticker: t,
      rule: "DATA_GAP",
      severity: "INFO",
      kind: "state",
      title: `${t}: no current price data`,
      message: `${quote ? `Last price is from ${quote.last_date}` : `Could not load a price for ${inst.yahoo_symbol}`}${quote?.error ? ` (${quote.error})` : ""}. Check the Yahoo symbol on the Positions page. Rules for ${t} are paused until prices load: no data, no trade.`,
    });
    return hits;
  }

  const price = quote.price;
  const isStock = inst.kind === "stock";
  const breakers = inst.thesis_breakers?.length ? inst.thesis_breakers.join("; ") : "see thesis card";
  const ccy = inst.ccy;

  // Daily dip (event, once per trading day)
  if (quote.day_change_pct !== null && quote.day_change_pct <= -thresholds.dailyDipPct) {
    hits.push({
      ticker: t,
      rule: "DIP",
      severity: "RECHECK",
      kind: "event",
      eventKey: quote.last_date,
      title: `${t} dropped ${fmt(Math.abs(quote.day_change_pct), 1)}% today`,
      message: `${inst.name ?? t} closed at ${ccy} ${fmt(price)} (${fmt(quote.day_change_pct, 1)}% on the day). Re-check the news against the sell triggers: ${breakers}. A bad day alone is not a reason to sell.`,
    });
  }

  if (inst.avg_cost && inst.avg_cost > 0) {
    const fromCost = (price / inst.avg_cost - 1) * 100;
    if (fromCost <= -thresholds.drawdownPct) {
      hits.push({
        ticker: t,
        rule: "DRAWDOWN",
        severity: "RECHECK",
        kind: "state",
        title: `${t} is ${fmt(Math.abs(fromCost), 1)}% below cost`,
        message: `Price ${ccy} ${fmt(price)} vs average cost ${ccy} ${fmt(inst.avg_cost)}. Re-check the thesis (${breakers}) and confirm the stop order is still standing in WInS.`,
      });
    }
  }

  if (!isStock) return hits; // INDY and other ETFs: dip/drawdown only (no stop or QVM rules)

  const stop = stopPriceOf(inst);
  if (stop !== null) {
    if (price <= stop) {
      hits.push({
        ticker: t,
        rule: "X4",
        severity: "EXIT",
        kind: "state",
        title: `EXIT ${t}: hard stop hit (X4)`,
        message: `${t} closed at ${ccy} ${fmt(price)}, at or below the stop ${ccy} ${fmt(stop)} (${inst.stop_pct}% below cost). The standing WInS stop order should have sold all shares. Confirm in WInS and record the sale. Re-buy lockout: ${params.rebuyLockoutMonths} months.`,
      });
    } else if (price <= stop * (1 + thresholds.stopWarnPct / 100)) {
      hits.push({
        ticker: t,
        rule: "STOP_NEAR",
        severity: "RECHECK",
        kind: "state",
        title: `${t} within ${thresholds.stopWarnPct}% of its stop`,
        message: `Price ${ccy} ${fmt(price)} is ${fmt((price / stop - 1) * 100, 1)}% above the stop ${ccy} ${fmt(stop)}. Check the stop order is live in WInS and re-check the sell triggers: ${breakers}.`,
      });
    }
  }
  if (!inst.stop_price) {
    hits.push({
      ticker: t,
      rule: "STOP_MISSING",
      severity: "RECHECK",
      kind: "state",
      title: `Place the stop order for ${t}`,
      message: stop
        ? `No stop price is recorded. In WInS: Sell (never Sell Short) · Stop · all ${inst.shares} shares · stop price ${ccy} ${fmt(stop)} · Good Till Cancelled. Then enter the stop price here.`
        : `No average cost or stop price recorded. Enter the fill price so the ${inst.stop_pct}% stop can be computed.`,
    });
  }

  // X1 thesis break (flagged by the team)
  if (inst.thesis_broken) {
    hits.push({
      ticker: t,
      rule: "X1",
      severity: "EXIT",
      kind: "state",
      title: `EXIT ${t}: thesis break (X1)`,
      message: `A sell trigger was marked as fired${inst.thesis_note ? `: ${inst.thesis_note}` : ""}. Rule X1: sell all within 5 trading days.`,
    });
  }

  // X2 score decay
  if (inst.qvm !== null && inst.qvm < params.sellQvm) {
    hits.push({
      ticker: t,
      rule: "X2",
      severity: "EXIT",
      kind: "state",
      title: `EXIT ${t}: QVM ${fmt(inst.qvm, 1)} below ${params.sellQvm} (X2)`,
      message: `Score decay at the re-score. Rule X2: sell all.`,
    });
  }

  // X3 valuation
  if (inst.exp_return_pct !== null) {
    const ty = ctx.market.treasury_yield;
    if (inst.exp_return_pct < ty + params.valuationAllPts) {
      hits.push({
        ticker: t,
        rule: "X3",
        severity: "EXIT",
        kind: "state",
        title: `EXIT ${t}: valuation (X3, sell all)`,
        message: `Expected return ${fmt(inst.exp_return_pct, 1)}% is below the 10-year Treasury ${fmt(ty)}%${params.valuationAllPts ? ` + ${params.valuationAllPts}` : ""}. Rule X3: sell all.`,
      });
    } else if (inst.exp_return_pct < ty + params.valuationHalfPts) {
      hits.push({
        ticker: t,
        rule: "X3",
        severity: "EXIT",
        kind: "state",
        title: `EXIT half of ${t}: valuation (X3)`,
        message: `Expected return ${fmt(inst.exp_return_pct, 1)}% is below the 10-year Treasury ${fmt(ty)}% + ${params.valuationHalfPts} point. Rule X3: sell half.`,
      });
    }
  }

  // Trend: daily warning, month-end X5 decision
  if (quote.ma200 !== null && price < quote.ma200) {
    hits.push({
      ticker: t,
      rule: "BELOW_MA",
      severity: "RECHECK",
      kind: "state",
      title: `${t} below its ${params.maDays}-day average`,
      message: `Price ${ccy} ${fmt(price)} vs ${params.maDays}-day average ${ccy} ${fmt(quote.ma200)}. Never add below the average. X5 is decided at month-end (close below the average AND 12-1 momentum negative).`,
    });
  }
  const me = quote.month_end;
  const opened = inst.opened_at;
  if (me && me.ma !== null && me.mom12_1 !== null && opened && opened <= me.date && me.close < me.ma && me.mom12_1 < 0) {
    const pm = quote.prev_month_end;
    const second = !!(pm && pm.ma !== null && pm.mom12_1 !== null && opened <= pm.date && pm.close < pm.ma && pm.mom12_1 < 0);
    hits.push({
      ticker: t,
      rule: "X5",
      severity: "EXIT",
      kind: "event",
      eventKey: me.date,
      title: second ? `EXIT ${t}: trend break 2nd month (X5, sell the rest)` : `EXIT half of ${t}: trend break (X5)`,
      message: `Month-end ${me.date}: close ${ccy} ${fmt(me.close)} below the ${params.maDays}-day average ${ccy} ${fmt(me.ma)} and 12-1 momentum ${fmt(me.mom12_1, 1)}%. ${second ? "Also true last month-end: sell the rest." : "Sell half; if still true next month-end, sell the rest."} Re-buy lockout: ${params.rebuyLockoutMonths} months.`,
    });
  }

  // X6 too big
  const r = fxRate(ctx.fx, ccy);
  if (r !== null && ctx.growthUsd > 0) {
    const valueUsd = inst.shares * price * r;
    const pct = (valueUsd / ctx.growthUsd) * 100;
    if (pct > params.trimAbovePct) {
      const targetUsd = (ctx.growthUsd * params.trimToPct) / 100;
      const sell = Math.floor((valueUsd - targetUsd) / (price * r));
      hits.push({
        ticker: t,
        rule: "X6",
        severity: "EXIT",
        kind: "state",
        title: `Trim ${t}: ${fmt(pct, 1)}% of growth money (X6)`,
        message: `Position is worth $${fmt(valueUsd, 0)} = ${fmt(pct, 1)}% of the growth money ($${fmt(ctx.growthUsd, 0)}), above ${params.trimAbovePct}%. Trim to ${params.trimToPct}%: sell about ${sell} shares, then replace the stop for the remaining shares.`,
      });
    }
  }

  // Results coming up
  if (inst.next_earnings) {
    const d = tradingDaysBetween(ctx.today, inst.next_earnings);
    if (Number.isFinite(d) && d >= 0 && d <= params.earningsWindowDays) {
      hits.push({
        ticker: t,
        rule: "EARNINGS",
        severity: "INFO",
        kind: "event",
        eventKey: inst.next_earnings,
        title: `${t} reports results ${d === 0 ? "today" : `in ${d} trading day${d === 1 ? "" : "s"}`}`,
        message: `${inst.name ?? t} results on ${inst.next_earnings}${inst.earnings_note ? ` (${inst.earnings_note})` : ""}. After the report, check the sell triggers: ${breakers}.`,
      });
    }
  }

  return hits;
}

// ---------------------------------------------------------------- entry checker

export interface EntryCheck {
  id: "E1" | "E2" | "E3" | "E4" | "LIMITS" | "LOCKOUT" | "PRICE";
  pass: boolean;
  detail: string;
}

export interface Sizing {
  stopPct: number;
  riskUsd: number;
  positionUsd: number;
  priceUsd: number | null;
  shares: number;
  halfTranche: boolean;
  halfSizeForLight: boolean;
  driftPct: number | null;
  recompute: boolean;
  stopPriceLocal: number | null;
}

export interface CandidateResult {
  verdict: Verdict;
  reason: string;
  checks: EntryCheck[];
  sizing: Sizing | null;
  swapFor: string | null;
}

export interface Book {
  held: Instrument[];
  pending: Instrument[];
  quotes: Record<string, Quote>;
}

export function sizePosition(inst: Instrument, quote: Quote | undefined, ctx: Ctx): Sizing {
  const { params, market } = ctx;
  const stopPct = stopPctFor(inst.monthly_sd, inst.stop_pct, params);
  const riskUsd = (ctx.growthUsd * params.riskPct) / 100;
  let positionUsd = riskUsd / (stopPct / 100);
  const halfSizeForLight = market.light === "YELLOW" && market.phase === 1;
  if (halfSizeForLight) positionUsd *= 0.5;
  positionUsd = Math.min(positionUsd, (ctx.growthUsd * params.maxAtCostPct) / 100);
  const r = fxRate(ctx.fx, inst.ccy);
  const priceUsd = quote && r !== null ? quote.price * r : null;
  let shares = priceUsd ? Math.round(positionUsd / priceUsd) : 0;
  // Never exceed the position cap through rounding.
  if (priceUsd && shares * priceUsd > (ctx.growthUsd * params.maxAtCostPct) / 100) shares = Math.floor(((ctx.growthUsd * params.maxAtCostPct) / 100) / priceUsd);
  let halfTranche = false;
  if (inst.next_earnings) {
    const d = tradingDaysBetween(ctx.today, inst.next_earnings);
    halfTranche = Number.isFinite(d) && d >= 0 && d <= params.earningsWindowDays;
  }
  const driftPct = quote && inst.ref_price ? (quote.price / inst.ref_price - 1) * 100 : null;
  return {
    stopPct,
    riskUsd: round2(riskUsd),
    positionUsd: round2(positionUsd),
    priceUsd: priceUsd === null ? null : round2(priceUsd),
    shares: Math.max(0, shares),
    halfTranche,
    halfSizeForLight,
    driftPct: driftPct === null ? null : round2(driftPct),
    recompute: driftPct !== null && driftPct > params.priceDriftPct,
    stopPriceLocal: quote ? round2(quote.price * (1 - stopPct / 100)) : null,
  };
}

export function evaluateCandidate(inst: Instrument, quote: Quote | undefined, ctx: Ctx, book: Book): CandidateResult {
  const { params, market } = ctx;
  const checks: EntryCheck[] = [];

  const lockedOut = !!(inst.lockout_until && inst.lockout_until > ctx.today);
  checks.push({ id: "LOCKOUT", pass: !lockedOut, detail: lockedOut ? `Re-buy lockout until ${inst.lockout_until}` : "No re-buy lockout" });

  const pillars = [inst.q, inst.v, inst.m];
  const haveScores = inst.qvm !== null && pillars.every((p) => p !== null);
  const e1 = haveScores && (inst.qvm as number) >= params.buyQvm && pillars.every((p) => (p as number) >= params.pillarMin);
  checks.push({
    id: "E1",
    pass: e1,
    detail: haveScores
      ? `QVM ${fmt(inst.qvm, 1)} (need ≥ ${params.buyQvm}); Q${inst.q}/V${inst.v}/M${inst.m} (each ≥ ${params.pillarMin})`
      : "Scores missing — no data, no trade",
  });

  const e2 = inst.exp_return_pct !== null && inst.exp_return_pct >= market.hurdle;
  checks.push({
    id: "E2",
    pass: e2,
    detail: inst.exp_return_pct !== null ? `Expected return ${fmt(inst.exp_return_pct, 1)}% vs hurdle ${fmt(market.hurdle)}%` : "Expected return missing",
  });

  const hasTrend = !!quote && !isStale(quote, ctx.today) && quote.ma200 !== null;
  const e3 = hasTrend && (quote as Quote).price > ((quote as Quote).ma200 as number);
  checks.push({
    id: "E3",
    pass: e3,
    detail: hasTrend
      ? `Price ${fmt(quote!.price)} vs ${params.maDays}-day average ${fmt(quote!.ma200)}`
      : "No price / moving-average data — no data, no trade",
  });

  const e4 = market.light === "GREEN" || (market.light === "YELLOW" && market.phase === 1);
  checks.push({
    id: "E4",
    pass: e4,
    detail: `Market light ${market.light}${market.light === "YELLOW" ? (market.phase === 1 ? " (half size)" : " (Phase 2: no new buys)") : ""}`,
  });

  const priceOk = !!quote && fxRate(ctx.fx, inst.ccy) !== null && quote.price * (fxRate(ctx.fx, inst.ccy) as number) >= params.minPrice;
  checks.push({ id: "PRICE", pass: priceOk, detail: priceOk ? `Price ≥ $${params.minPrice}` : `Price below $${params.minPrice} or unknown` });

  const sizing = quote ? sizePosition(inst, quote, ctx) : null;

  // Limits monitor
  const limitProblems = limitsProblems(inst, sizing?.positionUsd ?? 0, ctx, book);
  checks.push({ id: "LIMITS", pass: limitProblems.length === 0, detail: limitProblems.length ? limitProblems.join("; ") : "Sector, industry, theme and count limits OK" });

  // Portfolio count / X7 swap
  const others = [...book.held, ...book.pending].filter((i) => i.ticker !== inst.ticker && i.kind === "stock");
  const full = others.length >= params.numStocks && inst.status !== "pending";
  let swapFor: string | null = null;
  if (full) {
    const weakest = book.held.filter((h) => h.kind === "stock" && h.qvm !== null).sort((a, b) => (a.qvm as number) - (b.qvm as number))[0];
    if (weakest && inst.qvm !== null && inst.qvm >= (weakest.qvm as number) + params.swapGap) swapFor = weakest.ticker;
  }

  let verdict: Verdict = "BUY";
  let reason = "All entry rules pass.";
  if (lockedOut) {
    verdict = "WAIT";
    reason = `Re-buy lockout until ${inst.lockout_until}.`;
  } else if (!haveScores) {
    verdict = "WAIT";
    reason = "Scores missing: enter QVM, Q/V/M and expected return from the re-score (no data, no trade).";
  } else if (!e1) {
    verdict = "WAIT";
    reason = "E1 fails: not now; re-check at the next quarterly re-score.";
  } else if (!e2) {
    verdict = "REJECT";
    reason = "E2 fails: too expensive (expected return below the hurdle).";
  } else if (!e3) {
    verdict = "WATCHLIST";
    reason = `E3 fails: buy when it closes back above the ${params.maDays}-day average.`;
  } else if (!e4) {
    verdict = "WAIT";
    reason = market.light === "RED" ? "E4 fails: market light RED, no new buys." : "E4 fails: Phase 2 YELLOW, no new buys.";
  } else if (!priceOk) {
    verdict = "WAIT";
    reason = "Price rule fails.";
  } else if (limitProblems.length) {
    verdict = "WAIT";
    reason = `Blocked by limits: ${limitProblems.join("; ")}.`;
  } else if (full && !swapFor) {
    verdict = "WAIT";
    reason = `Already ${params.numStocks} stocks; only as an X7 swap (≥ ${params.swapGap} QVM points above the weakest holding).`;
  } else if (sizing && sizing.shares < 1) {
    verdict = "WAIT";
    reason = "Position size rounds to 0 shares at this price.";
  } else if (swapFor) {
    reason = `X7 better idea: swap for ${swapFor} (max 2 swaps a quarter).`;
  }
  return { verdict, reason, checks, sizing, swapFor };
}

function limitsProblems(inst: Instrument, positionUsd: number, ctx: Ctx, book: Book): string[] {
  const { params } = ctx;
  const problems: string[] = [];
  const peers = [...book.held, ...book.pending].filter((i) => i.ticker !== inst.ticker && i.kind === "stock");
  if (inst.industry) {
    const n = peers.filter((p) => p.industry === inst.industry).length;
    if (n >= params.maxPerIndustry) problems.push(`${n} stocks already in ${inst.industry} (max ${params.maxPerIndustry})`);
  }
  if (inst.theme) {
    const n = peers.filter((p) => p.theme === inst.theme).length;
    if (n >= params.maxPerTheme) problems.push(`${n} stocks already on the ${inst.theme} theme (max ${params.maxPerTheme})`);
  }
  if (inst.sector && positionUsd > 0) {
    let total = positionUsd;
    let sector = positionUsd;
    for (const p of peers) {
      const v = plannedValueUsd(p, book.quotes[p.yahoo_symbol], ctx.fx);
      total += v;
      if (p.sector === inst.sector) sector += v;
    }
    // Only meaningful once the stock book is reasonably built out.
    const pct = (sector / total) * 100;
    if (peers.length >= 5 && pct > params.sectorMaxPct) problems.push(`${inst.sector} would be ${fmt(pct, 1)}% of stock money (max ${params.sectorMaxPct}%)`);
  }
  return problems;
}

/** Held value at market, or for pending orders the planned value (target shares × price). */
export function plannedValueUsd(inst: Instrument, quote: Quote | undefined, fx: Record<string, number>): number {
  const r = fxRate(fx, inst.ccy) ?? 0;
  const px = quote?.price ?? inst.ref_price ?? inst.avg_cost ?? 0;
  const shares = inst.status === "held" ? inst.shares : inst.target_shares ?? 0;
  return shares * px * r;
}

export function candidateHits(inst: Instrument, res: CandidateResult, ctx: Ctx): RuleHit[] {
  const t = inst.ticker;
  const hits: RuleHit[] = [];
  if (inst.status !== "pending" && inst.status !== "watchlist") return hits;
  const s = res.sizing;
  if (res.verdict === "BUY" && s) {
    const shares = s.halfTranche ? Math.max(1, Math.round(s.shares / 2)) : s.shares;
    const exec = /nasdaq$|nyse|toronto|tsx/i.test(inst.exchange ?? "") || inst.exchange === null
      ? "Market order in regular hours, not in the first 30 minutes, at least 15 minutes before the close."
      : "Limit order at the current WInS ask, valid for the day, after the first 30 minutes of that exchange.";
    hits.push({
      ticker: t,
      rule: res.swapFor ? "X7_SWAP" : "NEW_BUY",
      severity: "NEW_TRADE",
      kind: "state",
      title: res.swapFor ? `New trade: swap ${res.swapFor} → ${t} (X7)` : `New trade: BUY ${shares} ${t}`,
      message: [
        `All entry rules pass for ${inst.name ?? t} (QVM ${fmt(inst.qvm, 1)}, Q${inst.q}/V${inst.v}/M${inst.m}).`,
        `Size: ${shares} shares${s.halfTranche ? " (first half: results within 5 trading days)" : ""}${s.halfSizeForLight ? " (YELLOW light: half size)" : ""}, about $${fmt(shares * (s.priceUsd ?? 0), 0)}.`,
        exec,
        s.recompute ? `Price is ${fmt(s.driftPct, 1)}% above the reference: shares were recomputed at today's price.` : "",
        `After the fill: Stop order ${s.stopPct}% below cost (≈ ${inst.ccy} ${fmt(s.stopPriceLocal)}), Good Till Cancelled.`,
        res.swapFor ? res.reason : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  } else if (inst.status === "watchlist" && res.checks.find((c) => c.id === "E3")?.pass && res.checks.find((c) => c.id === "E4")?.pass && (inst.q === null || inst.v === null || inst.m === null || inst.exp_return_pct === null)) {
    // Watchlist names from the strategy carry only a QVM: tell the team when the trend rule turns, so they re-score and buy.
    hits.push({
      ticker: t,
      rule: "WATCH_TREND",
      severity: "NEW_TRADE",
      kind: "state",
      title: `${t} is back above its ${ctx.params.maDays}-day average`,
      message: `${inst.name ?? t} (QVM ${fmt(inst.qvm, 1)}) failed only the trend rule E3 and now passes it. Re-score it (enter Q/V/M and expected return on its page) to confirm E1 and E2, then buy at the size shown on the New trades page.`,
    });
  } else if (inst.status === "pending" && res.verdict !== "BUY") {
    hits.push({
      ticker: t,
      rule: "ORDER_BLOCKED",
      severity: "RECHECK",
      kind: "state",
      title: `Hold the ${t} order: ${res.verdict}`,
      message: `The planned order for ${t} should not be placed today. ${res.reason}`,
    });
  }
  return hits;
}

// ---------------------------------------------------------------- calendar

const GLIDE_DATES: Array<{ date: string; title: string; message: string }> = [
  { date: "2028-01-03", title: "Laura's $150,000 contribution arrives", message: "Follow section 8: finish the reserve (IBTO/IBTP/IBTQ), IBTM floor if yield ≥ 4.5%, then 70% QVM stocks / 30% INDY." },
  { date: "2031-01-01", title: "Glide path: Phase 2 starts", message: "Move one-third of stocks + INDY into SGOV. YELLOW now means no new buys." },
  { date: "2032-01-01", title: "Glide path: second step", message: "Move half of the remaining stocks + INDY into SGOV." },
  { date: "2033-01-01", title: "Facility contribution + operating payment 1", message: "Pay operating payment 1 and the facility contribution; keep a $50,000 flexibility buffer invested." },
];

export function calendarHits(today: string): RuleHit[] {
  const hits: RuleHit[] = [];
  const t = Date.parse(`${today}T00:00:00Z`);
  for (const g of GLIDE_DATES) {
    const days = (Date.parse(`${g.date}T00:00:00Z`) - t) / 86_400_000;
    if (days >= 0 && days <= 14) {
      hits.push({ ticker: null, rule: "GLIDE", severity: "INFO", kind: "event", eventKey: g.date, title: `${g.title} (${g.date})`, message: g.message });
    }
  }
  return hits;
}

/** Stable key identifying the condition behind a hit (used for de-duplication). */
export function ruleKey(h: RuleHit): string {
  return `${h.ticker ?? "_"}:${h.rule}`;
}

export function dedupeKey(h: RuleHit, today: string): string {
  return h.kind === "event" ? `${ruleKey(h)}@${h.eventKey ?? today}` : `${ruleKey(h)}#${today}`;
}
