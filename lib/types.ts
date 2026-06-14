// ───────────────────────────────────────────────────────────────────────────
// Core data types
// ───────────────────────────────────────────────────────────────────────────

export type Direction = 'in' | 'out';

export type Group =
  | 'essential'
  | 'discretionary'
  | 'transfer'
  | 'income'
  | 'refund';

/** Raw record exactly as stored in data/transactions.json */
export interface RawTransaction {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM ("" for UOB)
  account: string; // "KBank ออมทรัพย์" | "UOB บัตรเครดิต"
  direction: Direction;
  amount: number; // always positive
  category: string;
  group: Group;
  merchant: string;
  desc: string;
}

/**
 * How a transfer-group row should be treated once the user reviews it.
 *   unknown  = not yet reviewed (counts as spending, shown as "ต้องตรวจสอบ")
 *   spending = a real expense
 *   moving   = moving own money / topping up a wallet (NOT spending)
 *   supplier = paying a supplier (a real business expense)
 */
export type TransferKind = 'unknown' | 'spending' | 'moving' | 'supplier';

/** Transaction after assigning a stable id + applying user overrides/rules */
export interface Transaction extends RawTransaction {
  id: string;
  /** category after any user override (falls back to raw category) */
  category: string;
  /** group derived from the (possibly overridden) category */
  group: Group;
  /** true when the user flagged this `in` row as real income (vs. funding) */
  isRealIncome?: boolean;
  /** classification applied to transfer-group rows (by merchant rule) */
  transferKind?: TransferKind;
}

/** A per-merchant rule applied to every matching row (existing + future imports). */
export interface MerchantRule {
  merchant: string;
  /** recategorize matching rows to this category */
  category?: string;
  /** classify transfer-group rows */
  transferKind?: TransferKind;
}

/** merchant -> rule */
export type RulesState = Record<string, MerchantRule>;

/** A saved summary of an imported statement/bill (persisted). */
export interface Statement {
  id: string; // statementDate|account
  account: string;
  statementDate: string;
  dateFrom: string;
  dateTo: string;
  totalBalance: number | null;
  minPayment: number | null;
  purchases: number;
  refunds: number;
  parsedNet: number;
  reconciled: boolean;
  count: number;
  byCategory: { category: string; total: number }[];
  importedAt: string; // ISO
}

/** UI-level toggles that change how spending is summed (persisted). */
export interface Settings {
  /** drop transfers classified as "moving" from spending totals */
  excludeMovingTransfers: boolean;
  /** drop large one-off categories (travel, hospital) to see normal burn-rate */
  excludeOneOff: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// User state (persisted in localStorage)
// ───────────────────────────────────────────────────────────────────────────

export interface UserOverrides {
  /** id -> category name */
  categoryById: Record<string, string>;
  /** id -> true when the user marked this `in` row as real income */
  realIncomeById: Record<string, boolean>;
}

export interface BudgetState {
  /** "YYYY-MM" -> (category -> budget amount). "*" key = applies to every month */
  byMonth: Record<string, Record<string, number>>;
  /** manual monthly income the user types in: "YYYY-MM" -> amount ("*" default) */
  income: Record<string, number>;
  /** optional overall monthly spending ceiling: "YYYY-MM" -> amount ("*" default) */
  ceiling: Record<string, number>;
  /** cross-month savings target the user wants to accumulate */
  savingsGoal?: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Analytics result shapes
// ───────────────────────────────────────────────────────────────────────────

/**
 * A normalized spending event. Refunds are emitted as NEGATIVE signed amounts
 * routed back to their source category (bug #1 fix). Income is excluded.
 */
export interface SpendingEvent {
  id: string;
  date: string;
  month: string; // YYYY-MM
  account: string;
  category: string;
  group: Group;
  merchant: string;
  /** +amount for spending, -amount for a refund netted into the category */
  signed: number;
  isRefundAdjustment: boolean;
  transferKind?: TransferKind;
  /** large/irregular spend (travel, hospital) — excluded by the burn-rate toggle */
  oneOff: boolean;
}

export interface CategoryAgg {
  category: string;
  group: Group;
  total: number; // net (after refunds)
  count: number;
  avg: number;
  share: number; // fraction of grand total
}

export interface MerchantAgg {
  merchant: string;
  total: number;
  count: number;
}

export interface MonthAgg {
  month: string; // YYYY-MM
  total: number; // net spending
  essential: number;
  discretionary: number;
  transfer: number;
  count: number;
  /** true when underlying data for this month is known to be incomplete */
  incomplete: boolean;
}

export interface Projection {
  month: string;
  spentSoFar: number;
  projected: number | null; // null when we refuse to extrapolate
  daysElapsed: number;
  daysInMonth: number;
  reliable: boolean; // false => show "ข้อมูลไม่พอพยากรณ์"
}

export interface RecurringItem {
  merchant: string;
  category: string;
  count: number;
  total: number;
  avgAmount: number;
  cadence: 'รายวัน' | 'รายสัปดาห์' | 'รายเดือน' | 'ไม่แน่นอน';
}

export interface Outlier {
  date: string;
  total: number;
  topMerchant: string;
  zScore: number;
}
