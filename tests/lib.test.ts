import { describe, expect, it } from "vitest";
import config from "@/config/qvm_strategy.json";
import { computeIndicators, momentum12_1, monthEndSnapshot, movingAverage, tradingDaysBetween, trailingReturn } from "@/lib/indicators";
import { validateParamChange } from "@/lib/params";
import { applyTrade } from "@/lib/portfolio";
import { buildSeedInstruments, buildSeedTasks, parseEarnings, type StrategyConfig } from "@/lib/seed";
import { nextDueDate, shouldRemind, todayIn } from "@/lib/tasks";
import { matchTicker, parseNumber, parseWinsPositions } from "@/lib/wins-import";
import { normalizeCurrency, parseYahooChart, yahooSymbolFor } from "@/lib/yahoo";
import { series } from "./helpers";

describe("indicators", () => {
  it("moving average and returns", () => {
    const c = series("2026-10-23", 300, (i) => i + 1);
    expect(movingAverage(c, 200)).toBe((101 + 300) / 2);
    expect(movingAverage(c.slice(0, 199), 200)).toBeNull();
    const r = trailingReturn(c, 30)!;
    expect(r).toBeGreaterThan(0);
    expect(momentum12_1(20, 10)).toBeCloseTo((1.2 / 1.1 - 1) * 100, 10);
    expect(momentum12_1(null, 10)).toBeNull();
  });

  it("finds the last completed month-end", () => {
    const c = series("2026-11-03", 400, () => 10);
    expect(monthEndSnapshot(c, 200)!.date).toBe("2026-10-30"); // 31 Oct 2026 is a Saturday
    expect(monthEndSnapshot(c, 200, 2)!.date).toBe("2026-09-30");
    const ind = computeIndicators(c, 200)!;
    expect(ind.day_change_pct).toBe(0);
    expect(ind.ma200).toBe(10);
  });

  it("counts trading days", () => {
    expect(tradingDaysBetween("2026-10-23", "2026-10-30")).toBe(5);
    expect(tradingDaysBetween("2026-10-23", "2026-10-23")).toBe(0);
    expect(tradingDaysBetween("2026-10-30", "2026-10-23")).toBe(-5);
  });
});

describe("yahoo parsing", () => {
  it("maps exchanges to Yahoo symbols", () => {
    expect(yahooSymbolFor("ATZ", "Toronto (TSX)")).toBe("ATZ.TO");
    expect(yahooSymbolFor("6532", "Tokyo (TSE)")).toBe("6532.T");
    expect(yahooSymbolFor("EVO", "Nasdaq Stockholm")).toBe("EVO.ST");
    expect(yahooSymbolFor("VAR", "Oslo Børs")).toBe("VAR.OL");
    expect(yahooSymbolFor("NVDA", "Nasdaq")).toBe("NVDA");
    expect(yahooSymbolFor("MSCI", "NYSE")).toBe("MSCI");
    expect(yahooSymbolFor("NXT", "London")).toBe("NXT.L");
  });

  it("parses chart JSON, skipping nulls and converting pence", () => {
    const json = {
      chart: {
        result: [
          {
            meta: { symbol: "NXT.L", currency: "GBp", gmtoffset: 0 },
            timestamp: [1761148800, 1761235200, 1761321600],
            indicators: { quote: [{ close: [10000, null, 10250] }] },
          },
        ],
        error: null,
      },
    };
    const p = parseYahooChart(json);
    expect(p.currency).toBe("GBP");
    expect(p.closes).toEqual([
      { d: "2025-10-22", c: 100 },
      { d: "2025-10-24", c: 102.5 },
    ]);
    expect(() => parseYahooChart({ chart: { result: null, error: { description: "No data found" } } })).toThrow("No data found");
    expect(normalizeCurrency("JPY")).toEqual({ ccy: "JPY", factor: 1 });
  });

  it("uses the exchange's local date (Tokyo)", () => {
    // 15:30 UTC on 22 Oct = 00:30 JST on 23 Oct
    const p = parseYahooChart({ chart: { result: [{ meta: { currency: "JPY", gmtoffset: 32400 }, timestamp: [1792683000], indicators: { quote: [{ close: [11500] }] } }] } });
    expect(p.closes[0].d).toBe("2026-10-23");
  });
});

