"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, Briefcase, LayoutDashboard, ListChecks, Rocket, Settings, Users } from "lucide-react";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/alerts", label: "Alerts", icon: Bell, badge: true },
  { href: "/positions", label: "Positions", icon: Briefcase },
  { href: "/pipeline", label: "New trades", icon: Rocket },
  { href: "/trades", label: "Trades & WInS import", icon: ListChecks },
  { href: "/team", label: "Team & tasks", icon: Users },
  { href: "/strategy", label: "Strategy", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav({ openAlerts, exitAlerts }: { openAlerts: number; exitAlerts: number }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {ITEMS.map(({ href, label, icon: Icon, badge }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
              active ? "bg-sky-500/10 text-sky-200 ring-1 ring-sky-500/20" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="whitespace-nowrap">{label}</span>
            {badge && openAlerts > 0 && (
              <span className={cx("ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold", exitAlerts > 0 ? "bg-rose-500 text-white" : "bg-amber-500/80 text-ink-950")}>{openAlerts}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
