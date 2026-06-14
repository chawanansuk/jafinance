import raw from '@/data/transactions.json';
import { categoryGroup } from './categories';
import type { RawTransaction, Transaction, UserOverrides } from './types';

/** Stable id from immutable fields so overrides survive re-ordering/import. */
export function makeId(t: RawTransaction): string {
  const key = `${t.date}|${t.time}|${t.account}|${t.direction}|${t.amount}|${t.merchant}|${t.desc}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return 't' + (h >>> 0).toString(36);
}

let cachedBase: Transaction[] | null = null;

/** The canonical, reconciled dataset with ids assigned. Never mutated. */
export function baseTransactions(): Transaction[] {
  if (cachedBase) return cachedBase;
  const seen = new Map<string, number>();
  cachedBase = (raw as RawTransaction[]).map((t) => {
    let id = makeId(t);
    // disambiguate genuine same-key repeats (Bug #2: these are REAL distinct
    // rows — e.g. 2 Grab rides of ฿100 — so we keep them, just give unique ids).
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n > 0) id = `${id}_${n}`;
    return { ...t, id };
  });
  return cachedBase;
}

const EMPTY_OVERRIDES: UserOverrides = { categoryById: {}, realIncomeById: {} };

/**
 * Apply user overrides on top of a base list. Returns a new array; group is
 * re-derived from the (possibly overridden) category.
 */
export function applyOverrides(
  base: Transaction[],
  overrides: UserOverrides = EMPTY_OVERRIDES,
  imported: Transaction[] = [],
): Transaction[] {
  const all = imported.length ? [...base, ...imported] : base;
  return all.map((t) => {
    const newCat = overrides.categoryById[t.id];
    const category = newCat ?? t.category;
    const group = newCat ? categoryGroup(category) : t.group;
    const isRealIncome = overrides.realIncomeById[t.id] ?? false;
    if (!newCat && !isRealIncome) return t;
    return { ...t, category, group, isRealIncome };
  });
}

export function allMonths(txns: Transaction[]): string[] {
  return [...new Set(txns.map((t) => t.date.slice(0, 7)))].sort();
}

export const ACCOUNTS = ['KBank ออมทรัพย์', 'UOB บัตรเครดิต'] as const;

// KBank coverage windows (from the source statements). Used for the
// "ดูเฉพาะช่วงข้อมูลครบ" filter and the data disclaimer.
export const KBANK_RANGES: [string, string][] = [
  ['2026-03-20', '2026-03-25'],
  ['2026-04-01', '2026-04-05'],
  ['2026-04-06', '2026-04-18'],
  ['2026-04-19', '2026-04-23'],
  ['2026-04-24', '2026-04-30'],
  ['2026-05-10', '2026-05-18'],
  ['2026-05-19', '2026-05-21'],
  ['2026-05-22', '2026-05-25'],
  ['2026-05-31', '2026-06-04'],
];
