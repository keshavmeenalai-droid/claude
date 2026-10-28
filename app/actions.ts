"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import config from "@/config/qvm_strategy.json";
import { checkPassword, isValidSession, MEMBER_COOKIE, SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { runDailyCheck } from "@/lib/daily";
import { DEFAULT_FX, loadSettings, loadState, normInstrument, saveSetting } from "@/lib/data";
import { db, must } from "@/lib/db";
import { esc, sendEmail, taskAssignedEmail } from "@/lib/email";
import { mergeParams, mergeThresholds, PARAM_META, validateParamChange } from "@/lib/params";
import { applyTrade } from "@/lib/portfolio";
import { fxRate } from "@/lib/rules";
import { buildSeedInstruments, buildSeedTasks, type StrategyConfig } from "@/lib/seed";
import { nextDueDate, todayIn } from "@/lib/tasks";
import type { Recurrence, Severity, Task, TeamMember } from "@/lib/types";
import { matchTicker, parseWinsPositions, type ImportRow } from "@/lib/wins-import";
import { yahooSymbolFor } from "@/lib/yahoo";

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

const ok = (message: string, data?: unknown): ActionResult => ({ ok: true, message, data });
const fail = (message: string): ActionResult => ({ ok: false, message });

async function requireSession() {
  const jar = await cookies();
  if (!(await isValidSession(jar.get(SESSION_COOKIE)?.value))) throw new Error("Not signed in");
}

async function actor(): Promise<string> {
  const jar = await cookies();
  return jar.get(MEMBER_COOKIE)?.value || "team";
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optNum(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s === "") return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${key.replace(/_/g, " ")} must be a number`);
  return n;
}

function optDate(fd: FormData, key: string): string | null {
  const s = str(fd, key);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${key.replace(/_/g, " ")} must be a date (YYYY-MM-DD)`);
  return s;
}

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[A-Za-z]{2,}$/;

async function guard(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    await requireSession();
    return await fn();
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------- session

export async function login(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!process.env.APP_PASSWORD) return fail("APP_PASSWORD is not set on the server. Add it in Vercel → Settings → Environment Variables.");
  if (!(await checkPassword(str(fd, "password")))) return fail("Wrong password.");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sessionToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  const name = str(fd, "name");
  if (name) jar.set(MEMBER_COOKIE, name.slice(0, 60), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  const next = str(fd, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------------------------------------------------------------- setup / checks

export async function seedStrategy(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const replace = str(fd, "replace") === "yes";
    const existing = must(await db().from("instruments").select("ticker"), "Check instruments") as Array<{ ticker: string }>;
    if (existing.length && !replace) return fail("Instruments already exist. Tick “replace” to reload the strategy (this overwrites positions with the 23 Oct plan).");
    const cfg = config as unknown as StrategyConfig;
    const instruments = buildSeedInstruments(cfg);
    must(await db().from("instruments").upsert(instruments.map((i) => ({ ...i, updated_at: new Date().toISOString() }))), "Save instruments");
    const settings = await loadSettings();
    if (!("params" in settings) || replace) await saveSetting("params", mergeParams(settings.params));
    if (!("thresholds" in settings)) await saveSetting("thresholds", mergeThresholds(null));
    if (!("cash_usd" in settings) || replace) await saveSetting("cash_usd", cfg.cash_plan_usd.after_MU);
    if (!("fx_reference" in settings)) await saveSetting("fx_reference", DEFAULT_FX);
    if (!("market" in settings)) await saveSetting("market", { treasury_yield: cfg.live_inputs.us_10y_treasury_yield_pct.value });
    if (!("reserve" in settings) || replace) await saveSetting("reserve", cfg.bonds);
    if (!("team_timezone" in settings)) await saveSetting("team_timezone", "Asia/Kolkata");
    if (!("email_severities" in settings)) await saveSetting("email_severities", ["EXIT", "RECHECK", "NEW_TRADE", "INFO"]);
    const taskCount = must(await db().from("tasks").select("id"), "Check tasks") as unknown[];
    let tasksAdded = 0;
    if (!taskCount.length) {
      const tasks = buildSeedTasks(todayIn("Asia/Kolkata"));
      must(await db().from("tasks").insert(tasks), "Add tasks");
      tasksAdded = tasks.length;
    }
    revalidatePath("/", "layout");
    return ok(`Loaded ${instruments.length} instruments from the QVM Compass strategy${tasksAdded ? ` and ${tasksAdded} review tasks` : ""}. Now run the daily check to load prices.`);
  });
}

export async function runCheckNow(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const email = str(fd, "email") !== "no";
    const s = await runDailyCheck("manual", { email, reminders: false });
    revalidatePath("/", "layout");
    const failed = s.failed.length ? ` ${s.failed.length} symbol(s) failed: ${s.failed.map((f) => f.symbol).join(", ")}.` : "";
    const mail = s.emailed.alerts === true ? ` Emailed ${s.emailed.recipients} member(s).` : s.emailed.alerts === false ? ` Email not sent: ${s.emailed.error}.` : "";
    return ok(`Checked ${s.fetched} prices · ${s.newAlerts} new alert(s) · ${s.resolved} resolved · light ${s.light}.${failed}${mail}`);
  });
}

