import "server-only";
import nodemailer from "nodemailer";
import { db } from "./db";
import type { AlertRow, Severity, Task, TeamMember } from "./types";

export const APP_NAME = "Northgate AlertGuard";

export function emailProvider(): "smtp" | "resend" | null {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || (process.env.SMTP_USER ? `${APP_NAME} <${process.env.SMTP_USER}>` : `${APP_NAME} <onboarding@resend.dev>`);
}

export function appUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendEmail(to: string[], subject: string, html: string, text: string, kind: string): Promise<SendResult> {
  const recipients = [...new Set(to.map((t) => t.trim()).filter(Boolean))];
  if (recipients.length === 0) return { ok: false, error: "No recipients" };
  const provider = emailProvider();
  let result: SendResult;
  try {
    if (provider === "smtp") {
      const port = Number(process.env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      // One message per recipient so members do not see each other's addresses.
      for (const r of recipients) {
        await transport.sendMail({ from: fromAddress(), to: r, subject, html, text });
      }
      result = { ok: true };
    } else if (provider === "resend") {
      for (const r of recipients) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromAddress(), to: [r], subject, html, text }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      result = { ok: true };
    } else {
      result = { ok: false, error: "Email is not configured (set SMTP_* or RESEND_API_KEY)." };
    }
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    await db().from("notifications").insert({ recipients, subject, kind, ok: result.ok, error: result.error ?? null });
  } catch {
    // Logging must never hide the send result.
  }
  return result;
}

// ---------------------------------------------------------------- templates

export function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const SEV_COLOR: Record<Severity, string> = { EXIT: "#e11d48", RECHECK: "#d97706", NEW_TRADE: "#059669", INFO: "#0284c7" };
const SEV_LABEL: Record<Severity, string> = { EXIT: "EXIT", RECHECK: "RE-CHECK", NEW_TRADE: "NEW TRADE", INFO: "INFO" };
const SEV_ORDER: Severity[] = ["EXIT", "RECHECK", "NEW_TRADE", "INFO"];

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b1324;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1324;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0f1a30;padding:18px 24px;color:#e2e8f0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">▲ ${APP_NAME}</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:20px">${esc(title)}</h1>${body}
<p style="margin:24px 0 0"><a href="${appUrl()}" style="background:#0f1a30;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Open ${APP_NAME}</a></p>
<p style="margin:20px 0 0;font-size:12px;color:#64748b">QVM Compass rules · Prices from the daily check; always confirm the live WInS price before an order.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function alertDigest(alerts: Pick<AlertRow, "severity" | "title" | "message" | "ticker">[]): { subject: string; html: string; text: string } {
  const counts = SEV_ORDER.map((s) => [s, alerts.filter((a) => a.severity === s).length] as const).filter(([, n]) => n > 0);
  const subject = `[Northgate] ${counts.map(([s, n]) => `${n} ${SEV_LABEL[s]}`).join(" · ")}${alerts.some((a) => a.severity === "EXIT") ? " — action needed" : ""}`;
  const sorted = [...alerts].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  const rows = sorted
    .map(
      (a) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0">
<span style="display:inline-block;background:${SEV_COLOR[a.severity]};color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px">${SEV_LABEL[a.severity]}</span>
<div style="font-weight:600;margin:6px 0 4px">${esc(a.title)}</div><div style="font-size:14px;color:#334155;line-height:1.5">${esc(a.message)}</div></td></tr>`,
    )
    .join("");
  const html = layout("New alerts from the daily check", `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
  const text = sorted.map((a) => `[${SEV_LABEL[a.severity]}] ${a.title}\n${a.message}`).join("\n\n") + `\n\n${appUrl()}`;
  return { subject, html, text };
}

export function taskAssignedEmail(task: Pick<Task, "title" | "description" | "due_date" | "recurrence" | "priority">, member: Pick<TeamMember, "name">) {
  const subject = `[Northgate] New task for you: ${task.title}`;
  const details = [
    task.due_date ? `<b>Due:</b> ${esc(task.due_date)}` : "",
    task.recurrence !== "none" ? `<b>Repeats:</b> ${esc(task.recurrence)}` : "",
    `<b>Priority:</b> ${esc(task.priority)}`,
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");
  const html = layout(`Hi ${member.name}, you have a new task`, `<div style="font-size:16px;font-weight:600">${esc(task.title)}</div>
<p style="font-size:14px;color:#334155;line-height:1.5;white-space:pre-wrap">${esc(task.description)}</p><p style="font-size:13px;color:#475569">${details}</p>`);
  const text = `Hi ${member.name}, you have a new task: ${task.title}\n${task.description ?? ""}\nDue: ${task.due_date ?? "—"} · Repeats: ${task.recurrence} · Priority: ${task.priority}\n${appUrl()}/team`;
  return { subject, html, text };
}

export function taskReminderEmail(member: Pick<TeamMember, "name">, tasks: Array<Pick<Task, "title" | "due_date" | "priority" | "description">>, today: string) {
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today).length;
  const subject = `[Northgate] ${tasks.length} task${tasks.length === 1 ? "" : "s"} for you${overdue ? ` (${overdue} overdue)` : ""}`;
  const rows = tasks
    .map((t) => {
      const late = t.due_date && t.due_date < today;
      const dueToday = t.due_date === today;
      const tag = late ? `<span style="color:#e11d48;font-weight:700">OVERDUE ${esc(t.due_date)}</span>` : dueToday ? `<span style="color:#d97706;font-weight:700">DUE TODAY</span>` : t.due_date ? `Due ${esc(t.due_date)}` : "No due date";
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0"><div style="font-weight:600">${esc(t.title)}</div><div style="font-size:13px;color:#475569">${tag} · ${esc(t.priority)} priority</div></td></tr>`;
    })
    .join("");
  const html = layout(`Hi ${member.name}, here are your open tasks`, `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
  const text = `Hi ${member.name}, your open tasks:\n` + tasks.map((t) => `- ${t.title} (due ${t.due_date ?? "—"})`).join("\n") + `\n${appUrl()}/team`;
  return { subject, html, text };
}
