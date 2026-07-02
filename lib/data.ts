import raw from '@/data/transactions.json';
import { categoryGroup } from './categories';
import { refineCategory } from './autocat';
import type { RawTransaction, Transaction, UserOverrides, RulesState } from './types';

/** Stable id from immutable fields so overrides survive re-ordering/import. */
export function makeId(t: RawTransaction): string {
  const key = `${t.date}|${t.time}|${t.account}|${t.direction}|${t.amount}|${t.merchant}|${t.desc}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return 't' + (h >>> 0).toString(36);
}

/**
 * Key for de-duplication across import sources. Deliberately EXCLUDES the
 * `merchant` field, which is a derived/normalized value that can differ between
 * import paths (e.g. base data normalizes "SHELL 1078F..." to "Shell" while the
 * PDF importer keeps the raw text). `desc` is the stable raw statement text.
 */
export function dedupKey(t: RawTransaction): string {
  return `${t.date}|${t.time}|${t.account}|${t.direction}|${t.amount}|${t.desc}`;
}

/**
 * Cleanup for imported rows that re-state transactions already present in the
 * base dataset (e.g. importing a statement for a month the seed data already
 * covers). Matches on the HARD fields only (date+time+account+direction+amount)
 * — ignoring desc and the derived merchant — and removes ANY imported row whose
 * key exists in base. Imported rows with no base match (genuinely new months)
 * are kept.
 */
export function dropBaseDuplicates(imported: Transaction[], base: Transaction[]): Transaction[] {
  const hk = (t: RawTransaction) => `${t.date}|${t.time}|${t.account}|${t.direction}|${t.amount}`;
  const baseKeys = new Set(base.map(hk));
  return imported.filter((t) => !baseKeys.has(hk(t)));
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
 * Materialize the working transaction list from base + imports, then layer:
 *   1. merchant rules  (apply to ALL matching rows, incl. future imports)
 *   2. per-id overrides (more specific — win over rules)
 * Group is re-derived from the resulting category; transferKind is attached
 * from the matching merchant rule.
 */
export function materialize(
  base: Transaction[],
  imported: Transaction[] = [],
  overrides: UserOverrides = EMPTY_OVERRIDES,
  rules: RulesState = {},
): Transaction[] {
  const all = imported.length ? [...base, ...imported] : base;
  return all.map((t) => {
    const rule = rules[t.merchant];
    const idCat = overrides.categoryById[t.id];
    const ruleCat = rule?.category;
    // explicit user choices (id override / merchant rule) win; otherwise apply
    // the amount-aware refinement (e.g. Grab rides < ฿120 -> transport).
    let category = idCat ?? ruleCat ?? t.category;
    if (!idCat && !ruleCat) category = refineCategory(t.merchant, t.desc, category, t.amount);
    const isRealIncome = overrides.realIncomeById[t.id] ?? false;
    const transferKind = rule?.transferKind;
    if (category === t.category && !isRealIncome && !transferKind) return t;
    return {
      ...t,
      category,
      group: category === t.category ? t.group : categoryGroup(category),
      isRealIncome,
      transferKind,
    };
  });
}

/** @deprecated use materialize — kept for callers that only pass overrides. */
export function applyOverrides(
  base: Transaction[],
  overrides: UserOverrides = EMPTY_OVERRIDES,
  imported: Transaction[] = [],
): Transaction[] {
  return materialize(base, imported, overrides, {});
}

export function allMonths(txns: Transaction[]): string[] {
  return [...new Set(txns.map((t) => t.date.slice(0, 7)))].sort();
}

export const ACCOUNTS = ['KBank ออมทรัพย์', 'UOB บัตรเครดิต'] as const;

// KBank coverage windows (from the source statements). Feeds ACCOUNT_COVERAGE
// below, which drives the month-completeness flag in analytics.
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
  ['2026-06-12', '2026-06-18'],
  ['2026-06-19', '2026-06-26'],
];

// UOB card statements run continuously over this window.
export const UOB_RANGES: [string, string][] = [['2026-02-20', '2026-05-20']];

/**
 * Per-account statement coverage. A month's completeness must consider BOTH
 * accounts: June 2026 has near-full KBank coverage but ZERO UOB data, so its
 * total is missing most of the household's spending — a "days with any
 * transaction" heuristic can't see that. Analytics weights each account by its
 * share of total spend when deciding whether a month is complete.
 */
export const ACCOUNT_COVERAGE: Record<string, [string, string][]> = {
  'KBank ออมทรัพย์': KBANK_RANGES,
  'UOB บัตรเครดิต': UOB_RANGES,
};
