import "server-only";
import { db, must } from "./db";
import { buildState, ctxOf, INDEX_SYMBOL, loadSettings, normInstrument, normQuote, saveSetting, TREASURY_SYMBOL, type AppState } from "./data";
import { alertDigest, sendEmail, taskReminderEmail } from "./email";
import { computeIndicators } from "./indicators";
import { calendarHits, candidateHits, dedupeKey, evaluateCandidate, holdingHits, marketHits, ruleKey } from "./rules";
import { shouldRemind, todayIn } from "./tasks";
import type { AlertRow, Instrument, Quote, RuleHit, Severity, Task, TeamMember } from "./types";
import { fetchChart, fxSymbol } from "./yahoo";

export interface RunSummary {
  trigger: string;
  fetched: number;
  failed: Array<{ symbol: string; error: string }>;
  hits: number;
  newAlerts: number;
  resolved: number;
  emailed: { alerts: boolean | null; error?: string; recipients: number };
  taskReminders: number;
  light: string;
  durationMs: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Fetch prices for every tracked symbol and store them in `quotes`. */
export async function refreshQuotes(instruments: Instrument[], maDays: number): Promise<{ quotes: Record<string, Quote>; failed: RunSummary["failed"]; fetched: number }> {
  const tracked = instruments.filter((i) => i.status !== "sold");
  const ccys = new Set(tracked.map((i) => i.ccy.toUpperCase()));
  const symbols = new Set<string>([INDEX_SYMBOL, TREASURY_SYMBOL, ...tracked.map((i) => i.yahoo_symbol)]);
  for (const c of ccys) {
    const s = fxSymbol(c);
    if (s) symbols.add(s);
  }
  const existing = Object.fromEntries(
    (must(await db().from("quotes").select("*"), "Load quotes") as Record<string, unknown>[]).map((r) => [r.symbol as string, normQuote(r)]),
  ) as Record<string, Quote>;
  const failed: RunSummary["failed"] = [];
  let fetched = 0;
  const rows = await mapLimit([...symbols], 6, async (symbol): Promise<Quote | null> => {
    try {
      const chart = await fetchChart(symbol, "2y");
      const ind = computeIndicators(chart.closes, maDays);
      if (!ind) throw new Error("No closes");
      fetched++;
      const isAux = symbol.endsWith("=X") || symbol === TREASURY_SYMBOL;
      return {
        symbol,
        ...ind,
        currency: chart.currency,
        closes: isAux ? chart.closes.slice(-30) : chart.closes,
        error: null,
        fetched_at: new Date().toISOString(),
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      failed.push({ symbol, error });
      const old = existing[symbol];
      return old ? { ...old, error } : null;
    }
  });
  const valid = rows.filter((r): r is Quote => r !== null);
  if (valid.length) must(await db().from("quotes").upsert(valid), "Save quotes");
  const quotes = { ...existing };
  for (const q of valid) quotes[q.symbol] = q;
  return { quotes, failed, fetched };
}

export interface EvalOutput {
  hits: RuleHit[];
  verdicts: Record<string, string>;
  gapTickers: Set<string>;
}

export function evaluateAll(state: AppState): EvalOutput {
  const ctx = ctxOf(state);
  const spy = state.quotes[INDEX_SYMBOL];
  const hits: RuleHit[] = [...marketHits(state.market, spy, state.thresholds), ...calendarHits(state.today)];
  const held = state.instruments.filter((i) => i.status === "held");
  const pending = state.instruments.filter((i) => i.status === "pending");
  const book = { held, pending, quotes: state.quotes };
  const verdicts: Record<string, string> = {};
  const gapTickers = new Set<string>();
  for (const i of held) {
    const h = holdingHits(i, state.quotes[i.yahoo_symbol], ctx);
    if (h.some((x) => x.rule === "DATA_GAP")) gapTickers.add(i.ticker);
    hits.push(...h);
  }
  for (const i of state.instruments.filter((x) => x.status === "pending" || x.status === "watchlist" || x.status === "alternate")) {
    const res = evaluateCandidate(i, state.quotes[i.yahoo_symbol], ctx, book);
    verdicts[i.ticker] = res.verdict;
    hits.push(...candidateHits(i, res, ctx));
  }
  return { hits, verdicts, gapTickers };
}

/** Insert new alerts, refresh still-open ones, resolve cleared ones. Returns the newly created alerts. */
export async function syncAlerts(hits: RuleHit[], gapTickers: Set<string>, today: string): Promise<{ created: AlertRow[]; resolved: number }> {
  const open = must(await db().from("alerts").select("*").neq("status", "resolved"), "Load alerts") as AlertRow[];
  const openByKey = new Map<string, AlertRow>();
  for (const a of open) if (!openByKey.has(a.rule_key)) openByKey.set(a.rule_key, a);
  const nowIso = new Date().toISOString();
  const created: AlertRow[] = [];
  const seenStateKeys = new Set<string>();

  for (const h of hits) {
    const rk = ruleKey(h);
    if (h.kind === "state") {
      seenStateKeys.add(rk);
      const existing = openByKey.get(rk);
      if (existing) {
        must(await db().from("alerts").update({ last_seen_at: nowIso, title: h.title, message: h.message, severity: h.severity }).eq("id", existing.id), "Update alert");
        continue;
      }
    }
    const dk = h.kind === "state" ? `${dedupeKey(h, today)}#${Date.now()}` : dedupeKey(h, today);
    const res = await db()
      .from("alerts")
      .upsert(
        { rule_key: rk, dedupe_key: dk, ticker: h.ticker, rule: h.rule, severity: h.severity, title: h.title, message: h.message, status: "open", last_seen_at: nowIso },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("*");
    const rows = must(res, "Insert alert") as AlertRow[];
    created.push(...rows);
  }

  // Resolve state alerts whose condition no longer holds (but not for tickers whose data failed this run).
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const toResolve = open.filter((a) => {
    const isState = a.dedupe_key.includes("#");
    if (!isState) return a.created_at < weekAgo; // events expire after a week
    if (seenStateKeys.has(a.rule_key)) return false;
    return !(a.ticker && gapTickers.has(a.ticker) && a.rule !== "DATA_GAP");
  });
  if (toResolve.length) {
    must(
      await db().from("alerts").update({ status: "resolved", resolved_at: nowIso }).in("id", toResolve.map((a) => a.id)),
      "Resolve alerts",
    );
  }
  return { created, resolved: toResolve.length };
}

export async function emailAlerts(alerts: AlertRow[], severities: Severity[]): Promise<RunSummary["emailed"]> {
  const toSend = alerts.filter((a) => severities.includes(a.severity));
  if (!toSend.length) return { alerts: null, recipients: 0 };
  const members = must(await db().from("team_members").select("*").eq("active", true).eq("notify_alerts", true), "Load team") as TeamMember[];
  if (!members.length) return { alerts: false, error: "No team members to email", recipients: 0 };
  const { subject, html, text } = alertDigest(toSend);
  const res = await sendEmail(members.map((m) => m.email), subject, html, text, "alerts");
  if (res.ok) must(await db().from("alerts").update({ emailed: true }).in("id", toSend.map((a) => a.id)), "Mark emailed");
  return { alerts: res.ok, error: res.error, recipients: members.length };
}

export async function sendTaskReminders(teamTz: string): Promise<number> {
  const today = todayIn(teamTz);
  const members = must(await db().from("team_members").select("*").eq("active", true).eq("notify_tasks", true), "Load team") as TeamMember[];
  const tasks = must(await db().from("tasks").select("*").neq("status", "done"), "Load tasks") as Task[];
  let sent = 0;
  for (const m of members) {
    const mine = tasks.filter((t) => t.assignee_id === m.id && shouldRemind(t, today));
    if (!mine.length) continue;
    mine.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    const { subject, html, text } = taskReminderEmail(m, mine, today);
    const res = await sendEmail([m.email], subject, html, text, "task_reminder");
    if (res.ok) {
      sent++;
      must(await db().from("tasks").update({ last_reminded_on: today }).in("id", mine.map((t) => t.id)), "Mark reminded");
    }
  }
  return sent;
}

export async function runDailyCheck(trigger: string, opts: { email?: boolean; reminders?: boolean } = {}): Promise<RunSummary> {
  const started = Date.now();
  const runRow = must(await db().from("runs").insert({ trigger }).select("id").single(), "Start run") as { id: number };
  try {
    const settings = await loadSettings();
    const instruments = (must(await db().from("instruments").select("*"), "Load instruments") as Record<string, unknown>[]).map(normInstrument);
    const maDays = (settings.params as { maDays?: number } | undefined)?.maDays ?? 200;
    const { quotes, failed, fetched } = await refreshQuotes(instruments, maDays);

    // Instruments not yet held take their currency from the quote (held ones keep the WInS currency).
    for (const i of instruments) {
      const q = quotes[i.yahoo_symbol];
      if (q && i.status !== "held" && q.currency && q.currency !== i.ccy) {
        must(await db().from("instruments").update({ ccy: q.currency }).eq("ticker", i.ticker), "Update currency");
        i.ccy = q.currency;
      }
    }

    const state = buildState(settings, instruments, quotes);
    const { hits, verdicts, gapTickers } = evaluateAll(state);
    for (const [ticker, verdict] of Object.entries(verdicts)) {
      const inst = instruments.find((i) => i.ticker === ticker);
      if (inst && inst.last_verdict !== verdict) must(await db().from("instruments").update({ last_verdict: verdict }).eq("ticker", ticker), "Save verdict");
    }
    const { created, resolved } = await syncAlerts(hits, gapTickers, state.today);

    const severities = (Array.isArray(settings.email_severities) ? settings.email_severities : ["EXIT", "RECHECK", "NEW_TRADE", "INFO"]) as Severity[];
    // Email every open alert not emailed yet (new ones, and ones from runs where email failed or nobody was on the team).
    const unsent = opts.email === false ? [] : (must(await db().from("alerts").select("*").eq("status", "open").eq("emailed", false), "Load unsent alerts") as AlertRow[]);
    const emailed = opts.email === false ? { alerts: null, recipients: 0 } : await emailAlerts(unsent, severities);
    const taskReminders = opts.reminders === false ? 0 : await sendTaskReminders(state.teamTz);

    await saveSetting("market", {
      ...state.market,
      treasury_yield: state.market.treasury_yield,
      checked_at: new Date().toISOString(),
    });
    must(
      await db().from("portfolio_history").upsert({
        date: state.today,
        growth_usd: Math.round(state.growthUsd * 100) / 100,
        stocks_usd: Math.round(state.stocksUsd * 100) / 100,
        etf_usd: Math.round(state.etfUsd * 100) / 100,
        cash_usd: Math.round(state.cashUsd * 100) / 100,
        unrealized_pnl_usd: Math.round(state.unrealizedUsd * 100) / 100,
      }),
      "Save history",
    );

    const summary: RunSummary = {
      trigger,
      fetched,
      failed,
      hits: hits.length,
      newAlerts: created.length,
      resolved,
      emailed,
      taskReminders,
      light: state.market.light,
      durationMs: Date.now() - started,
    };
    await db().from("runs").update({ finished_at: new Date().toISOString(), ok: true, summary }).eq("id", runRow.id);
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db().from("runs").update({ finished_at: new Date().toISOString(), ok: false, summary: { error: message } }).eq("id", runRow.id);
    throw e;
  }
}
