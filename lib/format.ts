export function usd(n: number | null | undefined, dp = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${n < 0 ? "−" : ""}$${s}`;
}

export function money(n: number | null | undefined, ccy: string, dp = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (ccy === "USD") return usd(n, dp);
  const s = n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${ccy} ${s}`;
}

export function pct(n: number | null | undefined, dp = 1, signed = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = Math.abs(n).toFixed(dp);
  return `${n > 0 && signed ? "+" : n < 0 ? "−" : ""}${s}%`;
}

export function num(n: number | null | undefined, dp = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function dateTime(iso: string | null | undefined, timeZone = "Asia/Kolkata"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short" });
}

export function tone(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return "text-slate-300";
  return n > 0 ? "text-emerald-400" : "text-rose-400";
}