describe("trades", () => {
  const empty = { shares: 0, avg_cost: null, status: "pending" as const, opened_at: null };

  it("a first buy opens the position and spends cash plus commission", () => {
    const e = applyTrade(empty, { side: "BUY", shares: 10, price: 211.7, fxUsd: 1, commissionUsd: 25, date: "2026-10-23" }, 3);
    expect(e.patch).toMatchObject({ status: "held", shares: 10, avg_cost: 211.7, opened_at: "2026-10-23", stop_price: null });
    expect(e.cashDeltaUsd).toBeCloseTo(-2142, 6);
  });

  it("a second half averages the cost", () => {
    const e = applyTrade({ shares: 20, avg_cost: 64.85, status: "held", opened_at: "2026-10-23" }, { side: "BUY", shares: 20, price: 70, fxUsd: 1, commissionUsd: 25, date: "2026-10-30" }, 3);
    expect(e.patch.shares).toBe(40);
    expect(e.patch.avg_cost).toBe(67.425);
    expect(e.patch.opened_at).toBe("2026-10-23");
  });

  it("selling all closes the position, X4/X5 sales lock out re-buys for 3 months", () => {
    const e = applyTrade({ shares: 10, avg_cost: 100, status: "held", opened_at: "2026-10-23" }, { side: "SELL", shares: 10, price: 75, fxUsd: 1, commissionUsd: 25, date: "2026-11-30", sellReason: "X4" }, 3);
    expect(e.patch).toMatchObject({ status: "sold", shares: 0, lockout_until: "2027-02-28" });
    expect(e.realizedPnlUsd).toBe(-275);
    expect(e.cashDeltaUsd).toBe(725);
  });

  it("rejects impossible trades", () => {
    const held = { shares: 5, avg_cost: 10, status: "held" as const, opened_at: null };
    expect(() => applyTrade(held, { side: "SELL", shares: 6, price: 10, fxUsd: 1, commissionUsd: 0, date: "2026-10-23" }, 3)).toThrow("only 5 held");
    expect(() => applyTrade(held, { side: "BUY", shares: 1.5, price: 10, fxUsd: 1, commissionUsd: 0, date: "2026-10-23" }, 3)).toThrow("fractional");
    expect(() => applyTrade(held, { side: "BUY", shares: 1, price: 0, fxUsd: 1, commissionUsd: 0, date: "2026-10-23" }, 3)).toThrow();
  });
});

describe("tasks", () => {
  it("rolls recurring tasks forward past today", () => {
    expect(nextDueDate("2026-10-26", "weekly", "2026-10-28")).toBe("2026-11-02");
    expect(nextDueDate("2026-10-28", "daily", "2026-10-28")).toBe("2026-10-29");
    expect(nextDueDate("2026-01-31", "monthly", "2026-01-31")).toBe("2026-02-28");
    expect(nextDueDate("2026-10-01", "none", "2026-10-28")).toBeNull();
  });

  it("reminds about tasks due within 2 days, overdue, or everything on Mondays", () => {
    const t = { status: "todo" as const, due_date: "2026-10-30", last_reminded_on: null };
    expect(shouldRemind(t, "2026-10-28")).toBe(true); // Wednesday, due Friday
    expect(shouldRemind({ ...t, due_date: "2026-11-15" }, "2026-10-28")).toBe(false);
    expect(shouldRemind({ ...t, due_date: "2026-11-15" }, "2026-11-02")).toBe(true); // Monday
    expect(shouldRemind({ ...t, last_reminded_on: "2026-10-28" }, "2026-10-28")).toBe(false);
    expect(shouldRemind({ ...t, status: "done" }, "2026-10-28")).toBe(false);
    expect(shouldRemind({ ...t, due_date: null }, "2026-10-28")).toBe(false);
  });

  it("computes today in a time zone", () => {
    expect(todayIn("Asia/Kolkata", new Date("2026-10-28T21:30:00Z"))).toBe("2026-10-29");
    expect(todayIn("America/New_York", new Date("2026-10-28T21:30:00Z"))).toBe("2026-10-28");
  });
});

