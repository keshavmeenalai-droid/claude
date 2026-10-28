import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "@/lib/params";
import { candidateHits, evaluateCandidate, holdingHits, marketHits, marketLight, sizePosition, stopPriceOf } from "@/lib/rules";
import { ctx, flatQuote, inst, market, quoteFrom, series } from "./helpers";

const rules = (hits: { rule: string }[]) => hits.map((h) => h.rule).sort();

describe("market light", () => {
  it("is GREEN when SPY is above its 200-day average", () => {
    const closes = series("2026-10-23", 300, (i) => 600 + i * 0.6);
    const m = marketLight(quoteFrom("SPY", closes), DEFAULT_PARAMS, 5.13, "2026-10-23");
    expect(m.light).toBe("GREEN");
    expect(m.hurdle).toBe(8.63);
    expect(m.phase).toBe(1);
  });

  it("is YELLOW after a daily close below the average, not yet at month-end", () => {
    // Rising all year, then a crash in the last 3 days of October.
    const closes = series("2026-10-23", 300, (i) => (i < 297 ? 600 + i * 0.6 : 500));
    const m = marketLight(quoteFrom("SPY", closes), DEFAULT_PARAMS, 5.13, "2026-10-23");
    expect(m.light).toBe("YELLOW");
    expect(marketHits(m, quoteFrom("SPY", closes), { dailyDipPct: 4, drawdownPct: 10, stopWarnPct: 5, indexDipPct: 2 }).map((h) => h.rule)).toContain("MARKET_YELLOW");
  });

  it("is RED when the last month-end close was below the average", () => {
    // Falls below the average from mid-September onwards; series ends in October.
    const closes = series("2026-10-23", 300, (i) => (i < 270 ? 600 + i * 0.6 : 400));
    const q = quoteFrom("SPY", closes);
    expect(q.month_end?.date).toBe("2026-09-30");
    const m = marketLight(q, DEFAULT_PARAMS, 5.13, "2026-10-23");
    expect(m.light).toBe("RED");
    const hits = marketHits(m, q, { dailyDipPct: 4, drawdownPct: 10, stopWarnPct: 5, indexDipPct: 2 });
    expect(hits[0].severity).toBe("RECHECK"); // Phase 1: no new buys, not an exit
    const m2 = marketLight(q, DEFAULT_PARAMS, 5.13, "2031-02-03");
    expect(m2.phase).toBe(2);
  });

  it("treats missing or stale SPY data as YELLOW", () => {
    expect(marketLight(undefined, DEFAULT_PARAMS, 5, "2026-10-23").light).toBe("YELLOW");
    const stale = flatQuote({ symbol: "SPY", last_date: "2026-10-01" });
    expect(marketLight(stale, DEFAULT_PARAMS, 5, "2026-10-23").light).toBe("YELLOW");
  });
});

