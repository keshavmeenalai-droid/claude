# QVM Compass — Strategy and Terminal Build Spec

Client: Laura Gao · Platform: WInS (StockTrak) · As of 23 Oct 2026, 14:15 New York time

Machine-readable version of everything below: `config/qvm_strategy.json`. Where this document and the config differ, the config wins.

---

## 1. The plan in five lines

1. Laura's money is split by job. **Safe money** (US Treasury bonds) pays ten $50,000 operating payments, Jan 2033 to Jan 2042. **Growth money** builds the facility contribution due Jan 2033.
2. Safe money is never used to buy stocks and is held to maturity.
3. Growth money holds only three things: the iShares India 50 ETF (INDY), individual stocks chosen by the QVM rules, and cash. No other funds.
4. Stocks are screened, scored (Quality 40%, Value 30%, Momentum 30%), bought only when four entry rules pass, sized so one stock risks 1.25% of the growth bucket, and sold only by written exit rules.
5. Risk falls on a fixed schedule: one-third of growth money moves to cash in Jan 2031, half the rest in Jan 2032.

---

## 2. Money map

| Bucket | Holds | Approx. value | Share of account |
|---|---|---|---|
| Operating reserve | 6 US Treasury bonds, maturing Feb 2036 – Nov 2041 | $245,000 | 82.5% |
| Growth: India | INDY (iShares India 50 ETF) | $16,660 | 5.6% |
| Growth: stocks | 15 QVM stocks (after all planned orders) | $33,370 | 11.2% |
| Growth: cash | Cash left after all orders | $1,800 | 0.6% |
| **Total** | | **≈ $297,000** (WInS showed $299,813 on 22 Oct) | |

Growth bucket (used for sizing) = INDY value + cash + stock positions at market = **$52,255** at sizing time.

Split of the growth bucket after all orders: INDY 32% · stocks 64% · cash 4%.

---

## 3. Amounts invested and still to invest

### 3.1 Already held

| Holding | Quantity | Value / cost | Note |
|---|---|---|---|
| Treasury ladder | 6 bonds | ≈ $245,000 | Load exact bonds and quantities from WInS Open Positions |
| INDY | confirm in WInS | ≈ $16,660 at $41.34 | |
| MU (Micron) | 2 shares | ≈ $1,770 at $885.10 | Confirm actual fill price |

Cash before the stock orders: **$35,595.62**. After MU: ≈ $33,800.

### 3.2 Pending orders

Reference prices: 23 Oct 2026 (US/Toronto at 14:15 ET; Tokyo, Stockholm, Oslo at the 23 Oct close). Recompute shares if the live price is more than 2% above the reference.

| Date | Session | Ticker | Exchange | Shares | Order | Ref. price | ≈ USD | Stop | Tranche |
|---|---|---|---|---|---|---|---|---|---|
| 23 Oct | US, before 15:45 ET | NVDA | Nasdaq | 10 | Market | $211.70 | 2,117 | 30% | full |
| 23 Oct | US | ADBE | Nasdaq | 8 | Market | $265.20 | 2,122 | 30% | full |
| 23 Oct | US | ULTA | Nasdaq | 4 | Market | $620.27 | 2,481 | 25% | full |
| 23 Oct | US | APA | Nasdaq | 42 | Market | $51.74 | 2,173 | 30% | full |
| 23 Oct | US | META | Nasdaq | 3 | Market | $644.61 | 1,934 | 30% | full, only if price > MA200 |
| 23 Oct | US | INCY | Nasdaq | 11 | Market | $115.65 | 1,272 | 25% | 1 of 2 |
| 23 Oct | US | EXEL | Nasdaq | 20 | Market | $64.85 | 1,297 | 25% | 1 of 2 |
| 23 Oct | US | PAYC | NYSE | 8 | Market | $274.97 | 2,200 | 30% | full |
| 23 Oct | US | CF | NYSE | 18 | Market | $121.46 | 2,186 | 30% | full |
| 23 Oct | US | MSCI | NYSE | 4 | Market | $614.39 | 2,458 | 25% | full |
| 23 Oct | Toronto | ATZ | TSX | 20 | Market | C$154.78 | 2,211 | 30% | full |
| 26 Oct | Tokyo, after 09:30 JST | 6532 | TSE | 30 | Limit at ask | ¥11,500 | 2,199 | 30% | full |
| 26 Oct | Stockholm, after 09:30 CET | EVO | Nasdaq Stockholm | 26 | Limit at ask | SEK 841.40 | 2,201 | 30% | full |
| 26 Oct | Oslo, after 09:30 CET | VAR | Oslo Børs | 345 | Limit at ask | NOK 58.94 | 2,179 | 30% | full |
| 30 Oct | US, after 10:00 ET | INCY | Nasdaq | 11 | Market | $115.65 | 1,272 | 25% | 2 of 2, after 29 Oct results |
| 30 Oct | US, after 10:00 ET | EXEL | Nasdaq | 20 | Market | $64.85 | 1,297 | 25% | 2 of 2, after 29 Oct results |

