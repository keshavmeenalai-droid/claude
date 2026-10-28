import type { Recurrence, Task } from "./types";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso: string, n: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Next due date for a recurring task, always after `today` (skips missed periods). */
export function nextDueDate(due: string | null, recurrence: Recurrence, today: string): string | null {
  if (recurrence === "none") return null;
  let next = due ?? today;
  const step = (d: string) => (recurrence === "daily" ? addDays(d, 1) : recurrence === "weekly" ? addDays(d, 7) : addMonths(d, 1));
  next = step(next);
  let guard = 0;
  while (next <= today && guard++ < 1000) next = step(next);
  return next;
}

export function isMonday(iso: string): boolean {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}

/**
 * Whether a task should be in today's reminder email:
 * open, not already reminded today, and either due within 2 days / overdue,
 * or it is Monday (weekly summary of everything open).
 */
export function shouldRemind(task: Pick<Task, "status" | "due_date" | "last_reminded_on">, today: string): boolean {
  if (task.status === "done") return false;
  if (task.last_reminded_on === today) return false;
  if (isMonday(today)) return true;
  if (!task.due_date) return false;
  return task.due_date <= addDays(today, 2);
}

/** Today's date (YYYY-MM-DD) in a given IANA time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
