import type { AlertThresholds, StrategyParams } from "./types";

/** Values from QVM Compass Strategy Reference, 23 Oct 2026 (section 6). */
export const DEFAULT_PARAMS: StrategyParams = {
  riskPct: 1.25,
  stopNormal: 25,
  stopVolatile: 30,
  volatileSd: 0.1,
  maxAtCostPct: 6,
  trimAbovePct: 8,
  trimToPct: 6,
  buyQvm: 60,
  pillarMin: 25,
  sellQvm: 35,
  premiumPts: 3.5,
  maDays: 200,
  sectorMaxPct: 30,
  maxPerIndustry: 2,
  maxPerTheme: 3,
  numStocks: 15,
  swapGap: 15,
  valuationHalfPts: 1,
  valuationAllPts: 0,
  phase2Start: "2031-01-01",
  priceDriftPct: 2,
  earningsWindowDays: 5,
  rebuyLockoutMonths: 3,
  minPrice: 3,
};

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  dailyDipPct: 4,
  drawdownPct: 10,
  stopWarnPct: 5,
  indexDipPct: 2,
};

export interface ParamMeta {
  key: keyof StrategyParams;
  id: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  fixed?: boolean;
  unit?: string;
}

/** Allowed ranges from section 6. Changes outside these ranges are refused. */
export const PARAM_META: ParamMeta[] = [
  { key: "buyQvm", id: "P5", label: "Buy score: minimum QVM", min: 55, max: 70, step: 1 },
  { key: "pillarMin", id: "P5", label: "Buy score: minimum per pillar", min: 20, max: 30, step: 1 },
  { key: "sellQvm", id: "P6", label: "Sell score: QVM below", min: 30, max: 40, step: 1 },
  { key: "premiumPts", id: "P7", label: "Premium over 10y Treasury", min: 3, max: 5, step: 0.25, unit: "pts" },
  { key: "maDays", id: "P9", label: "Trend filter (moving-average days)", min: 150, max: 250, step: 1, unit: "days" },
  { key: "riskPct", id: "P10", label: "Risk per stock (% of growth money)", min: 0.75, max: 1.25, step: 0.05, unit: "%" },
  { key: "stopNormal", id: "P11", label: "Hard stop, normal", min: 20, max: 35, step: 1, unit: "%" },
  { key: "stopVolatile", id: "P11", label: "Hard stop, volatile", min: 20, max: 35, step: 1, unit: "%" },
  { key: "maxAtCostPct", id: "P12", label: "Position cap at cost", min: 5, max: 10, step: 0.5, unit: "%" },
  { key: "trimAbovePct", id: "P12", label: "Trim when position above", min: 5, max: 10, step: 0.5, unit: "%" },
  { key: "trimToPct", id: "P12", label: "Trim back to", min: 5, max: 10, step: 0.5, unit: "%" },
  { key: "sectorMaxPct", id: "P13", label: "Sector limit (share of stock money)", min: 25, max: 35, step: 1, unit: "%" },
  { key: "numStocks", id: "P14", label: "Number of stocks", min: 6, max: 20, step: 1 },
  { key: "swapGap", id: "P15", label: "Swap margin (QVM points)", min: 10, max: 20, step: 1 },
  { key: "valuationHalfPts", id: "P16", label: "Valuation exit: sell half below Treasury +", min: 0, max: 2, step: 0.25, unit: "pts" },
  { key: "valuationAllPts", id: "P16", label: "Valuation exit: sell all below Treasury +", min: 0, max: 2, step: 0.25, unit: "pts" },
];

export function mergeParams(stored: unknown): StrategyParams {
  return { ...DEFAULT_PARAMS, ...(isObject(stored) ? (stored as Partial<StrategyParams>) : {}) };
}

export function mergeThresholds(stored: unknown): AlertThresholds {
  return { ...DEFAULT_THRESHOLDS, ...(isObject(stored) ? (stored as Partial<AlertThresholds>) : {}) };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Returns an error message, or null when the value is inside the allowed range. */
export function validateParamChange(key: keyof StrategyParams, value: number): string | null {
  const meta = PARAM_META.find((m) => m.key === key);
  if (!meta) return `Unknown parameter ${String(key)}`;
  if (!Number.isFinite(value)) return "Value must be a number";
  if (meta.min !== undefined && value < meta.min) return `${meta.id} must be at least ${meta.min}`;
  if (meta.max !== undefined && value > meta.max) return `${meta.id} must be at most ${meta.max}`;
  return null;
}