describe("WInS import", () => {
  it("parses numbers in common formats", () => {
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("(12.5)")).toBe(-12.5);
    expect(parseNumber("C$154.78")).toBe(154.78);
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });

  it("parses a CSV export and skips bonds and totals", () => {
    const csv = [
      "Symbol,Description,Quantity,Price Paid,Last Price,Currency",
      'MU,Micron Technology,2,"$885.10",$890.00,USD',
      "ATZ,Aritzia Inc,20,154.20,155.00,CAD",
      "912810TM0,US Treasury 4.75% 15-Feb-2037,38,965.00,970.00,USD",
      "Total,,,,,",
    ].join("\n");
    const r = parseWinsPositions(csv);
    expect(r.error).toBeNull();
    expect(r.rows.map((x) => [x.symbol, x.quantity, x.avgCost, x.currency])).toEqual([
      ["MU", 2, 885.1, "USD"],
      ["ATZ", 20, 154.2, "CAD"],
    ]);
    expect(r.skipped.some((s) => s.reason.startsWith("Bond"))).toBe(true);
  });

  it("parses a table copied from the web page (tabs) with total cost only", () => {
    const tsv = "Open Positions\nSymbol\tQty\tCost Basis\tMarket Value\nNVDA\t10\t$2,117.00\t$2,150.00\n";
    const r = parseWinsPositions(tsv);
    expect(r.rows[0]).toMatchObject({ symbol: "NVDA", quantity: 10, avgCost: 211.7 });
  });

  it("reports a missing header", () => {
    expect(parseWinsPositions("foo,bar\n1,2").error).toContain("header");
  });

  it("matches symbols with exchange suffixes", () => {
    const known = [
      { ticker: "ATZ", yahoo_symbol: "ATZ.TO" },
      { ticker: "6532", yahoo_symbol: "6532.T" },
    ];
    expect(matchTicker("ATZ.TO", known)).toBe("ATZ");
    expect(matchTicker("6532", known)).toBe("6532");
    expect(matchTicker("ATZ:CA", known)).toBe("ATZ");
    expect(matchTicker("ZZZ", known)).toBeNull();
  });
});

describe("seed from config/qvm_strategy.json", () => {
  const list = buildSeedInstruments(config as unknown as StrategyConfig);
  const by = (t: string) => list.find((i) => i.ticker === t)!;

  it("loads all 15 stocks, INDY, alternates and watchlist", () => {
    expect(list.filter((i) => i.kind === "stock" && (i.status === "held" || i.status === "pending"))).toHaveLength(15);
    expect(by("MU")).toMatchObject({ status: "held", shares: 2, avg_cost: 885.1, stop_pct: 30 });
    expect(by("INDY")).toMatchObject({ kind: "etf", status: "held", shares: 403 });
    expect(by("NVDA")).toMatchObject({ status: "pending", target_shares: 10, planned_date: "2026-10-23" });
    expect(by("EXEL").tranche).toContain("then 20 more on 2026-10-30");
    expect(by("ATZ").yahoo_symbol).toBe("ATZ.TO");
    expect(by("6532").yahoo_symbol).toBe("6532.T");
    expect(by("LUG")).toMatchObject({ yahoo_symbol: "LUG.TO", ccy: "CAD", status: "watchlist" });
    expect(by("NXT")).toMatchObject({ status: "alternate", ccy: "GBP" });
    expect(new Set(list.map((i) => i.ticker)).size).toBe(list.length);
  });

  it("parses earnings dates", () => {
    expect(parseEarnings("2026-10-29 (after close)")).toEqual({ date: "2026-10-29", note: "after close" });
    expect(parseEarnings("reported 2026-10-21")).toEqual({ date: null, note: "reported 2026-10-21" });
    expect(parseEarnings("2026-11-17")).toEqual({ date: "2026-11-17", note: null });
    expect(by("META").next_earnings).toBeNull();
  });

  it("builds the review-calendar tasks", () => {
    const t = buildSeedTasks("2026-10-28");
    expect(t.find((x) => x.recurrence === "weekly")!.due_date).toBe("2026-11-02");
    expect(t.find((x) => x.recurrence === "monthly")!.due_date).toBe("2026-11-01");
  });
});

describe("parameter guard", () => {
  it("refuses changes outside the allowed range", () => {
    expect(validateParamChange("riskPct", 1)).toBeNull();
    expect(validateParamChange("riskPct", 2)).toContain("at most 1.25");
    expect(validateParamChange("buyQvm", 50)).toContain("at least 55");
  });
});