// ---------------------------------------------------------------- alerts

export async function setAlertStatus(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = Number(str(fd, "id"));
    const status = str(fd, "status");
    if (!Number.isInteger(id)) return fail("Bad alert id");
    if (status !== "acknowledged" && status !== "resolved" && status !== "open") return fail("Bad status");
    const patch: Record<string, unknown> = { status };
    if (status === "acknowledged") patch.acknowledged_by = await actor();
    if (status === "resolved") patch.resolved_at = new Date().toISOString();
    must(await db().from("alerts").update(patch).eq("id", id), "Update alert");
    revalidatePath("/", "layout");
    return ok(status === "acknowledged" ? "Acknowledged." : status === "resolved" ? "Resolved." : "Re-opened.");
  });
}

export async function acknowledgeAll(): Promise<ActionResult> {
  return guard(async () => {
    must(await db().from("alerts").update({ status: "acknowledged", acknowledged_by: await actor() }).eq("status", "open"), "Acknowledge all");
    revalidatePath("/", "layout");
    return ok("All open alerts acknowledged.");
  });
}

// ---------------------------------------------------------------- trades & positions

export async function recordTrade(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ticker = str(fd, "ticker").toUpperCase();
    const side = str(fd, "side") as "BUY" | "SELL";
    if (side !== "BUY" && side !== "SELL") return fail("Choose BUY or SELL.");
    const shares = optNum(fd, "shares");
    const price = optNum(fd, "price");
    const commission = optNum(fd, "commission") ?? 25;
    const date = optDate(fd, "date") ?? todayIn("America/New_York");
    if (shares === null || price === null) return fail("Enter shares and the fill price.");
    const state = await loadState();
    const inst = state.instruments.find((i) => i.ticker === ticker);
    if (!inst) return fail(`Unknown ticker ${ticker}. Add it on the Pipeline page first.`);
    const fx = fxRate(state.fx, inst.ccy);
    if (fx === null) return fail(`No FX rate for ${inst.ccy}. Run the daily check first.`);
    const sellReason = str(fd, "reason") || null;
    const effect = applyTrade(inst, { side, shares, price, fxUsd: fx, commissionUsd: commission, date, sellReason }, state.params.rebuyLockoutMonths);
    must(
      await db().from("trades").insert({
        ticker,
        side,
        shares,
        price,
        ccy: inst.ccy,
        fx_usd: fx,
        commission_usd: commission,
        realized_pnl_usd: effect.realizedPnlUsd,
        traded_at: date,
        note: [sellReason ? `Reason: ${sellReason}` : "", str(fd, "note")].filter(Boolean).join(" · ") || null,
        source: "manual",
        created_by: await actor(),
      }),
      "Save trade",
    );
    must(await db().from("instruments").update({ ...effect.patch, updated_at: new Date().toISOString() }).eq("ticker", ticker), "Update position");
    await saveSetting("cash_usd", Math.round((state.cashUsd + effect.cashDeltaUsd) * 100) / 100);
    revalidatePath("/", "layout");
    const stopHint =
      side === "BUY" && effect.patch.avg_cost
        ? ` Now place the stop in WInS: Sell · Stop · all ${effect.patch.shares} shares at ${inst.ccy} ${(effect.patch.avg_cost * (1 - inst.stop_pct / 100)).toFixed(2)} · GTC, then enter it on the position page.`
        : side === "SELL" && effect.patch.status !== "sold"
          ? " Replace the stop order for the remaining shares in WInS."
          : "";
    return ok(`${side} ${shares} ${ticker} @ ${inst.ccy} ${price} recorded. Cash ${effect.cashDeltaUsd >= 0 ? "+" : "−"}$${Math.abs(effect.cashDeltaUsd).toFixed(2)}.${stopHint}`);
  });
}

