import Link from "next/link";
import { acknowledgeAll, setAlertStatus } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DbMissing } from "@/components/setup";
import { Card, cx, Empty, PageHeader, SeverityBadge } from "@/components/ui";
import { db, isDbConfigured, must } from "@/lib/db";
import { dateTime } from "@/lib/format";
import type { AlertRow, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

const TABS = [
  { key: "open", label: "Open" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
] as const;

const SEVS: Array<Severity | "ALL"> = ["ALL", "EXIT", "RECHECK", "NEW_TRADE", "INFO"];

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ status?: string; sev?: string }> }) {
  if (!isDbConfigured()) return <DbMissing />;
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? (sp.status as AlertRow["status"]) : "open";
  const sev = SEVS.includes(sp.sev as Severity) ? (sp.sev as Severity) : "ALL";
  let query = db().from("alerts").select("*").eq("status", status).order("created_at", { ascending: false }).limit(200);
  if (sev !== "ALL") query = query.eq("severity", sev);
  const alerts = must(await query, "Load alerts") as AlertRow[];
  const order = { EXIT: 0, RECHECK: 1, NEW_TRADE: 2, INFO: 3 };
  if (status !== "resolved") alerts.sort((a, b) => order[a.severity] - order[b.severity] || (a.created_at < b.created_at ? 1 : -1));

  const href = (st: string, sv: string) => `/alerts?status=${st}${sv !== "ALL" ? `&sev=${sv}` : ""}`;

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Created by the daily check. A condition alert (stop near, below average, exit rule) stays open while the condition holds and resolves itself when it clears. Every new alert is emailed to the team once."
      >
        {status === "open" && alerts.length > 0 && (
          <ActionForm action={acknowledgeAll}>
            <SubmitButton variant="ghost">Acknowledge all</SubmitButton>
          </ActionForm>
        )}
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key, sev)} className={cx("rounded-lg px-3 py-1.5 text-sm", status === t.key ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30" : "text-slate-400 hover:bg-white/5")}>
            {t.label}
          </Link>
        ))}
        <span className="mx-2 h-5 w-px bg-white/10" />
        {SEVS.map((s) => (
          <Link key={s} href={href(status, s)} className={cx("rounded-lg px-2.5 py-1 text-xs", sev === s ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5")}>
            {s === "ALL" ? "All" : s === "NEW_TRADE" ? "New trade" : s === "RECHECK" ? "Re-check" : s[0] + s.slice(1).toLowerCase()}
          </Link>
        ))}
      </div>
      <Card>
        {alerts.length === 0 ? (
          <Empty title={status === "open" ? "No open alerts" : "Nothing here"}>{status === "open" ? "Every position is inside its rules." : null}</Empty>
        ) : (
          <ul className="divide-y divide-white/5">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-start">
                <div className="w-28 shrink-0">
                  <SeverityBadge severity={a.severity} />
                  <div className="mt-1 font-mono text-[11px] text-slate-500">{a.rule}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-100">
                    {a.ticker && a.ticker !== "SPY" ? (
                      <Link href={`/positions/${encodeURIComponent(a.ticker)}`} className="hover:text-sky-300">{a.title}</Link>
                    ) : (
                      a.title
                    )}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">{a.message}</p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Raised {dateTime(a.created_at)} · last seen {dateTime(a.last_seen_at)}
                    {a.emailed ? " · emailed" : ""}
                    {a.acknowledged_by ? ` · acknowledged by ${a.acknowledged_by}` : ""}
                    {a.resolved_at ? ` · resolved ${dateTime(a.resolved_at)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {a.status === "open" && (
                    <ActionForm action={setAlertStatus}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="acknowledged" />
                      <SubmitButton variant="ghost">Acknowledge</SubmitButton>
                    </ActionForm>
                  )}
                  {a.status !== "resolved" && (
                    <ActionForm action={setAlertStatus}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="resolved" />
                      <SubmitButton variant="ghost">Resolve</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
