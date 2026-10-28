import { CheckCircle2, XCircle } from "lucide-react";
import { runCheckNow, saveNotificationSettings, seedStrategy, sendTestEmail } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DbMissing } from "@/components/setup";
import { Card, Field, inputCls, PageHeader } from "@/components/ui";
import { loadSettings } from "@/lib/data";
import { db, isDbConfigured, must } from "@/lib/db";
import { emailProvider } from "@/lib/email";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" /> : <XCircle className="mt-0.5 h-4 w-4 text-rose-400" />}
      <div>
        <div className="text-sm text-slate-100">{label}</div>
        <div className="text-xs text-slate-400">{detail}</div>
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  if (!isDbConfigured()) return <DbMissing />;
  const [settings, runsRes, notesRes] = await Promise.all([
    loadSettings(),
    db().from("runs").select("*").order("started_at", { ascending: false }).limit(15),
    db().from("notifications").select("*").order("sent_at", { ascending: false }).limit(25),
  ]);
  const runs = must(runsRes, "Load runs") as Array<{ id: number; started_at: string; trigger: string; ok: boolean | null; summary: Record<string, unknown> | null }>;
  const notes = must(notesRes, "Load notifications") as Array<{ id: number; sent_at: string; recipients: string[]; subject: string; kind: string; ok: boolean; error: string | null }>;
  const provider = emailProvider();
  const sev = (Array.isArray(settings.email_severities) ? settings.email_severities : ["EXIT", "RECHECK", "NEW_TRADE", "INFO"]) as string[];
  const tz = typeof settings.team_timezone === "string" ? settings.team_timezone : "Asia/Kolkata";

  return (
    <>
      <PageHeader title="Settings" subtitle="Connections, email delivery and the log of daily checks." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Connections">
          <ul className="space-y-3">
            <Status ok label="Supabase" detail="Connected with the service-role key (server only)." />
            <Status ok={!!provider} label="Email" detail={provider === "smtp" ? `SMTP via ${process.env.SMTP_HOST}` : provider === "resend" ? "Resend API" : "Not configured: set SMTP_HOST / SMTP_USER / SMTP_PASS (e.g. Gmail app password) or RESEND_API_KEY."} />
            <Status ok={!!process.env.CRON_SECRET} label="Daily cron" detail={process.env.CRON_SECRET ? "CRON_SECRET set. Vercel runs the check every day at 21:30 UTC (after the US close)." : "Set CRON_SECRET in Vercel so the daily check can run."} />
            <Status ok label="Market data" detail="Daily closes from Yahoo Finance (no key needed). WInS positions come from fills or the Open Positions import." />
          </ul>
        </Card>

        <Card title="Email notifications">
          <ActionForm action={saveNotificationSettings} className="space-y-3">
            <p className="text-xs text-slate-400">Which new alerts are emailed to the team:</p>
            {[
              ["EXIT", "Exit (sell rules fired)"],
              ["RECHECK", "Re-check (dips, near stop, below average, missing stop)"],
              ["NEW_TRADE", "New trade (entry rules pass)"],
              ["INFO", "Info (results coming, market dips, glide-path dates)"],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" name={`sev_${k}`} defaultChecked={sev.includes(k)} className="h-4 w-4 accent-sky-500" /> {label}
              </label>
            ))}
            <Field label="Team time zone" hint="Used for task due dates and reminders, e.g. Asia/Kolkata">
              <input name="team_timezone" defaultValue={tz} className={inputCls} />
            </Field>
            <SubmitButton variant="ghost">Save</SubmitButton>
          </ActionForm>
          <ActionForm action={sendTestEmail} className="mt-5 flex flex-wrap items-end gap-2 border-t border-white/5 pt-4">
            <Field label="Send a test email to" className="flex-1"><input name="to" type="email" required className={inputCls} /></Field>
            <SubmitButton variant="ghost">Send test</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Strategy data">
          <p className="text-sm text-slate-300">Reload the 23 Oct strategy file (stocks, order plan, alternates, watchlist, parameters, reserve). Replacing overwrites positions and cash with the plan; import WInS afterwards.</p>
          <ActionForm action={seedStrategy} className="mt-3 space-y-3" confirmText="Reload the strategy file into AlertGuard?">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" name="replace" value="yes" className="h-4 w-4 accent-rose-500" /> Replace existing data
            </label>
            <SubmitButton variant="warn">Load strategy file</SubmitButton>
          </ActionForm>
          <ActionForm action={runCheckNow} className="mt-5 border-t border-white/5 pt-4">
            <input type="hidden" name="email" value="no" />
            <SubmitButton variant="ghost">Run check without emailing</SubmitButton>
          </ActionForm>
        </Card>

        <Card className="xl:col-span-2" title="Daily check log">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Started</th><th>Trigger</th><th>Result</th><th>Details</th></tr></thead>
              <tbody>
                {runs.map((r) => {
                  const sm = r.summary ?? {};
                  const failed = Array.isArray(sm.failed) ? (sm.failed as Array<{ symbol: string }>) : [];
                  return (
                    <tr key={r.id}>
                      <td>{dateTime(r.started_at, tz)}</td>
                      <td>{r.trigger}</td>
                      <td className={r.ok ? "text-emerald-300" : r.ok === false ? "text-rose-300" : "text-slate-400"}>{r.ok ? "OK" : r.ok === false ? "Failed" : "Running"}</td>
                      <td className="max-w-lg whitespace-normal text-xs text-slate-400">
                        {sm.error ? String(sm.error) : `${sm.fetched ?? 0} prices · ${sm.newAlerts ?? 0} new alerts · ${sm.resolved ?? 0} resolved · ${sm.taskReminders ?? 0} reminders${failed.length ? ` · failed: ${failed.map((f) => f.symbol).join(", ")}` : ""}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Emails sent">
          <ul className="space-y-2 text-xs">
            {notes.length === 0 && <li className="text-slate-400">No emails yet.</li>}
            {notes.map((n) => (
              <li key={n.id} className="border-b border-white/5 pb-2">
                <div className={n.ok ? "text-slate-200" : "text-rose-300"}>{n.subject}</div>
                <div className="text-slate-500">{dateTime(n.sent_at, tz)} · {n.recipients.length} recipient(s){n.error ? ` · ${n.error}` : ""}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
