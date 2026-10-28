import { cookies } from "next/headers";
import { LogOut, RefreshCw } from "lucide-react";
import { logout, runCheckNow } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Nav } from "@/components/nav";
import { LightPill } from "@/components/ui";
import { MEMBER_COOKIE } from "@/lib/auth";
import { db, isDbConfigured } from "@/lib/db";
import { dateTime } from "@/lib/format";
import type { Light } from "@/lib/types";

export const dynamic = "force-dynamic";

async function headerData() {
  if (!isDbConfigured()) return null;
  try {
    const [alerts, market] = await Promise.all([
      db().from("alerts").select("severity").eq("status", "open"),
      db().from("settings").select("value").eq("key", "market").maybeSingle(),
    ]);
    const list = (alerts.data ?? []) as Array<{ severity: string }>;
    const m = (market.data?.value ?? null) as { light?: Light; checked_at?: string } | null;
    return { open: list.length, exits: list.filter((a) => a.severity === "EXIT").length, light: m?.light ?? null, checkedAt: m?.checked_at ?? null };
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const h = await headerData();
  const who = (await cookies()).get(MEMBER_COOKIE)?.value;
  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
      <aside className="border-b border-white/5 p-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="mb-4 flex items-center gap-3 px-1 lg:mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-900 ring-1 ring-sky-400/30">
            <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden>
              <path d="M14 46 L32 14 L50 46 Z" fill="none" stroke="#38bdf8" strokeWidth="6" strokeLinejoin="round" />
              <circle cx="32" cy="38" r="5" fill="#f43f5e" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Northgate</div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-sky-300/80">AlertGuard</div>
          </div>
        </div>
        <Nav openAlerts={h?.open ?? 0} exitAlerts={h?.exits ?? 0} />
        <div className="mt-8 hidden space-y-2 px-1 text-xs text-slate-500 lg:block">
          <p>QVM Compass · WInS (StockTrak)</p>
          {who && <p>Signed in as <span className="text-slate-300">{who}</span></p>}
          <form action={logout}>
            <button className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-white/5 px-4 py-3 lg:px-8">
          {h?.light && <LightPill light={h.light} />}
          <span className="text-xs text-slate-500">Last check: {dateTime(h?.checkedAt)}</span>
          {isDbConfigured() && (
            <ActionForm action={runCheckNow} className="flex flex-col items-end" messageClassName="max-w-md text-right">
              <SubmitButton variant="ghost" title="Fetch prices, check every rule and email new alerts">
                <RefreshCw className="h-3.5 w-3.5" /> Run check now
              </SubmitButton>
            </ActionForm>
          )}
        </div>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