### 3.3 Cash plan

| Step | Stocks | Commissions | Cash left |
|---|---|---|---|
| Start | | | $35,595.62 |
| MU (done) | ≈ $1,770 | $25 | ≈ $33,800 |
| 23 Oct, 11 orders | ≈ $22,450 | $275 | ≈ $11,075 |
| 26 Oct, 3 orders | ≈ $6,579 | $75 | ≈ $4,420 |
| 30 Oct, 2 orders | ≈ $2,569 | $50 | **≈ $1,800** |

Trades: 7 used before stocks + 17 stock orders = 24 of 200. Stop orders count only if they execute (confirm in WInS).

---

## 4. Diversification

### 4.1 By sector (share of stock money)

| Sector | Stocks | Share | Limit |
|---|---|---|---|
| Consumer Discretionary | ATZ, EVO, ULTA | 20.7% | ≤ 30% |
| Information Technology | MU, NVDA, ADBE | 18.0% | ≤ 30% |
| Health Care | INCY, EXEL | 15.4% | ≤ 30% |
| Industrials | PAYC, 6532 | 13.2% | ≤ 30% |
| Energy | APA, VAR | 13.0% | ≤ 30% |
| Financials | MSCI | 7.4% | ≤ 30% |
| Materials | CF | 6.6% | ≤ 30% |
| Communication Services | META | 5.8% | ≤ 30% |

### 4.2 By country

| Country | Stocks |
|---|---|
| United States | 11 |
| Canada | 1 (ATZ) |
| Sweden | 1 (EVO) |
| Norway | 1 (VAR) |
| Japan | 1 (6532) |
| India | 50 companies through INDY |

### 4.3 Industry and theme limits (status)

- Max 2 stocks per industry. At the limit: Semiconductors (MU, NVDA), Biotechnology (INCY, EXEL), Oil & Gas E&P (APA, VAR), Professional Services (PAYC, 6532).
- Max 3 stocks per theme. AI theme: MU, NVDA, META = 3 (at the limit).
- Max 6% of the growth bucket per stock at cost. Largest: EXEL ≈ 5.0%.

---

## 5. Rules

### 5.1 Universe

- Every company with market value ≥ $10B (USD) listed on an exchange WInS allows (41 per Session Rules), excluding Moscow.
- One line per company: its home listing; use the US ADR if the home exchange is not on WInS.
- Common stock and depositary receipts only.
- Excluded: banks, insurers, REITs, consumer lenders, brokers; leveraged/inverse products, SPACs, OTC listings, anything WInS restricts.
- Minimum share price $3 (WInS rule; see open decision D4).

### 5.2 Quality gate (all five must pass)

| Gate | Test |
|---|---|
| G1 Investable | Market cap ≥ $10B, price ≥ $3, ≥ 5 years of statements, not excluded |
| G2 Profitable | ROIC (TTM; last FY if blank) ≥ 10% AND net income > 0 in ≥ 4 of last 5 fiscal years |
| G3 Solvent | Operating income ÷ interest (last FY) ≥ 8×; if blank, debt ÷ EBITDA ≤ 1.5 |
| G4 Cash-generative | Free cash flow > 0 in ≥ 4 of last 5 fiscal years |
| G5 Growing | 5-year revenue CAGR ≥ 0% in the company's own currency |

**No data, no trade:** a blank or unverifiable gate input fails the gate.

### 5.3 Scoring (pool = all gate-passing companies on the run date)