export async function updateInstrument(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ticker = str(fd, "ticker").toUpperCase();
    const before = must(await db().from("instruments").select("*").eq("ticker", ticker).maybeSingle(), "Load instrument");
    if (!before) return fail(`Unknown ticker ${ticker}`);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const texts = ["name", "yahoo_symbol", "exchange", "sector", "industry", "theme", "why", "notes", "earnings_note", "thesis_note", "tranche"];
    for (const k of texts) if (fd.has(k)) patch[k] = str(fd, k) || null;
    if (fd.has("yahoo_symbol") && !patch.yahoo_symbol) return fail("Yahoo symbol cannot be empty.");
    if (fd.has("ccy")) patch.ccy = (str(fd, "ccy") || "USD").toUpperCase();
    const nums = ["qvm", "q", "v", "m", "exp_return_pct", "monthly_sd", "stop_price", "target_shares", "ref_price", "shares", "avg_cost"];
    for (const k of nums) if (fd.has(k)) patch[k] = optNum(fd, k);
    if (fd.has("shares") && (patch.shares === null || (patch.shares as number) < 0)) patch.shares = 0;
    if (fd.has("stop_pct")) {
      const sp = optNum(fd, "stop_pct");
      if (sp === null || sp <= 0 || sp >= 100) return fail("Stop % must be between 0 and 100.");
      patch.stop_pct = sp;
    }
    for (const k of ["next_earnings", "lockout_until", "planned_date", "opened_at"]) if (fd.has(k)) patch[k] = optDate(fd, k);
    if (fd.has("thesis_breakers")) patch.thesis_breakers = str(fd, "thesis_breakers").split("\n").map((s) => s.trim()).filter(Boolean);
    if (fd.has("thesis_flag")) patch.thesis_broken = str(fd, "thesis_broken") === "on";
    if (fd.has("status")) {
      const s = str(fd, "status");
      if (!["held", "pending", "watchlist", "alternate", "sold"].includes(s)) return fail("Bad status");
      patch.status = s;
    }
    for (const k of ["q", "v", "m", "qvm"]) {
      const n = patch[k];
      if (typeof n === "number" && (n < 0 || n > 100)) return fail(`${k.toUpperCase()} must be between 0 and 100.`);
    }
    must(await db().from("instruments").update(patch).eq("ticker", ticker), "Save");
    revalidatePath("/", "layout");
    return ok(`${ticker} saved. Alerts update at the next check.`);
  });
}

export async function addInstrument(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ticker = str(fd, "ticker").toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9.\-]{1,15}$/.test(ticker)) return fail("Enter a valid ticker.");
    const exchange = str(fd, "exchange") || null;
    const status = str(fd, "status") || "watchlist";
    if (!["pending", "watchlist", "alternate"].includes(status)) return fail("Bad status");
    const row = {
      ticker,
      yahoo_symbol: str(fd, "yahoo_symbol").toUpperCase() || yahooSymbolFor(ticker, exchange),
      name: str(fd, "name") || null,
      exchange,
      ccy: (str(fd, "ccy") || "USD").toUpperCase(),
      sector: str(fd, "sector") || null,
      industry: str(fd, "industry") || null,
      theme: str(fd, "theme") || null,
      kind: str(fd, "kind") === "etf" ? "etf" : "stock",
      status,
      qvm: optNum(fd, "qvm"),
      q: optNum(fd, "q"),
      v: optNum(fd, "v"),
      m: optNum(fd, "m"),
      exp_return_pct: optNum(fd, "exp_return_pct"),
      monthly_sd: optNum(fd, "monthly_sd"),
      target_shares: optNum(fd, "target_shares"),
      ref_price: optNum(fd, "ref_price"),
      stop_pct: optNum(fd, "stop_pct") ?? 25,
      next_earnings: optDate(fd, "next_earnings"),
      thesis_breakers: str(fd, "thesis_breakers").split("\n").map((s) => s.trim()).filter(Boolean),
      why: str(fd, "why") || null,
    };
    const res = await db().from("instruments").insert(row);
    if (res.error) return fail(res.error.code === "23505" ? `${ticker} already exists.` : res.error.message);
    revalidatePath("/", "layout");
    return ok(`${ticker} added to the ${status === "pending" ? "order list" : status}. Run the check to load its price.`);
  });
}

