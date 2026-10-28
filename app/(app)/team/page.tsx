import { Bell, BellOff, Mail, Repeat } from "lucide-react";
import { addMember, addTask, remindNow, updateMember, updateTask } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DbMissing } from "@/components/setup";
import { Card, Chip, cx, Empty, Field, inputCls, PageHeader } from "@/components/ui";
import { db, isDbConfigured, must } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { todayIn } from "@/lib/tasks";
import type { Task, TeamMember } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team & tasks" };

const COLUMNS: Array<{ key: Task["status"]; label: string }> = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

const AVATAR = ["bg-sky-500/20 text-sky-200", "bg-emerald-500/20 text-emerald-200", "bg-violet-500/20 text-violet-200", "bg-amber-500/20 text-amber-200", "bg-rose-500/20 text-rose-200"];

export default async function TeamPage() {
  if (!isDbConfigured()) return <DbMissing />;
  const [mRes, tRes, sRes] = await Promise.all([
    db().from("team_members").select("*").order("created_at"),
    db().from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("created_at"),
    db().from("settings").select("value").eq("key", "team_timezone").maybeSingle(),
  ]);
  const members = must(mRes, "Load team") as TeamMember[];
  const tasks = must(tRes, "Load tasks") as Task[];
  const tz = typeof sRes.data?.value === "string" ? (sRes.data.value as string) : "Asia/Kolkata";
  const today = todayIn(tz);
  const byId = new Map(members.map((m, i) => [m.id, { ...m, color: AVATAR[i % AVATAR.length] }]));
  const doneRecent = tasks.filter((t) => t.status === "done").slice(-15);

  return (
    <>
      <PageHeader
        title="Team & tasks"
        subtitle={`Every active member gets the alert emails. Assigned tasks are emailed when assigned, reminded daily when due within 2 days or overdue, and summarised every Monday. Dates use ${tz}.`}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title={`Team (${members.length})`} subtitle="Up to anyone you add: alerts go to all active members">
          {members.length === 0 ? (
            <Empty title="No members yet">Add the five team emails below.</Empty>
          ) : (
            <ul className="space-y-3">
              {members.map((m) => {
                const color = byId.get(m.id)?.color;
                const open = tasks.filter((t) => t.assignee_id === m.id && t.status !== "done").length;
                return (
                  <li key={m.id} className={cx("rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5", !m.active && "opacity-50")}>
                    <div className="flex items-center gap-3">
                      <div className={cx("flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold", color)}>{initials(m.name)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-100">{m.name} {m.role && <span className="text-xs text-slate-500">· {m.role}</span>}</div>
                        <div className="truncate text-xs text-slate-400">{m.email}</div>
                      </div>
                      <Chip tone={open ? "amber" : "slate"}>{open} open</Chip>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionForm action={updateMember}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="op" value="toggle_alerts" />
                        <input type="hidden" name="value" value={String(!m.notify_alerts)} />
                        <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs">{m.notify_alerts ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />} Alerts {m.notify_alerts ? "on" : "off"}</SubmitButton>
                      </ActionForm>
                      <ActionForm action={updateMember}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="op" value="toggle_tasks" />
                        <input type="hidden" name="value" value={String(!m.notify_tasks)} />
                        <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs"><Mail className="h-3 w-3" /> Task mail {m.notify_tasks ? "on" : "off"}</SubmitButton>
                      </ActionForm>
                      <ActionForm action={updateMember}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="op" value="toggle_active" />
                        <input type="hidden" name="value" value={String(!m.active)} />
                        <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs">{m.active ? "Pause" : "Activate"}</SubmitButton>
                      </ActionForm>
                      <ActionForm action={updateMember} confirmText={`Remove ${m.name} from the team?`}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="op" value="delete" />
                        <SubmitButton variant="danger" className="!px-2 !py-1 text-xs">Remove</SubmitButton>
                      </ActionForm>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <ActionForm action={addMember} resetOnSuccess className="mt-5 space-y-3 border-t border-white/5 pt-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name"><input name="name" required className={inputCls} /></Field>
              <Field label="Role"><input name="role" className={inputCls} placeholder="Analyst, PM…" /></Field>
            </div>
            <Field label="Email"><input name="email" type="email" required className={inputCls} /></Field>
            <SubmitButton>Add member</SubmitButton>
          </ActionForm>
        </Card>

        <Card className="xl:col-span-2" title="Assign a task">
          <ActionForm action={addTask} resetOnSuccess className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Task" className="col-span-2"><input name="title" required className={inputCls} placeholder="e.g. Check EXEL results vs sell triggers" /></Field>
            <Field label="Assign to">
              <select name="assignee_id" className={inputCls} defaultValue="">
                <option value="">Unassigned</option>
                {members.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Due date"><input name="due_date" type="date" defaultValue={today} className={inputCls} /></Field>
            <Field label="Details" className="col-span-2"><textarea name="description" rows={2} className={inputCls} /></Field>
            <Field label="Repeats">
              <select name="recurrence" className={inputCls} defaultValue="none">
                <option value="none">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" className={inputCls} defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </Field>
            <div className="col-span-2 md:col-span-4"><SubmitButton>Assign task</SubmitButton></div>
          </ActionForm>
        </Card>

        <div className="grid gap-4 md:grid-cols-3 xl:col-span-3">
          {COLUMNS.map((col) => {
            const list = col.key === "done" ? doneRecent : tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="rounded-2xl border border-white/5 bg-ink-900/60 p-3">
                <h3 className="mb-3 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {col.label} <span className="rounded-full bg-white/5 px-2 py-0.5 text-slate-300">{list.length}</span>
                </h3>
                <div className="space-y-3">
                  {list.length === 0 && <p className="px-1 text-xs text-slate-500">Nothing here.</p>}
                  {list.map((t) => {
                    const m = t.assignee_id ? byId.get(t.assignee_id) : null;
                    const overdue = t.status !== "done" && t.due_date && t.due_date < today;
                    const dueToday = t.status !== "done" && t.due_date === today;
                    return (
                      <div key={t.id} className={cx("rounded-xl bg-ink-850 p-3 ring-1", overdue ? "ring-rose-500/40" : dueToday ? "ring-amber-500/40" : "ring-white/5")}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={cx("text-sm font-medium", t.status === "done" ? "text-slate-500 line-through" : "text-slate-100")}>{t.title}</p>
                          {t.priority === "high" && <Chip tone="red">high</Chip>}
                        </div>
                        {t.description && <p className="mt-1 line-clamp-3 text-xs text-slate-400">{t.description}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {m ? <span className={cx("rounded-full px-2 py-0.5", m.color)}>{m.name}</span> : <span className="rounded-full bg-white/5 px-2 py-0.5 text-slate-400">Unassigned</span>}
                          {t.due_date && <span className={overdue ? "text-rose-300" : dueToday ? "text-amber-300" : "text-slate-400"}>{overdue ? "Overdue · " : dueToday ? "Today · " : ""}{shortDate(t.due_date)}</span>}
                          {t.recurrence !== "none" && <span className="flex items-center gap-1 text-sky-300"><Repeat className="h-3 w-3" />{t.recurrence}</span>}
                        </div>
                        {t.status !== "done" && (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {t.status === "todo" && (
                              <ActionForm action={updateTask}>
                                <input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="status" /><input type="hidden" name="status" value="in_progress" />
                                <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs">Start</SubmitButton>
                              </ActionForm>
                            )}
                            <ActionForm action={updateTask}>
                              <input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="status" /><input type="hidden" name="status" value="done" />
                              <SubmitButton variant="success" className="!px-2 !py-1 text-xs">Done</SubmitButton>
                            </ActionForm>
                            {t.assignee_id && (
                              <ActionForm action={remindNow}>
                                <input type="hidden" name="id" value={t.id} />
                                <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs" title="Email the assignee now"><Mail className="h-3 w-3" /></SubmitButton>
                              </ActionForm>
                            )}
                            <ActionForm action={updateTask} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="assign" />
                              <select name="assignee_id" defaultValue={t.assignee_id ?? ""} className="rounded-md border border-white/10 bg-ink-950/60 px-1.5 py-1 text-xs text-slate-200">
                                <option value="">Unassigned</option>
                                {members.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                              </select>
                              <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs">Assign</SubmitButton>
                            </ActionForm>
                          </div>
                        )}
                        <ActionForm action={updateTask} confirmText="Delete this task?" className="mt-2">
                          <input type="hidden" name="id" value={t.id} /><input type="hidden" name="op" value="delete" />
                          <button className="text-[11px] text-slate-500 hover:text-rose-300">Delete</button>
                        </ActionForm>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