| ID | Pillar | Metric | Formula | Better |
|---|---|---|---|---|
| Q1 | Quality | ROIC | ROIC TTM (last FY if blank) | Higher |
| Q2 | Quality | Gross profitability | gross margin % × asset turnover ÷ 100 | Higher |
| Q3 | Quality | Revenue growth 5y | 5-year revenue CAGR in USD | Higher |
| V1 | Value | FCF yield | 100 ÷ (price ÷ FCF per share) | Higher |
| V2 | Value | Earnings yield | 100 ÷ P/E | Higher |
| V3 | Value | P/E position | (P/E − 5y min) ÷ (5y max − 5y min) | Lower |
| M1 | Momentum | 12-1 momentum | ((1 + 52-week return) ÷ (1 + 30-day return) − 1) × 100, in USD | Higher |
| M2 | Momentum | Trend strength | (price ÷ 200-day average − 1) × 100 | Higher |

- **Percentile** each metric 0–100 across the pool (ties share the average rank). For "lower is better" use 100 − rank. Blank metrics are skipped, never filled.
- **Pillar score** = mean of that pillar's available percentiles.
- **QVM** = 0.40 × Q + 0.30 × V + 0.30 × M.
- **Expected return** (%) = FCF yield + clamp(min(3y revenue growth, 5y revenue growth), 0, 10), all in USD.
- **Hurdle** = US 10-year Treasury yield + 3.5 points (5.13% + 3.5 = 8.63% on 23 Oct).
- **Volatility** = standard deviation of 60 monthly returns. Volatile if > 0.10.

### 5.4 Entry rules (all four must pass on the order day)

| Rule | Test | If it fails |
|---|---|---|
| E1 Score | QVM ≥ 60 and every pillar ≥ 25 | Not now; re-score next quarter |
| E2 Price | Expected return ≥ hurdle | Reject: too expensive |
| E3 Trend | Price > 200-day average | Watchlist; buy when it closes back above |
| E4 Market | Market light not RED | YELLOW = half size (Phase 2: no entries); RED = no entries |

### 5.5 Position sizing

```
risk_usd      = growth_bucket_value × 1.25%          (= $653 at $52,255)
position_usd  = risk_usd ÷ stop_pct                  (25% → $2,613 ; 30% → $2,177)
shares        = round(position_usd ÷ price_in_usd)   (whole shares only)
YELLOW light  → position_usd × 0.5
Cap           → position at cost ≤ 6% of growth bucket
```

- **Earnings rule:** if the company reports within 5 trading days, buy half now. Buy the second half on max(first trading day after the report, 5 trading days after the first half), only if E1–E4 still pass and no thesis breaker fired.
- **Adding** to a position counts as a new entry (E1–E4 again). Never add below the 200-day average.

### 5.6 Execution

| Item | Rule |
|---|---|
| US / Canada buys | Market order, regular hours, not in the first 30 minutes, at least 15 minutes before the close |
| Foreign buys | Limit order at the current WInS ask, Day, after the first 30 minutes of that exchange |
| Price drift | If price > 2% above reference, recompute shares first |
| Stop order | Right after each fill: SELL (never Sell Short), type STOP, all shares, stop = fill × (1 − stop %), GTC |
| After 2nd tranche | Cancel the old stop; new stop for all shares at average cost × (1 − stop %) |
| Not used | Stop-limit, trailing stop |
| Trading note | Required on every trade, ≤ 300 characters, no expected-return figures. Template: `BUY {shares} {ticker}: QVM {qvm} (Q{q}/V{v}/M{m}). {why}. Grows Laura's facility money. Stop order {stop}% below cost. Sell if {thesis breaker}.` |

### 5.7 Exit rules (any one triggers)

| Rule | Trigger | Action |
|---|---|---|
| X1 Thesis break | A thesis breaker for that stock fires (table 7.2) | Sell all within 5 trading days |
| X2 Score decay | QVM < 35 at quarterly re-score (35–60 = hold, no adds) | Sell all |
| X3 Valuation | Expected return < Treasury + 1 pt / < Treasury | Sell half / sell all |
| X4 Hard stop | Standing stop order 25% (30% volatile) below average cost | Automatic sell |
| X5 Trend break | Month-end close < 200-day average AND 12-1 momentum < 0 | Sell half; still true next month-end → sell rest |
| X6 Too big | Position > 8% of growth bucket | Trim to 6% |
| X7 Better idea | New stock passes E1–E4 and scores ≥ 15 points above weakest holding | Swap (max 2 per quarter) |
| X8 Timeline | Glide-path date or Phase-2 RED | Trim lowest-QVM first; proceeds to SGOV |
| Re-buy lockout | Sold under X4 or X5 | Re-buy only after 3 months and only if E1–E4 pass |