export async function deleteInstrument(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const ticker = str(fd, "ticker").toUpperCase();
    const row = must(await db().from("instruments").select("status, shares").eq("ticker", ticker).maybeSingle(), "Load") as { status: string; shares: number } | null;
    if (!row) return fail("Not found");
    if (row.status === "held" && Number(row.shares) > 0) return fail("Sell the position (record a SELL) before removing it.");
    must(await db().from("instruments").delete().eq("ticker", ticker), "Delete");
    revalidatePath("/", "layout");
    return ok(`${ticker} removed.`);
  });
}

export async function setCash(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const cash = optNum(fd, "cash");
    if (cash === null || cash < 0) return fail("Enter the cash balance shown in WInS (USD).");
    await saveSetting("cash_usd", cash);
    revalidatePath("/", "layout");
    return ok(`Cash set to $${cash.toFixed(2)}.`);
  });
}

// ---------------------------------------------------------------- WInS import

export async function importWins(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const text = str(fd, "text");
    const apply = str(fd, "mode") === "apply";
    const parsed = parseWinsPositions(text);
    if (parsed.error) return fail(parsed.error);
    const instruments = (must(await db().from("instruments").select("*"), "Load") as Record<string, unknown>[]).map(normInstrument);
    const plan = parsed.rows.map((r) => {
      const t = matchTicker(r.symbol, instruments);
      const inst = t ? instruments.find((i) => i.ticker === t) ?? null : null;
      return { row: r, ticker: t, before: inst ? { shares: inst.shares, avg_cost: inst.avg_cost, status: inst.status } : null };
    });
    const importedTickers = new Set(plan.map((p) => p.ticker).filter(Boolean));
    const missing = instruments.filter((i) => i.status === "held" && i.shares > 0 && !importedTickers.has(i.ticker)).map((i) => i.ticker);
    if (!apply) return ok("Preview ready. Check the rows, then apply.", { plan, skipped: parsed.skipped, missing, columns: parsed.columns });

    const today = todayIn("America/New_York");
    let updated = 0;
    let created = 0;
    for (const p of plan) {
      const r: ImportRow = p.row;
      if (p.ticker) {
        const inst = instruments.find((i) => i.ticker === p.ticker)!;
        const sharesChanged = inst.shares !== r.quantity || inst.status !== "held";
        const patch: Record<string, unknown> = {
          status: "held",
          shares: r.quantity,
          opened_at: inst.opened_at ?? today,
          updated_at: new Date().toISOString(),
        };
        if (r.avgCost !== null) patch.avg_cost = r.avgCost;
        // A changed share count means the old stop no longer covers the position.
        if (sharesChanged) patch.stop_price = null;
        must(await db().from("instruments").update(patch).eq("ticker", p.ticker), `Update ${p.ticker}`);
        updated++;
      } else {
        const sym = r.symbol.replace(/[^A-Z0-9.\-]/g, "");
        must(
          await db().from("instruments").insert({
            ticker: sym,
            yahoo_symbol: sym,
            name: r.name,
            exchange: r.exchange,
            ccy: r.currency && /^[A-Z]{3}$/.test(r.currency) ? r.currency : "USD",
            status: "held",
            shares: r.quantity,
            avg_cost: r.avgCost,
            opened_at: today,
            notes: "Created by WInS import: check the Yahoo symbol, sector and scores.",
          }),
          `Add ${sym}`,
        );
        created++;
      }
    }
    if (str(fd, "zero_missing") === "on") {
      for (const t of missing) must(await db().from("instruments").update({ status: "sold", shares: 0, stop_price: null }).eq("ticker", t), `Close ${t}`);
    }
    const cash = optNum(fd, "cash");
    if (cash !== null && cash >= 0) await saveSetting("cash_usd", cash);
    revalidatePath("/", "layout");
    return ok(`Imported: ${updated} updated, ${created} new.${missing.length ? ` Not in WInS: ${missing.join(", ")}${str(fd, "zero_missing") === "on" ? " (closed)" : ""}.` : ""} Enter stop prices for positions whose share count changed.`);
  });
}

