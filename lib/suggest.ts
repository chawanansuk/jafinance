import type { Transaction } from './types';

/**
 * Suggestions for the manual-entry sheet, derived from the user's own history.
 *
 * Deliberately pure and UI-free so the behaviour is covered by `npm test`
 * rather than only through the component. Everything here reads the already
 * materialized transaction list — no storage, no network.
 */

export interface MerchantSuggestion {
  merchant: string;
  category: string;
  count: number;
  /** median outflow for this merchant — a far better default than the mean,
   *  which one ฿15,000 hotel night would wreck. */
  typical: number;
}

/** Rows that represent a real purchase we can learn a merchant from. */
function spendRows(txns: Transaction[]): Transaction[] {
  return txns.filter((t) => t.direction === 'out' && t.merchant && t.merchant !== '—');
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Merchants ranked by how often they appear, each carrying the category the
 * user most often files it under and a typical amount. Ties break on the
 * larger spend so the more consequential merchant wins a tile.
 */
export function merchantStats(txns: Transaction[]): MerchantSuggestion[] {
  const byMerchant = new Map<string, { amounts: number[]; cats: Map<string, number> }>();
  for (const t of spendRows(txns)) {
    let e = byMerchant.get(t.merchant);
    if (!e) { e = { amounts: [], cats: new Map() }; byMerchant.set(t.merchant, e); }
    e.amounts.push(t.amount);
    e.cats.set(t.category, (e.cats.get(t.category) ?? 0) + 1);
  }
  const rows: MerchantSuggestion[] = [];
  for (const [merchant, e] of byMerchant) {
    let category = 'ค่าใช้จ่ายอื่น';
    let best = -1;
    for (const [c, n] of e.cats) if (n > best) { best = n; category = c; }
    rows.push({
      merchant,
      category,
      count: e.amounts.length,
      typical: Math.round(median(e.amounts)),
    });
  }
  return rows.sort(
    (a, b) => b.count - a.count || b.typical * b.count - a.typical * a.count || a.merchant.localeCompare(b.merchant),
  );
}

/**
 * Charges the bank raises on its own. They can be very frequent (the daily card
 * fee lands 17 times) but nobody ever types one into the add sheet, so they
 * must not take a one-tap tile from a real shop. Type-ahead still finds them.
 */
const AUTO_CHARGE_CATEGORIES = new Set(['ค่าบริการรายวัน (AUD)', 'ชำระบัตรเครดิต']);

/** Top merchants for the one-tap tiles. */
export function frequentMerchants(txns: Transaction[], limit = 6): MerchantSuggestion[] {
  return merchantStats(txns)
    .filter((m) => !AUTO_CHARGE_CATEGORIES.has(m.category))
    .slice(0, limit);
}

/**
 * Type-ahead over the user's merchants. Matches anywhere in the name (Thai
 * has no word boundaries to anchor on) but ranks prefix matches first, then
 * by how often the merchant is used.
 */
export function searchMerchants(txns: Transaction[], query: string, limit = 5): MerchantSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { row: MerchantSuggestion; prefix: boolean }[] = [];
  for (const row of merchantStats(txns)) {
    const name = row.merchant.toLowerCase();
    const at = name.indexOf(q);
    if (at < 0) continue;
    if (name === q) continue; // already typed in full — nothing to complete
    scored.push({ row, prefix: at === 0 });
  }
  scored.sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.row.count - a.row.count);
  return scored.slice(0, limit).map((s) => s.row);
}

/**
 * An existing row that looks like the one being entered. Used to WARN, never
 * to block: two ฿69 7-Eleven runs on one day is ordinary, so the sheet shows
 * the match and lets the user save anyway.
 */
export function findPossibleDuplicate(
  txns: Transaction[],
  draft: { date: string; amount: number; merchant: string; account: string },
): Transaction | null {
  const m = draft.merchant.trim().toLowerCase();
  if (!m || !(draft.amount > 0)) return null;
  return (
    txns.find(
      (t) =>
        t.date === draft.date &&
        t.account === draft.account &&
        Math.abs(t.amount - draft.amount) < 0.005 &&
        t.merchant.trim().toLowerCase() === m,
    ) ?? null
  );
}

/** Amount step buttons, sized to what the user actually spends. */
export function amountSteps(txns: Transaction[]): number[] {
  const rows = spendRows(txns);
  if (rows.length === 0) return [20, 50, 100, 500];
  const mid = median(rows.map((t) => t.amount));
  // keep the ladder recognisable (round, memorable) rather than data-exact
  const LADDERS: number[][] = [
    [10, 20, 50, 100],
    [20, 50, 100, 500],
    [50, 100, 500, 1000],
  ];
  if (mid < 40) return LADDERS[0];
  if (mid < 200) return LADDERS[1];
  return LADDERS[2];
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toHHMM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "วันนี้ / เมื่อวาน / 2 วันก่อน" chips, computed from a reference date. */
export function quickDates(now: Date = new Date()): { label: string; date: string }[] {
  const at = (back: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    return toISODate(d);
  };
  return [
    { label: 'วันนี้', date: at(0) },
    { label: 'เมื่อวาน', date: at(1) },
    { label: '2 วันก่อน', date: at(2) },
  ];
}
