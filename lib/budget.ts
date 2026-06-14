import { aggregateByCategory, aggregateByMonth, toSpendingEvents, SPENDING_GROUPS } from './analytics';
import type { BudgetState, Transaction, CategoryAgg } from './types';

export const EMPTY_BUDGET: BudgetState = { byMonth: {}, income: {}, ceiling: {} };

/** Resolve a value for a month, falling back to the "*" default. */
function resolve(map: Record<string, number> | undefined, month: string, key?: string): number | undefined {
  if (!map) return undefined;
  // budgets are nested per-month-per-category; income/ceiling are flat per month
  return map[month] ?? map['*'];
}

export function getCategoryBudget(state: BudgetState, month: string, category: string): number | undefined {
  const m = state.byMonth[month]?.[category];
  if (m != null) return m;
  return state.byMonth['*']?.[category];
}

export function getIncome(state: BudgetState, month: string): number {
  return resolve(state.income, month) ?? 0;
}

export function getCeiling(state: BudgetState, month: string): number | undefined {
  return resolve(state.ceiling, month);
}

export type BudgetTone = 'safe' | 'warn' | 'over';

export function budgetTone(actual: number, budget: number): BudgetTone {
  if (!budget) return 'safe';
  const pct = actual / budget;
  if (pct >= 1) return 'over';
  if (pct >= 0.8) return 'warn';
  return 'safe';
}

export interface CategoryBudgetRow {
  category: string;
  group: string;
  actual: number;
  budget: number | undefined;
  pct: number; // 0..>1
  tone: BudgetTone;
}

/** actual (net) vs budget per category for a given month. */
export function categoryBudgetRows(
  txns: Transaction[],
  state: BudgetState,
  month: string,
): CategoryBudgetRow[] {
  const events = toSpendingEvents(txns).filter((e) => e.month === month);
  const aggs = aggregateByCategory(events);
  const byCat = new Map<string, CategoryAgg>(aggs.map((a) => [a.category, a]));

  // union of categories that have spend or a budget set
  const cats = new Set<string>(aggs.map((a) => a.category));
  for (const c of Object.keys(state.byMonth[month] ?? {})) cats.add(c);
  for (const c of Object.keys(state.byMonth['*'] ?? {})) cats.add(c);

  const rows: CategoryBudgetRow[] = [];
  for (const category of cats) {
    const actual = byCat.get(category)?.total ?? 0;
    const group = byCat.get(category)?.group ?? 'discretionary';
    const budget = getCategoryBudget(state, month, category);
    const pct = budget ? actual / budget : 0;
    rows.push({ category, group, actual, budget, pct, tone: budgetTone(actual, budget ?? 0) });
  }
  return rows.sort((a, b) => b.actual - a.actual);
}

/**
 * Auto-budget suggestion: average net monthly spend per category across the
 * COMPLETE months only (skips edge-truncated months so the baseline isn't
 * dragged down by partial data).
 */
export function suggestBudgets(txns: Transaction[]): Record<string, number> {
  const months = aggregateByMonth(txns);
  const completeMonths = months.filter((m) => !m.incomplete).map((m) => m.month);
  const usable = completeMonths.length ? completeMonths : months.map((m) => m.month);

  const perCatPerMonth = new Map<string, Map<string, number>>();
  for (const e of toSpendingEvents(txns)) {
    if (!usable.includes(e.month)) continue;
    if (!perCatPerMonth.has(e.category)) perCatPerMonth.set(e.category, new Map());
    const m = perCatPerMonth.get(e.category)!;
    m.set(e.month, (m.get(e.month) ?? 0) + e.signed);
  }
  const out: Record<string, number> = {};
  for (const [cat, byMonth] of perCatPerMonth) {
    const vals = [...byMonth.values()];
    const avg = vals.reduce((a, b) => a + b, 0) / usable.length;
    // round to nearest 100 for a tidy starting budget
    out[cat] = Math.max(0, Math.round(avg / 100) * 100);
  }
  return out;
}

export interface MonthBudgetSummary {
  totalActual: number;
  totalBudget: number;
  remaining: number; // budget - actual
  income: number;
  savings: number; // income - actual
  savingsRate: number; // savings / income
  ceiling: number | undefined;
  remainingPerDayLeft: number | null;
}

export function monthSummary(
  txns: Transaction[],
  state: BudgetState,
  month: string,
  opts: { includeTransfer?: boolean } = {},
): MonthBudgetSummary {
  const events = toSpendingEvents(txns, { includeTransfer: opts.includeTransfer ?? true })
    .filter((e) => e.month === month);
  const totalActual = events.reduce((s, e) => s + e.signed, 0);

  const rows = categoryBudgetRows(txns, state, month);
  const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
  const income = getIncome(state, month);
  const ceiling = getCeiling(state, month);

  const [y, m] = month.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  let lastDay = 0;
  for (const e of events) lastDay = Math.max(lastDay, Number(e.date.slice(8, 10)));
  const daysLeft = Math.max(0, dim - lastDay);
  const budgetForRemaining = ceiling ?? (totalBudget || 0);
  const remainingPerDayLeft =
    daysLeft > 0 && budgetForRemaining ? Math.max(0, (budgetForRemaining - totalActual) / daysLeft) : null;

  return {
    totalActual,
    totalBudget,
    remaining: totalBudget - totalActual,
    income,
    savings: income - totalActual,
    savingsRate: income ? (income - totalActual) / income : 0,
    ceiling,
    remainingPerDayLeft,
  };
}

export { SPENDING_GROUPS };
