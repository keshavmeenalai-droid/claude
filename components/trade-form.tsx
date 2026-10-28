"use client";

import { useState } from "react";
import { recordTrade } from "@/app/actions";
import { ActionForm, SubmitButton } from "./forms";
import { Field, inputCls } from "./ui";

export function TradeForm({
  tickers,
  defaultTicker,
  defaultSide = "BUY",
  defaultShares,
  today,
}: {
  tickers: Array<{ ticker: string; ccy: string }>;
  defaultTicker?: string;
  defaultSide?: "BUY" | "SELL";
  defaultShares?: number | null;
  today: string;
}) {
  const [side, setSide] = useState<"BUY" | "SELL">(defaultSide);
  const [ticker, setTicker] = useState(defaultTicker ?? tickers[0]?.ticker ?? "");
  const ccy = tickers.find((t) => t.ticker === ticker)?.ccy ?? "USD";
  return (
    <ActionForm action={recordTrade} resetOnSuccess className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Field label="Ticker">
        <select name="ticker" className={inputCls} value={ticker} onChange={(e) => setTicker(e.target.value)}>
          {tickers.map((t) => (
            <option key={t.ticker} value={t.ticker}>{t.ticker}</option>
          ))}
        </select>
      </Field>
      <Field label="Side">
        <select name="side" className={inputCls} value={side} onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
      </Field>
      <Field label="Shares">
        <input name="shares" type="number" min={1} step={1} required defaultValue={defaultShares ?? undefined} className={inputCls} />
      </Field>
      <Field label={`Fill price (${ccy})`}>
        <input name="price" type="number" min={0} step="any" required className={inputCls} />
      </Field>
      <Field label="Trade date">
        <input name="date" type="date" defaultValue={today} className={inputCls} />
      </Field>
      <Field label="Commission (USD)">
        <input name="commission" type="number" min={0} step="any" defaultValue={25} className={inputCls} />
      </Field>
      {side === "SELL" ? (
        <Field label="Sell rule">
          <select name="reason" className={inputCls} defaultValue="">
            <option value="">— choose —</option>
            <option value="X1">X1 thesis break</option>
            <option value="X2">X2 score decay</option>
            <option value="X3">X3 valuation</option>
            <option value="X4">X4 hard stop (3-month lockout)</option>
            <option value="X5">X5 trend break (3-month lockout)</option>
            <option value="X6">X6 trim</option>
            <option value="X7">X7 swap</option>
            <option value="X8">X8 glide path</option>
          </select>
        </Field>
      ) : (
        <div />
      )}
      <Field label="Note">
        <input name="note" className={inputCls} placeholder="optional" />
      </Field>
      <div className="col-span-2 md:col-span-4">
        <SubmitButton variant={side === "BUY" ? "success" : "danger"}>Record {side}</SubmitButton>
      </div>
    </ActionForm>
  );
}
