import type { ReactNode } from "react";
import type { Light, Severity, Verdict } from "@/lib/types";

export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(" ");
}

export function Card({ title, subtitle, action, children, className }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-white/5 bg-ink-900/80 shadow-xl shadow-black/20 backdrop-blur", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; icon?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-ink-850 to-ink-900 p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <div className={cx("mt-2 font-mono text-2xl font-semibold", tone ?? "text-slate-50")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

const SEV_STYLE: Record<Severity, string> = {
  EXIT: "bg-rose-500/15 text-rose-300 ring-rose-500/40",
  RECHECK: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  NEW_TRADE: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  INFO: "bg-sky-500/15 text-sky-300 ring-sky-500/40",
};
const SEV_LABEL: Record<Severity, string> = { EXIT: "EXIT", RECHECK: "RE-CHECK", NEW_TRADE: "NEW TRADE", INFO: "INFO" };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ring-1", SEV_STYLE[severity])}>{SEV_LABEL[severity]}</span>;
}

const VERDICT_STYLE: Record<Verdict, string> = {
  BUY: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  WAIT: "bg-slate-500/15 text-slate-300 ring-slate-500/40",
  REJECT: "bg-rose-500/15 text-rose-300 ring-rose-500/40",
  WATCHLIST: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider ring-1", VERDICT_STYLE[verdict])}>{verdict}</span>;
}

const LIGHT_STYLE: Record<Light, { dot: string; ring: string; text: string }> = {
  GREEN: { dot: "bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,.6)]", ring: "ring-emerald-500/30 bg-emerald-500/10", text: "text-emerald-300" },
  YELLOW: { dot: "bg-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,.6)]", ring: "ring-amber-500/30 bg-amber-500/10", text: "text-amber-300" },
  RED: { dot: "bg-rose-500 shadow-[0_0_12px_2px_rgba(244,63,94,.6)]", ring: "ring-rose-500/30 bg-rose-500/10", text: "text-rose-300" },
};

export function LightPill({ light, small }: { light: Light; small?: boolean }) {
  const s = LIGHT_STYLE[light];
  return (
    <span className={cx("inline-flex items-center gap-2 rounded-full ring-1", s.ring, small ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs")}>
      <span className={cx("h-2 w-2 rounded-full", s.dot)} />
      <span className={cx("font-bold tracking-wider", s.text)}>{light}</span>
    </span>
  );
}

export function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "sky" }) {
  const t = {
    slate: "bg-white/5 text-slate-300 ring-white/10",
    green: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
    red: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
    sky: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1", t)}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-400">{children}</div>}
    </div>
  );
}

/** Horizontal bar showing how far the price is above the stop (0% = at the stop). */
export function StopMeter({ distancePct }: { distancePct: number | null }) {
  if (distancePct === null) return <span className="text-xs text-slate-500">no stop</span>;
  const clamped = Math.max(0, Math.min(40, distancePct));
  const color = distancePct <= 0 ? "bg-rose-500" : distancePct <= 5 ? "bg-amber-400" : distancePct <= 12 ? "bg-yellow-300" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <div className={cx("h-full rounded-full", color)} style={{ width: `${Math.max(4, (clamped / 40) * 100)}%` }} />
      </div>
      <span className={cx("font-mono text-xs", distancePct <= 5 ? "text-amber-300" : "text-slate-300")}>{distancePct.toFixed(1)}%</span>
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20";
export const labelCls = "mb-1 block text-xs font-medium text-slate-400";

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
