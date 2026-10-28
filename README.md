# Northgate AlertGuard

A tracker and alert site for the QVM Compass strategy on WInS (StockTrak). It holds the team's positions, checks prices every day against the written rules, and emails every team member when a stock needs a re-check, an exit, or when a new trade passes the entry rules. It also handles team members and recurring tasks.

Built with Next.js 15 (App Router), Supabase (Postgres) and Vercel Cron. The strategy comes from `config/qvm_strategy.json` (the same content as `QVM_Compass_Strategy_Reference.pdf`).

## What it does

| Area | What you get |
|---|---|
| **Dashboard** | Growth money, unrealised P&L, market light, hurdle, action board of open alerts, allocation donut, value history, P&L bars, sector exposure vs the 30% limit |
| **Daily check** (Vercel Cron, 21:30 UTC, after the US close) | Fetches 2 years of daily closes for every holding, order, watchlist name, SPY, the 10-year yield (^TNX) and FX. Computes the 200-day average, 12-1 momentum and month-end values, runs every rule, opens or resolves alerts, emails the team, sends task reminders |
| **Exit alerts** | X1 thesis break (team marks it) · X2 QVM below 35 · X3 valuation vs Treasury · X4 hard stop hit · X5 month-end trend break (sell half, then the rest) · X6 position above 8% → trim to 6% · Phase-2 RED · glide-path dates |
| **Re-check alerts** | Daily dip ≥ 4% · ≥ 10% below cost · within 5% of the stop · below the 200-day average · stop order not yet placed · planned order that no longer passes · market light YELLOW/RED · data gaps |
| **New-trade alerts** | Planned order or watchlist stock where E1–E4, limits and lockout all pass, with shares sized at 1.25% risk, the stop price, half-tranche before results, YELLOW half size, >2% price-drift recompute · X7 swap ideas · watchlist names crossing back above the 200-day average |
| **Positions** | Per-stock page: price chart with 200-day average, cost and stop lines; thesis card and sell triggers; edit stop/scores/earnings; record fills and sales (updates average cost, cash, re-buy lockout); trade and alert history |
| **Trades & WInS import** | Paste the WInS *Open Positions* table (or its CSV export) to sync shares and average cost in one go; bonds and cash lines are skipped |
| **Team & tasks** | Add members (all active members get alert emails), assign tasks with due dates and daily/weekly/monthly repeats, Kanban board, email on assignment, daily reminders when due within 2 days or overdue, Monday summary |
| **Strategy** | Parameters with allowed ranges, change log with reason + approver, alert thresholds, exit-rule reference, Treasury ladder |

Alerts are de-duplicated: a condition alert (e.g. "near stop") stays open while the condition holds and closes itself when it clears; it is emailed once, not every day. Event alerts (a daily dip, a month-end X5) fire once per event.

### About WInS data

WInS/StockTrak has no public API, so AlertGuard does not log in to it or scrape it. Instead:

- **Prices** come automatically every day from Yahoo Finance (no key needed). Tickers are mapped to Yahoo symbols from the exchange (`ATZ` → `ATZ.TO`, `6532` → `6532.T`, `EVO` → `EVO.ST`, `VAR` → `VAR.OL`); you can fix any symbol on its position page.
- **Positions** come from the team: record each fill on the site, or paste WInS *Open Positions* on the Trades page whenever you want to sync.

## Setup (about 15 minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole of `supabase/migrations/0001_init.sql`, and run it.
3. From **Project Settings → API** copy the **Project URL** and the **service_role** key.

Row Level Security is on for every table with no policies, so the public anon key can read nothing. Only the server, using the service-role key, touches the database.

### 2. Email

Pick one:

- **Gmail (simplest, sends to anyone):** on the team Gmail account turn on 2-Step Verification, create an **App password** (Google Account → Security → App passwords), then set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=<the gmail>`, `SMTP_PASS=<app password>`.
- **Resend:** set `RESEND_API_KEY`. Without a verified domain Resend only delivers to the account owner, so verify a domain to reach all five members.

### 3. Vercel

1. Import this repository in [vercel.com/new](https://vercel.com/new) (framework: Next.js, no build changes).
2. Add the environment variables from `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD`, `CRON_SECRET` (any long random string), the email variables, and `APP_URL` (your Vercel URL).
3. Deploy. `vercel.json` registers the daily cron (`/api/cron/daily`, 21:30 UTC = 3:00 am IST, after the US close). Vercel sends `CRON_SECRET` with each call.

### 4. First run

1. Open the site and sign in with `APP_PASSWORD` (your name is shown on acknowledgements and trades).
2. Click **Load strategy**: loads the 15 stocks, INDY, the order plan, alternates, watchlist, parameters, Treasury ladder and review-calendar tasks.
3. **Team & tasks** → add the five members' emails.
4. **Trades & WInS import** → paste WInS Open Positions so shares and costs match what actually filled; set the cash balance.
5. Enter the stop price you placed in WInS on each position page (until you do, a "Place the stop order" re-check reminds you).
6. Click **Run check now**. From then on the check runs every day by itself.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

```bash
npm test          # rules engine, parsers, sizing, tasks (vitest)
npm run typecheck
npm run build
```

The daily check can also be triggered by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/daily`.

## Where the rules live

- `lib/rules.ts`: market light, exit rules, entry checker (E1–E4, limits, lockout), sizing
- `lib/indicators.ts`: moving average, returns, 12-1 momentum, month-end snapshots
- `lib/daily.ts`: the daily check (fetch → evaluate → alerts → email → reminders)
- `lib/params.ts`: parameter defaults and allowed ranges (section 6 of the strategy)
- `lib/seed.ts`: loads `config/qvm_strategy.json`
- `tests/`: unit tests, including the strategy's own sizing examples (NVDA 10 shares, ULTA 4, VAR 345)

Rules that need judgement or fundamentals (X1 sell triggers, X2/X3 re-scores) are entered by the team: mark a thesis break or enter new scores on the position page, and the next check raises the alert.
