import type { Instrument } from "./types";

export interface TradeInput {
  side: "BUY" | "SELL";
  shares: number;
  price: number; // local currency
  fxUsd: number; // USD per unit of local currency
  commissionUsd: number;
  date: string;
  sellReason?: string | null; // X1..X8 or other
}

export interface TradeEffect {
  patch: Partial<Instrument>;
  cashDeltaUsd: number;
  realizedPnlUsd: number | null;
}

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** Effect of one trade on a position and on cash. Throws on impossible trades. */
export function applyTrade(inst: Pick<Instrument, "shares" | "avg_cost" | "status" | "opened_at">, t: TradeInput, lockoutMonths: number): TradeEffect {
  if (!(t.shares > 0) || !Number.isFinite(t.shares)) throw new Error("Shares must be a positive number");
  if (!Number.isInteger(t.shares)) throw new Error("WInS does not allow fractional shares");
  if (!(t.price > 0) || !Number.isFinite(t.price)) throw new Error("Price must be a positive number");
  if (!(t.fxUsd > 0)) throw new Error("FX rate must be positive");
  if (t.commissionUsd < 0) throw new Error("Commission cannot be negative");
  const held = inst.status === "held" ? inst.shares : 0;

  if (t.side === "BUY") {
    const newShares = held + t.shares;
    const oldCost = held * (inst.avg_cost ?? 0);
    const avg = (oldCost + t.shares * t.price) / newShares;
    return {
      patch: {
        status: "held",
        shares: newShares,
        avg_cost: Math.round(avg * 10000) / 10000,
        // A new or second-half buy needs a new stop for all shares at avg cost × (1 − stop%).
        stop_price: null,
        opened_at: inst.status === "held" && inst.opened_at ? inst.opened_at : t.date,
        lockout_until: null,
      },
      cashDeltaUsd: -(t.shares * t.price * t.fxUsd + t.commissionUsd),
      realizedPnlUsd: null,
    };
  }

  if (t.shares > held) throw new Error(`Cannot sell ${t.shares}: only ${held} held`);
  const remaining = held - t.shares;
  const realized = (t.price - (inst.avg_cost ?? t.price)) * t.shares * t.fxUsd - t.commissionUsd;
  const lockout = t.sellReason === "X4" || t.sellReason === "X5" ? addMonths(t.date, lockoutMonths) : null;
  const patch: Partial<Instrument> =
    remaining === 0
      ? { status: "sold", shares: 0, stop_price: null, thesis_broken: false, lockout_until: lockout, opened_at: null }
      : { shares: remaining, stop_price: null, ...(lockout ? { lockout_until: lockout } : {}) };
  return { patch, cashDeltaUsd: t.shares * t.price * t.fxUsd - t.commissionUsd, realizedPnlUsd: Math.round(realized * 100) / 100 };
}