describe("held position rules", () => {
  it("raises nothing for a healthy position", () => {
    expect(holdingHits(inst(), flatQuote(), ctx())).toEqual([]);
  });

  it("X4: price at or below the stop is an EXIT", () => {
    const hits = holdingHits(inst(), flatQuote({ price: 74, prev_close: 76, day_change_pct: -2.6 }), ctx());
    expect(rules(hits)).toEqual(["BELOW_MA", "DRAWDOWN", "X4"]);
    expect(hits.find((h) => h.rule === "X4")!.severity).toBe("EXIT");
  });

  it("warns when the price is within 5% of the stop", () => {
    const hits = holdingHits(inst(), flatQuote({ price: 78, ma200: 70 }), ctx());
    expect(rules(hits)).toEqual(["DRAWDOWN", "STOP_NEAR"]);
  });

  it("flags a daily dip as a once-per-day event", () => {
    const hits = holdingHits(inst(), flatQuote({ price: 95, prev_close: 100, day_change_pct: -5 }), ctx());
    const dip = hits.find((h) => h.rule === "DIP")!;
    expect(dip.kind).toBe("event");
    expect(dip.eventKey).toBe("2026-10-23");
    expect(dip.severity).toBe("RECHECK");
  });

  it("asks for the stop order when none is recorded and computes it from cost", () => {
    const i = inst({ stop_price: null, stop_pct: 30, avg_cost: 211.7 });
    expect(stopPriceOf(i)).toBe(148.19);
    const hits = holdingHits(i, flatQuote({ price: 212 }), ctx());
    expect(hits.map((h) => h.rule)).toEqual(["STOP_MISSING"]);
    expect(hits[0].message).toContain("148.19");
  });

  it("X1 thesis break, X2 score decay and X3 valuation are EXITs", () => {
    const hits = holdingHits(inst({ thesis_broken: true, qvm: 30, exp_return_pct: 5.5 }), flatQuote(), ctx());
    expect(rules(hits)).toEqual(["X1", "X2", "X3"]);
    expect(hits.find((h) => h.rule === "X3")!.title).toContain("half");
    const all = holdingHits(inst({ exp_return_pct: 5.0 }), flatQuote(), ctx());
    expect(all.find((h) => h.rule === "X3")!.title).toContain("sell all");
  });

  it("X6: position above 8% of growth money must be trimmed to 6%", () => {
    // 50 shares × $100 = $5,000 = 9.6% of $52,255
    const hits = holdingHits(inst({ shares: 50 }), flatQuote(), ctx());
    const x6 = hits.find((h) => h.rule === "X6")!;
    expect(x6).toBeDefined();
    expect(x6.message).toContain("sell about 18 shares"); // (5000 - 3135.3) / 100
  });

  it("converts foreign prices to USD for X6", () => {
    // VAR: 345 shares × NOK 58.94 × 0.10715 ≈ $2,179 = 4.2% → no trim
    const hits = holdingHits(inst({ ticker: "VAR", ccy: "NOK", shares: 345, avg_cost: 58.94, stop_price: 41.26, stop_pct: 30 }), flatQuote({ price: 58.94, ma200: 50 }), ctx());
    expect(hits.find((h) => h.rule === "X6")).toBeUndefined();
  });

  it("X5 fires only at month-end, when the stock was held then, with negative 12-1 momentum", () => {
    const me = { date: "2026-09-30", close: 80, ma: 90, mom12_1: -5 };
    const q = flatQuote({ month_end: me });
    expect(holdingHits(inst({ opened_at: "2026-10-05" }), q, ctx()).find((h) => h.rule === "X5")).toBeUndefined();
    const x5 = holdingHits(inst({ opened_at: "2026-01-05" }), q, ctx()).find((h) => h.rule === "X5")!;
    expect(x5.title).toContain("half");
    expect(x5.eventKey).toBe("2026-09-30");
    const second = holdingHits(inst({ opened_at: "2026-01-05" }), flatQuote({ month_end: me, prev_month_end: { date: "2026-08-31", close: 80, ma: 90, mom12_1: -2 } }), ctx()).find((h) => h.rule === "X5")!;
    expect(second.title).toContain("sell the rest");
    expect(holdingHits(inst(), flatQuote({ month_end: { ...me, mom12_1: 3 } }), ctx()).find((h) => h.rule === "X5")).toBeUndefined();
  });

  it("warns about results within 5 trading days", () => {
    const hits = holdingHits(inst({ next_earnings: "2026-10-29", earnings_note: "after close" }), flatQuote(), ctx());
    const e = hits.find((h) => h.rule === "EARNINGS")!;
    expect(e.title).toContain("in 4 trading days");
    expect(holdingHits(inst({ next_earnings: "2026-11-17" }), flatQuote(), ctx()).find((h) => h.rule === "EARNINGS")).toBeUndefined();
  });

  it("ETFs get dip and drawdown alerts only", () => {
    const etf = inst({ ticker: "INDY", kind: "etf", stop_price: null, qvm: null, exp_return_pct: null });
    const hits = holdingHits(etf, flatQuote({ price: 85, prev_close: 90, day_change_pct: -5.6, ma200: 95 }), ctx());
    expect(rules(hits)).toEqual(["DIP", "DRAWDOWN"]);
  });

  it("pauses rules when price data is missing or stale", () => {
    expect(rules(holdingHits(inst(), undefined, ctx()))).toEqual(["DATA_GAP"]);
    expect(rules(holdingHits(inst({ thesis_broken: true }), flatQuote({ last_date: "2026-10-10" }), ctx()))).toEqual(["DATA_GAP"]);
  });
});