// ---------------------------------------------------------------- strategy

export async function changeParam(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const key = str(fd, "key") as keyof ReturnType<typeof mergeParams>;
    const meta = PARAM_META.find((m) => m.key === key);
    if (!meta) return fail("Unknown parameter");
    const value = optNum(fd, "value");
    if (value === null) return fail("Enter a value.");
    const reason = str(fd, "reason");
    const approver = str(fd, "approved_by");
    if (reason.length < 5) return fail("Write the reason for the change (change-log rule).");
    if (!approver) return fail("Name the person who approved it (two-person rule).");
    const err = validateParamChange(key, value);
    if (err) return fail(err);
    const settings = await loadSettings();
    const params = mergeParams(settings.params);
    const old = params[key];
    if (old === value) return fail("That is already the current value.");
    await saveSetting("params", { ...params, [key]: value });
    must(await db().from("strategy_changes").insert({ param: `${meta.id} ${meta.label}`, old_value: String(old), new_value: String(value), reason, approved_by: approver }), "Change log");
    revalidatePath("/", "layout");
    return ok(`${meta.id} changed from ${old} to ${value}. Logged.`);
  });
}

export async function saveThresholds(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const t = {
      dailyDipPct: optNum(fd, "dailyDipPct"),
      drawdownPct: optNum(fd, "drawdownPct"),
      stopWarnPct: optNum(fd, "stopWarnPct"),
      indexDipPct: optNum(fd, "indexDipPct"),
    };
    for (const [k, v] of Object.entries(t)) if (v === null || v <= 0 || v > 50) return fail(`${k} must be between 0 and 50.`);
    await saveSetting("thresholds", t);
    revalidatePath("/", "layout");
    return ok("Alert thresholds saved.");
  });
}

export async function saveNotificationSettings(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const sev = (["EXIT", "RECHECK", "NEW_TRADE", "INFO"] as Severity[]).filter((s) => fd.get(`sev_${s}`) === "on");
    const tz = str(fd, "team_timezone") || "Asia/Kolkata";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      return fail(`Unknown time zone ${tz}`);
    }
    await saveSetting("email_severities", sev);
    await saveSetting("team_timezone", tz);
    revalidatePath("/", "layout");
    return ok("Notification settings saved.");
  });
}

export async function sendTestEmail(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const to = str(fd, "to");
    if (!EMAIL_RE.test(to)) return fail("Enter a valid email address.");
    const res = await sendEmail([to], "[Northgate] Test email", `<p>Email from Northgate AlertGuard is working.</p><p>${esc(new Date().toISOString())}</p>`, "Email from Northgate AlertGuard is working.", "test");
    return res.ok ? ok(`Test email sent to ${to}.`) : fail(`Not sent: ${res.error}`);
  });
}

// ---------------------------------------------------------------- team & tasks

export async function addMember(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const name = str(fd, "name");
    const email = str(fd, "email").toLowerCase();
    if (!name) return fail("Enter a name.");
    if (!EMAIL_RE.test(email)) return fail("Enter a valid email address.");
    const res = await db().from("team_members").insert({ name, email, role: str(fd, "role") || null });
    if (res.error) return fail(res.error.code === "23505" ? `${email} is already on the team.` : res.error.message);
    revalidatePath("/", "layout");
    return ok(`${name} added. They will get alert emails and task reminders.`);
  });
}

export async function updateMember(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = str(fd, "id");
    const op = str(fd, "op");
    if (op === "delete") {
      must(await db().from("team_members").delete().eq("id", id), "Remove member");
      revalidatePath("/", "layout");
      return ok("Member removed. Their tasks are now unassigned.");
    }
    const patch: Record<string, unknown> = {};
    if (op === "toggle_alerts") patch.notify_alerts = str(fd, "value") === "true";
    else if (op === "toggle_tasks") patch.notify_tasks = str(fd, "value") === "true";
    else if (op === "toggle_active") patch.active = str(fd, "value") === "true";
    else if (op === "edit") {
      const email = str(fd, "email").toLowerCase();
      if (!EMAIL_RE.test(email)) return fail("Enter a valid email address.");
      patch.name = str(fd, "name");
      patch.email = email;
      patch.role = str(fd, "role") || null;
    } else return fail("Unknown operation");
    const res = await db().from("team_members").update(patch).eq("id", id);
    if (res.error) return fail(res.error.code === "23505" ? "That email is already used." : res.error.message);
    revalidatePath("/", "layout");
    return ok("Saved.");
  });
}