**Not reasons to sell:** a bad day or week, a headline that is not a thesis breaker, other teams' picks, "feels expensive" without X3.

### 5.8 Market light (S&P 500 via SPY)

| Light | Condition | Phase 1 (now – Dec 2030) | Phase 2 (Jan 2031 – Dec 2032) |
|---|---|---|---|
| GREEN | SPY close > 200-day average | Normal entries | Normal entries |
| YELLOW | A daily close below, not yet confirmed at month-end | New entries at half size | No new entries |
| RED | Month-end close below 200-day average | No new stock entries | Cut stock sleeve 50% (weakest QVM first) into SGOV; rebuy after one month-end back above |

23 Oct 2026: **GREEN** (SPY $760.89 vs 200-day $726.65).

---

## 6. Parameters

Change only at the January review, inside the allowed range, with a change-log entry (date, old → new, reason, approver). Never to rescue a position.

| ID | Parameter | Value now | Allowed range | Changed |
|---|---|---|---|---|
| P1 | Minimum market value | $10B | $5–20B | |
| P2 | Minimum ROIC | 10% | 8–12% | |
| P3 | Minimum interest cover | 8× (fallback debt/EBITDA ≤ 1.5) | 5–10× | |
| P4 | Pillar weights Q / V / M | 40 / 30 / 30 | each 20–50 | |
| P5 | Buy score | QVM ≥ 60, every pillar ≥ 25 | 55–70 / 20–30 | |
| P6 | Sell score | QVM < 35 | 30–40 | |
| P7 | Equity premium in hurdle | 3.5 pts over 10y Treasury | 3–5 pts | |
| P8 | Growth cap in expected return | 10% | 8–12% | |
| P9 | Trend filter | 200-day average | 150–250 days | |
| P10 | Risk per stock | **1.25%** of growth bucket | 0.75–1.25% | 23 Oct 2026, from 1% |
| P11 | Hard stop | 25%; 30% if monthly SD > 0.10 | 20–35% | |
| P12 | Position cap / trim | 6% at cost / trim above 8% | 5–10% | |
| P13 | Concentration | Sector ≤ 30%; ≤ 2 per industry; ≤ 3 per theme | 25–35% | |
| P14 | Number of stocks | **15** | 6–20 | 23 Oct 2026, from 10 |
| P15 | Swap margin | +15 points; max 2 swaps a quarter | 10–20 | |
| P16 | Valuation exit | Treasury + 1 pt (half) / Treasury (all) | 0–2 pts | |
| P17 | Phase 2 start | Jan 2031 | fixed | |
| P18 | Phase-2 RED cut | 50% of the sleeve | 33–100% | |
| — | Growth bucket instruments | INDY + individual stocks + cash only | — | 23 Oct 2026 |
| — | Commission | $25 per trade | WInS | |

---

## 7. Stock master data

### 7.1 Scores and settings

