'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { materialize, baseTransactions, allMonths } from '@/lib/data';
import { aggregateByMonth, defaultMonth } from '@/lib/analytics';
import { useLocalStorage, KEYS } from '@/lib/storage';
import { EMPTY_BUDGET } from '@/lib/budget';
import type { Transaction, UserOverrides, BudgetState, RulesState, MerchantRule, Settings } from '@/lib/types';

interface DataCtx {
  /** all transactions after overrides + imports applied */
  txns: Transaction[];
  months: string[];
  /** sensible default month (latest substantial month) */
  defaultMonth: string;
  hydrated: boolean;

  overrides: UserOverrides;
  setOverrides: (u: UserOverrides | ((p: UserOverrides) => UserOverrides)) => void;
  setCategory: (id: string, category: string) => void;
  bulkSetCategory: (descSubstring: string, category: string) => number;
  toggleRealIncome: (id: string) => void;

  imported: Transaction[];
  setImported: (t: Transaction[] | ((p: Transaction[]) => Transaction[])) => void;

  budget: BudgetState;
  setBudget: (b: BudgetState | ((p: BudgetState) => BudgetState)) => void;

  rules: RulesState;
  setRule: (merchant: string, rule: Partial<MerchantRule> | null) => void;
  setRulesAll: (r: RulesState) => void;

  settings: Settings;
  setSettings: (s: Settings | ((p: Settings) => Settings)) => void;

  /** wipe all user-configured state back to defaults */
  resetAll: () => void;
}

const Ctx = createContext<DataCtx | null>(null);

const EMPTY_OVERRIDES: UserOverrides = { categoryById: {}, realIncomeById: {} };
const DEFAULT_SETTINGS: Settings = { excludeMovingTransfers: false, excludeOneOff: false };

export function DataProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides, h1] = useLocalStorage<UserOverrides>(KEYS.overrides, EMPTY_OVERRIDES);
  const [imported, setImported, h2] = useLocalStorage<Transaction[]>(KEYS.imported, []);
  const [budget, setBudget, h3] = useLocalStorage<BudgetState>(KEYS.budget, EMPTY_BUDGET);
  const [rules, setRules, h4] = useLocalStorage<RulesState>(KEYS.rules, {});
  const [settings, setSettings, h5] = useLocalStorage<Settings>(KEYS.settings, DEFAULT_SETTINGS);

  const base = useMemo(() => baseTransactions(), []);
  const txns = useMemo(
    () => materialize(base, imported, overrides, rules),
    [base, overrides, imported, rules],
  );
  const months = useMemo(() => allMonths(txns), [txns]);
  const monthAggs = useMemo(() => aggregateByMonth(txns), [txns]);
  const dMonth = useMemo(() => defaultMonth(monthAggs), [monthAggs]);

  const setCategory = (id: string, category: string) =>
    setOverrides((p) => ({ ...p, categoryById: { ...p.categoryById, [id]: category } }));

  const toggleRealIncome = (id: string) =>
    setOverrides((p) => ({
      ...p,
      realIncomeById: { ...p.realIncomeById, [id]: !p.realIncomeById[id] },
    }));

  const bulkSetCategory = (descSubstring: string, category: string): number => {
    const q = descSubstring.trim().toLowerCase();
    if (!q) return 0;
    const matches = txns.filter(
      (t) => t.desc.toLowerCase().includes(q) || t.merchant.toLowerCase().includes(q),
    );
    if (matches.length === 0) return 0;
    setOverrides((p) => {
      const next = { ...p.categoryById };
      for (const t of matches) next[t.id] = category;
      return { ...p, categoryById: next };
    });
    return matches.length;
  };

  const setRule = (merchant: string, rule: Partial<MerchantRule> | null) =>
    setRules((p) => {
      const next = { ...p };
      if (rule === null) { delete next[merchant]; return next; }
      const merged = { ...next[merchant], merchant, ...rule } as MerchantRule;
      // drop empty rules entirely
      if (!merged.category && (!merged.transferKind || merged.transferKind === 'unknown')) {
        delete next[merchant];
        return next;
      }
      next[merchant] = merged;
      return next;
    });

  const value: DataCtx = {
    txns,
    months,
    defaultMonth: dMonth,
    hydrated: h1 && h2 && h3 && h4 && h5,
    overrides,
    setOverrides,
    setCategory,
    bulkSetCategory,
    toggleRealIncome,
    imported,
    setImported,
    budget,
    setBudget,
    rules,
    setRule,
    setRulesAll: (r: RulesState) => setRules(r),
    settings,
    setSettings,
    resetAll: () => {
      setOverrides(EMPTY_OVERRIDES);
      setBudget(EMPTY_BUDGET);
      setRules({});
      setSettings(DEFAULT_SETTINGS);
      setImported([]);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useData must be used within DataProvider');
  return c;
}