export async function addTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const title = str(fd, "title");
    if (!title) return fail("Enter a task title.");
    const recurrence = (str(fd, "recurrence") || "none") as Recurrence;
    if (!["none", "daily", "weekly", "monthly"].includes(recurrence)) return fail("Bad recurrence");
    const priority = str(fd, "priority") || "normal";
    if (!["low", "normal", "high"].includes(priority)) return fail("Bad priority");
    const assignee = str(fd, "assignee_id") || null;
    const due = optDate(fd, "due_date");
    if (recurrence !== "none" && !due) return fail("Recurring tasks need a first due date.");
    const task = { title, description: str(fd, "description") || null, assignee_id: assignee, due_date: due, recurrence, priority };
    must(await db().from("tasks").insert(task), "Add task");
    let mail = "";
    if (assignee) {
      const m = must(await db().from("team_members").select("*").eq("id", assignee).maybeSingle(), "Load member") as TeamMember | null;
      if (m && m.notify_tasks && m.active) {
        const e = taskAssignedEmail(task as Task, m);
        const res = await sendEmail([m.email], e.subject, e.html, e.text, "task_assigned");
        mail = res.ok ? ` Emailed ${m.name}.` : ` (Email not sent: ${res.error})`;
      }
    }
    revalidatePath("/", "layout");
    return ok(`Task added.${mail}`);
  });
}

export async function updateTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = str(fd, "id");
    const op = str(fd, "op");
    const task = must(await db().from("tasks").select("*").eq("id", id).maybeSingle(), "Load task") as Task | null;
    if (!task) return fail("Task not found");
    if (op === "delete") {
      must(await db().from("tasks").delete().eq("id", id), "Delete task");
      revalidatePath("/", "layout");
      return ok("Task deleted.");
    }
    if (op === "status") {
      const status = str(fd, "status");
      if (!["todo", "in_progress", "done"].includes(status)) return fail("Bad status");
      if (status === "done" && task.recurrence !== "none") {
        const settings = await loadSettings();
        const tz = typeof settings.team_timezone === "string" ? settings.team_timezone : "Asia/Kolkata";
        const next = nextDueDate(task.due_date, task.recurrence, todayIn(tz));
        must(await db().from("tasks").update({ status: "todo", due_date: next, last_reminded_on: null, completed_at: new Date().toISOString() }).eq("id", id), "Roll task");
        revalidatePath("/", "layout");
        return ok(`Done for this time. Next due ${next}.`);
      }
      must(await db().from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", id), "Update task");
      revalidatePath("/", "layout");
      return ok(status === "done" ? "Task done." : "Updated.");
    }
    if (op === "assign") {
      const assignee = str(fd, "assignee_id") || null;
      must(await db().from("tasks").update({ assignee_id: assignee, last_reminded_on: null }).eq("id", id), "Assign");
      let mail = "";
      if (assignee) {
        const m = must(await db().from("team_members").select("*").eq("id", assignee).maybeSingle(), "Load member") as TeamMember | null;
        if (m && m.notify_tasks && m.active) {
          const e = taskAssignedEmail(task, m);
          const res = await sendEmail([m.email], e.subject, e.html, e.text, "task_assigned");
          mail = res.ok ? ` Emailed ${m.name}.` : ` (Email not sent: ${res.error})`;
        }
      }
      revalidatePath("/", "layout");
      return ok(`Reassigned.${mail}`);
    }
    return fail("Unknown operation");
  });
}

export async function remindNow(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const id = str(fd, "id");
    const task = must(await db().from("tasks").select("*").eq("id", id).maybeSingle(), "Load task") as Task | null;
    if (!task?.assignee_id) return fail("Assign the task first.");
    const m = must(await db().from("team_members").select("*").eq("id", task.assignee_id).maybeSingle(), "Load member") as TeamMember | null;
    if (!m) return fail("Assignee not found");
    const e = taskAssignedEmail(task, m);
    const res = await sendEmail([m.email], `[Northgate] Reminder: ${task.title}`, e.html, e.text, "task_reminder");
    return res.ok ? ok(`Reminder sent to ${m.name}.`) : fail(`Not sent: ${res.error}`);
  });
}