| Ticker | Name | Exchange | Ccy | Sector | Industry | QVM | Q | V | M | Exp. ret. | Monthly SD | Stop | Target shares | Next earnings |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MU | Micron Technology | Nasdaq | USD | IT | Semiconductors | 91.6 | 97 | 82 | 93 | 15.8% | 0.196 | 30% | 2 | 23 Dec 2026 (est.) |
| EXEL | Exelixis | Nasdaq | USD | Health Care | Biotechnology | 86.2 | 91 | 78 | 88 | 17.0% | 0.093 | 25% | 40 | 29 Oct 2026 (after close) |
| INCY | Incyte | Nasdaq | USD | Health Care | Biotechnology | 79.7 | 82 | 85 | 72 | 18.0% | 0.076 | 25% | 22 | 29 Oct 2026 (before open) |
| NVDA | NVIDIA | Nasdaq | USD | IT | Semiconductors | 73.6 | 100 | 51 | 62 | 12.5% | 0.145 | 30% | 10 | 17 Nov 2026 |
| VAR | Vår Energi | Oslo Børs | NOK | Energy | Oil & Gas E&P | 72.9 | 53 | 83 | 89 | 21.7% | 0.102 | 30% | 345 | reported 21 Oct |
| EVO | Evolution AB | Nasdaq Stockholm | SEK | Cons. Disc. | Casinos & Gaming | 71.9 | 63 | 77 | 79 | 18.2% | 0.103 | 30% | 26 | reported 23 Oct |
| ATZ | Aritzia | TSX | CAD | Cons. Disc. | Apparel Retail | 70.5 | 86 | 45 | 75 | 13.7% | 0.132 | 30% | 20 | 7 Jan 2027 (est.) |
| ADBE | Adobe | Nasdaq | USD | IT | Software | 69.6 | 84 | 87 | 33 | 20.1% | 0.113 | 30% | 8 | 9 Dec 2026 |
| ULTA | Ulta Beauty | Nasdaq | USD | Cons. Disc. | Specialty Retail | 68.2 | 81 | 57 | 62 | 10.9% | 0.094 | 25% | 4 | 3 Dec 2026 |
| PAYC | Paycom Software | NYSE | USD | Industrials | Professional Services | 67.9 | 73 | 53 | 76 | 14.5% | 0.131 | 30% | 8 | 4 Nov 2026 (after close) |
| APA | APA Corporation | Nasdaq | USD | Energy | Oil & Gas E&P | 65.9 | 46 | 65 | 93 | 11.4% | 0.126 | 30% | 42 | 4 Nov 2026 (after close) |
| CF | CF Industries | NYSE | USD | Materials | Chemicals (Fertilizers) | 65.7 | 52 | 82 | 67 | 10.3% | 0.104* | 30%* | 18* | 4 Nov 2026 |
| 6532 | BayCurrent | TSE | JPY | Industrials | Professional Services | 65.4 | 90 | 25 | 72 | 12.2% | 0.135 | 30% | 30 | 14 Jan 2027 (est.) |
| MSCI | MSCI Inc. | NYSE | USD | Financials | Financial Data | 62.3 | 78 | 51 | 52 | 13.5% | 0.078 | 25% | 4 | reported 20 Oct |
| META | Meta Platforms | Nasdaq | USD | Comm. Services | Interactive Media | 60.9 | 78 | 52 | 46 | 11.7% | 0.124 | 30% | 3 | reported 21 Oct |

\* CF volatility is borderline (estimated 0.104). If WInS shows ≤ 0.10, use a 25% stop and 21 shares.
Scores and expected returns come from the 23 Oct 2026 global run (457-company pool, hurdle 8.63%). The terminal must re-score on its own pool.

### 7.2 Thesis breakers (rule X1)

| Ticker | Sell if |
|---|---|
| MU | Revenue falls two quarters in a row; gross margin < 60%; guidance cut > 15% |
| EXEL | CABOMETYX revenue falls two quarters in a row; zanzalintinib fails Phase 3; US generics allowed before 2031 |
| INCY | Total revenue falls year on year; guidance cut; newer products stop growing |
| NVDA | Data-centre revenue falls quarter on quarter twice; gross margin < 65% |
| VAR | Dividend cut; 2026 output < 390,000 boe/d; FCF yield < 8% at a re-score |
| EVO | Revenue keeps falling year on year; EBITDA margin < 60% |
| ATZ | Fiscal 2027 revenue guidance cut below C$4.4B; a quarter grows < 10% |
| ADBE | Revenue growth < 5%; subscription revenue falls |
| ULTA | Comparable sales fall two quarters in a row |
| PAYC | Revenue growth < 7%; full-year guidance cut |
| APA | Realised US oil < $65/bbl; debt > 1.5× EBITDA; dividend cut |
| CF | Free cash flow negative for two quarters; dividend cut |
| 6532 | Revenue growth < 10%; guidance cut |
| MSCI | Revenue falls year on year |
| META | Ad revenue falls year on year; free cash flow turns negative |

### 7.3 Alternates and watchlist

