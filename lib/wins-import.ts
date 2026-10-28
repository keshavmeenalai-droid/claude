/**
 * Parser for WInS (StockTrak) "Open Positions" data. Accepts a CSV export or a
 * table copied from the WInS web page (tab separated). Column names are matched
 * loosely because the export layout differs between StockTrak versions.
 */

export interface ImportRow {
  symbol: string;
  name: string | null;
  quantity: number;
  avgCost: number | null;
  lastPrice: number | null;
  currency: string | null;
  exchange: string | null;
  line: number;
}

export interface ImportResult {
  rows: ImportRow[];
  skipped: Array<{ line: number; reason: string; text: string }>;
  columns: Record<string, string | null>;
  error: string | null;
}

const COLS: Record<string, RegExp[]> = {
  symbol: [/^symbol$/, /^ticker$/, /^sym$/, /symbol/, /ticker/],
  name: [/^description$/, /^name$/, /company/, /security/, /description/],
  quantity: [/^quantity$/, /^qty$/, /^shares$/, /^units$/, /quantity/, /shares/, /position/],
  avgCost: [/price paid/, /avg.*(price|cost)/, /average.*(price|cost)/, /cost.*(per|\/)\s*share/, /purchase price/, /unit cost/, /^cost$/, /^paid$/],
  totalCost: [/cost basis/, /total cost/, /^cost value$/],
  lastPrice: [/last price/, /current price/, /market price/, /^last$/, /^price$/, /^close$/],
  currency: [/^currency$/, /^ccy$/, /currency/],
  exchange: [/^exchange$/, /^market$/, /exchange/],
};

export function parseNumber(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "—" || /^n\/?a$/i.test(s)) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[A-Za-z$€£¥₹\s%]/g, "");
  // 1.234,56 (European) → 1234.56 ; 1,234.56 → 1234.56
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

function splitLine(line: string, delim: string): string[] {
  if (delim === "\t") return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 10).join("\n");
  const counts: Array<[string, number]> = [
    ["\t", (sample.match(/\t/g) ?? []).length],
    [",", (sample.match(/,/g) ?? []).length],
    [";", (sample.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function findColumn(headers: string[], key: string, taken: Set<number>): number {
  for (const re of COLS[key]) {
    const idx = headers.findIndex((h, i) => !taken.has(i) && re.test(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Bonds and cash are part of the reserve / cash balance, not the stock book. */
function looksLikeBondOrCash(symbol: string, name: string | null): boolean {
  const s = symbol.toUpperCase();
  if (/^(CASH|USD|MONEY MARKET)$/.test(s)) return true;
  if (/^[0-9]{3}[0-9A-Z]{5}[0-9]$/.test(s) && /[A-Z]/.test(s)) return true; // CUSIP like 912810TM0
  return !!name && /\b(treasury|t-bond|t-note|bond|note)\b/i.test(name) && !/etf|ishares|fund/i.test(name);
}

export function parseWinsPositions(input: string): ImportResult {
  const lines = input.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  const empty: ImportResult = { rows: [], skipped: [], columns: {}, error: null };
  if (lines.length < 2) return { ...empty, error: "Paste the header row and at least one position." };
  const delim = detectDelimiter(lines);

  // Header = first line among the first 10 that contains a symbol column and a quantity column.
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const h = splitLine(lines[i], delim).map((c) => c.toLowerCase().replace(/\s+/g, " ").trim());
    const t = new Set<number>();
    if (findColumn(h, "symbol", t) >= 0 && findColumn(h, "quantity", t) >= 0) {
      headerIdx = i;
      headers = h;
      break;
    }
  }
  if (headerIdx < 0) return { ...empty, error: "Could not find a header row with a Symbol and a Quantity column." };

  const taken = new Set<number>();
  const idx: Record<string, number> = {};
  for (const key of ["symbol", "quantity", "totalCost", "avgCost", "lastPrice", "currency", "exchange", "name"]) {
    const i = findColumn(headers, key, taken);
    idx[key] = i;
    if (i >= 0) taken.add(i);
  }
  const columns: Record<string, string | null> = {};
  for (const [k, i] of Object.entries(idx)) columns[k] = i >= 0 ? headers[i] : null;

  const rows: ImportRow[] = [];
  const skipped: ImportResult["skipped"] = [];
  for (let li = headerIdx + 1; li < lines.length; li++) {
    const cells = splitLine(lines[li], delim);
    const symbol = (cells[idx.symbol] ?? "").replace(/\s+/g, "").toUpperCase();
    const name = idx.name >= 0 ? cells[idx.name] || null : null;
    if (!symbol) {
      skipped.push({ line: li + 1, reason: "No symbol", text: lines[li].slice(0, 80) });
      continue;
    }
    if (/^(TOTAL|TOTALS|SUBTOTAL)/.test(symbol)) continue;
    if (looksLikeBondOrCash(symbol, name)) {
      skipped.push({ line: li + 1, reason: "Bond or cash line (reserve is tracked separately)", text: lines[li].slice(0, 80) });
      continue;
    }
    const quantity = parseNumber(cells[idx.quantity]);
    if (quantity === null || quantity <= 0) {
      skipped.push({ line: li + 1, reason: "Quantity missing or not positive", text: lines[li].slice(0, 80) });
      continue;
    }
    let avgCost = idx.avgCost >= 0 ? parseNumber(cells[idx.avgCost]) : null;
    if ((avgCost === null || avgCost <= 0) && idx.totalCost >= 0) {
      const total = parseNumber(cells[idx.totalCost]);
      avgCost = total !== null && total > 0 ? total / quantity : null;
    }
    rows.push({
      symbol,
      name,
      quantity,
      avgCost: avgCost !== null && avgCost > 0 ? Math.round(avgCost * 10000) / 10000 : null,
      lastPrice: idx.lastPrice >= 0 ? parseNumber(cells[idx.lastPrice]) : null,
      currency: idx.currency >= 0 ? (cells[idx.currency] || "").toUpperCase() || null : null,
      exchange: idx.exchange >= 0 ? cells[idx.exchange] || null : null,
      line: li + 1,
    });
  }
  return { rows, skipped, columns, error: rows.length ? null : "No positions found under the header row." };
}

/** Match an imported symbol to a known instrument ticker (ignores exchange suffixes like .TO). */
export function matchTicker(symbol: string, known: Array<{ ticker: string; yahoo_symbol: string }>): string | null {
  const s = symbol.toUpperCase();
  const base = s.replace(/[.:-][A-Z]{1,3}$/, "");
  for (const k of known) {
    if (k.ticker.toUpperCase() === s || k.yahoo_symbol.toUpperCase() === s) return k.ticker;
  }
  for (const k of known) {
    if (k.ticker.toUpperCase() === base) return k.ticker;
  }
  return null;
}