describe("entry checker and sizing", () => {
  const nvda = inst({ ticker: "NVDA", status: "pending", shares: 0, avg_cost: null, stop_price: null, stop_pct: 30, monthly_sd: 0.145, qvm: 73.6, q: 100, v: 51, m: 62, exp_return_pct: 12.5, ref_price: 211.7, industry: "Semiconductors", theme: "AI" });
  const book = { held: [], pending: [], quotes: {} };

  it("reproduces the strategy's position size (NVDA: 10 shares at $211.70)", () => {
    const s = sizePosition(nvda, flatQuote({ price: 211.7, ma200: 180 }), ctx());
    expect(s.stopPct).toBe(30);
    expect(s.riskUsd).toBe(653.19);
    expect(s.positionUsd).toBe(2177.29);
    expect(s.shares).toBe(10);
    expect(s.recompute).toBe(false);
  });

  it("uses a 25% stop for calm stocks (ULTA: 4 shares at $620.27)", () => {
    const ulta = inst({ status: "pending", monthly_sd: 0.094, ref_price: 620.27 });
    const s = sizePosition(ulta, flatQuote({ price: 620.27 }), ctx());
    expect(s.stopPct).toBe(25);
    expect(s.shares).toBe(4);
  });

  it("converts foreign prices (VAR: 345 shares at NOK 58.94)", () => {
    const v = inst({ ccy: "NOK", status: "pending", monthly_sd: 0.102 });
    expect(sizePosition(v, flatQuote({ price: 58.94 }), ctx()).shares).toBe(345);
  });

  it("halves the size on a YELLOW light and for results within 5 trading days", () => {
    const s = sizePosition(nvda, flatQuote({ price: 211.7 }), ctx({ market: market({ light: "YELLOW" }) }));
    expect(s.halfSizeForLight).toBe(true);
    expect(s.shares).toBe(5);
    const e = sizePosition({ ...nvda, next_earnings: "2026-10-29" }, flatQuote({ price: 211.7 }), ctx());
    expect(e.halfTranche).toBe(true);
  });

  it("flags price drift above 2% so shares are recomputed", () => {
    const s = sizePosition(nvda, flatQuote({ price: 220 }), ctx());
    expect(s.recompute).toBe(true);
    expect(s.shares).toBe(10); // 2177.29 / 220 = 9.9
  });

  it("BUY when all four entry rules pass, and raises a NEW_TRADE alert", () => {
    const r = evaluateCandidate(nvda, flatQuote({ price: 211.7, ma200: 180 }), ctx(), book);
    expect(r.verdict).toBe("BUY");
    const hits = candidateHits(nvda, r, ctx());
    expect(hits[0].severity).toBe("NEW_TRADE");
    expect(hits[0].title).toBe("New trade: BUY 10 NVDA");
    expect(hits[0].message).toContain("Market order");
  });

  it("E1 → WAIT, E2 → REJECT, E3 → WATCHLIST, E4 → WAIT", () => {
    const q = flatQuote({ price: 211.7, ma200: 180 });
    expect(evaluateCandidate({ ...nvda, qvm: 55 }, q, ctx(), book).verdict).toBe("WAIT");
    expect(evaluateCandidate({ ...nvda, v: 20 }, q, ctx(), book).verdict).toBe("WAIT");
    expect(evaluateCandidate({ ...nvda, exp_return_pct: 8 }, q, ctx(), book).verdict).toBe("REJECT");
    expect(evaluateCandidate(nvda, flatQuote({ price: 170, ma200: 180 }), ctx(), book).verdict).toBe("WATCHLIST");
    expect(evaluateCandidate(nvda, q, ctx({ market: market({ light: "RED" }) }), book).verdict).toBe("WAIT");
    expect(evaluateCandidate(nvda, q, ctx({ market: market({ light: "YELLOW", phase: 2 }) }), book).verdict).toBe("WAIT");
    expect(evaluateCandidate(nvda, undefined, ctx(), book).verdict).toBe("WATCHLIST");
  });

  it("a pending order that no longer passes raises ORDER_BLOCKED", () => {
    const r = evaluateCandidate(nvda, flatQuote({ price: 170, ma200: 180 }), ctx(), book);
    expect(candidateHits(nvda, r, ctx()).map((h) => h.rule)).toEqual(["ORDER_BLOCKED"]);
    const w = { ...nvda, status: "alternate" as const };
    expect(candidateHits(w, evaluateCandidate(w, flatQuote({ price: 211.7, ma200: 180 }), ctx(), book), ctx())).toEqual([]);
  });

  it("blocks a third stock in one industry and a fourth on one theme", () => {
    const mu = inst({ ticker: "MU", industry: "Semiconductors", theme: "AI" });
    const amd = inst({ ticker: "AMD", status: "pending", industry: "Semiconductors", theme: "AI" });
    const r = evaluateCandidate(nvda, flatQuote({ price: 211.7, ma200: 180 }), ctx(), { held: [mu], pending: [amd], quotes: {} });
    expect(r.verdict).toBe("WAIT");
    expect(r.reason).toContain("Semiconductors");
  });

  it("respects the re-buy lockout", () => {
    const r = evaluateCandidate({ ...nvda, lockout_until: "2027-01-01" }, flatQuote({ price: 211.7, ma200: 180 }), ctx(), book);
    expect(r.verdict).toBe("WAIT");
    expect(r.reason).toContain("lockout");
  });

  it("watchlist names with only a QVM alert when they cross back above the average", () => {
    const hmy = inst({ ticker: "HMY", status: "watchlist", shares: 0, avg_cost: null, q: null, v: null, m: null, exp_return_pct: null, qvm: 72.2 });
    const above = evaluateCandidate(hmy, flatQuote({ price: 20, ma200: 18 }), ctx(), book);
    expect(above.reason).toContain("Scores missing");
    expect(candidateHits(hmy, above, ctx()).map((h) => h.rule)).toEqual(["WATCH_TREND"]);
    const below = evaluateCandidate(hmy, flatQuote({ price: 17, ma200: 18 }), ctx(), book);
    expect(candidateHits(hmy, below, ctx())).toEqual([]);
  });
});