Alternates (use if a pick fails its order-day check): WuXi AppTec (603259, Shanghai, 72.6) · Zoom (ZM, 68.5) · Next plc (NXT, London, 67.9) · Wolters Kluwer (WKL, Amsterdam, 61.4; BayCurrent's replacement if Tokyo odd lots are refused) · Aena (AENA, Madrid, 60.0). Halozyme (HALO, 71.4) would break the 2-per-industry biotech limit.

Watchlist (fail only E3, the trend rule): HMY 72.2 · AU 71.8 · LUG 71.5 · Samsung 005930 66.7 · NBIX 64.7 · GOOG 64.5 · Kweichow Moutai 600519 64.2.

---

## 8. Future plan

### 8.1 January 2028: $150,000 arrives (outside WInS), applied in this order

| Step | Condition | Action | Base case |
|---|---|---|---|
| 1 | Always first | Complete the reserve: buy IBTO, IBTP, IBTQ (iShares iBonds Dec 2033 / 2034 / 2035 Treasury ETFs) for the 2034–2036 payments | $72,771 (IBTO 196, IBTP 1,394, IBTQ 1,478 shares); up to $93,930 if yields fall 4 points |
| 2 | Only if IBTM (Dec 2032 Treasury ETF) yields ≥ 4.5% | 40% of the remainder into IBTM as a floor for the facility contribution | $30,865 (1,422 shares) |
| 3 | Always | Remainder: 70% stocks (QVM rules), 30% INDY | $32,402 stocks + $13,887 INDY |

Base case = Treasury yields unchanged to Jan 2028.

### 8.2 Glide path and payments

| Date | Action |
|---|---|
| Jan 2031 | Laura gives co-sponsors her contribution range. Move one-third of stocks + INDY into SGOV |
| Jan 2032 | Move half of the remaining stocks + INDY into SGOV |
| Jan 2033 | Payment 1 + facility contribution. Keep a $50,000 flexibility buffer invested |
| Jan 2034 – Jan 2042 | One $50,000 payment each January from maturing bonds and bond funds |

Payment funding: 2033 and part of 2034 from bond interest saved in SGOV; 2034–2036 from IBTO / IBTP / IBTQ (bought 2028); 2037–2042 from the 6 Treasury bonds.

---

## 9. Review calendar

| When | Checks |
|---|---|
| Every Monday | Market light · any stock within 5% of its stop · news vs thesis breakers · earnings dates this week |
| First trading day of the month | Month-end market light · X5 trend check · weights vs X6 and sector caps |
| After each earnings season (Feb, May, Aug, Nov) | Full re-score · update thesis cards · X2, X3, X7 decisions |
| Every January | Parameter review and change log · glide-path rebalance · post-mortem |

---

## 10. What the terminal must do

| Module | Inputs | Does | Outputs / alerts |
|---|---|---|---|
| Data feed | Prices, 200-day averages, 52-week and 30-day returns, fundamentals (ROIC, margins, FCF, P/E history, revenue history, interest cover, debt/EBITDA), FX, 10y Treasury, SPY | Refresh daily; convert to USD | Data-gap flags ("no data, no trade") |
| Screener + gate | Universe rules, G1–G5 | Filter the universe | Pass/fail per gate per company |
| Scorer | Gate-passing pool | Percentiles, pillars, QVM, expected return, volatility class | Ranked table |
| Entry checker | Scores, price, MA200, market light | E1–E4 | BUY / WAIT / REJECT / WATCHLIST with the failing rule |
| Sizer | Growth bucket value, stop %, price, light, earnings date | Shares per sizing rules | Order ticket (shares, type, limit, tranche) |
| Limits monitor | Positions, sectors, industries, themes | P12, P13, P14 checks before every order | Block order if a limit would break |
| Order + note builder | Ticket, stock data | Trading note ≤ 300 chars from template | Note text; stop price after fill |
| Stop manager | Fills, average cost | Stop price; replace after 2nd tranche | "Place / replace stop" tasks |
| Exit monitor | Live data, thesis breakers, scores | X1–X8 daily; X5 at month-end; X2/X3/X7 quarterly | Sell alerts with rule ID |
| Market light | SPY vs MA200 daily and month-end | GREEN / YELLOW / RED; Phase 1 vs 2 | Light state; entry restrictions |
| Calendar | Dates in sections 8–9 | Reminders | Weekly, monthly, quarterly, January, 2028, 2031, 2032, 2033 tasks |
| Change log | Parameter edits | Enforce allowed ranges and January-only changes | Log: date, parameter, old → new, reason, approver |

---

## 11. Open decisions

| ID | Topic | Options | Terminal default |
|---|---|---|---|
| D1 | Money the rules can't place (< 15 qualifiers, or RED light) | Hold cash · add to INDY up to one-third of the growth bucket | Hold cash |
| D2 | Stop style | Fixed at cost (current) · quarterly ratchet (raise to 25/30% below price each quarter, never lower) · trailing | Fixed at cost |
| D3 | 2033–2036 payments | Saved interest + IBTO/IBTP/IBTQ (planning model) · Treasuries maturing Feb 2031 | Planning model |
| D4 | Minimum share price | $3 (Session Rules) · $5 (weekly emails) | $3 |
| D5 | Bond ladder detail | Load the 6 bonds and quantities from WInS | Load from WInS |
