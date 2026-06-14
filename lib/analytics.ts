import { categoryGroup } from './categories';
import type {
  Transaction,
  SpendingEvent,
  CategoryAgg,
  MerchantAgg,
  MonthAgg,
  Projection,
  RecurringItem,
  Outlier,
  Group,
} from './types';

// Groups that count as "spending" for totals. transfer IS included in the
// reconciled net total (53,663 + 83,651 + 33,261 = 170,576) but callers can
// exclude it for "รายจ่ายจริง" views.
export const SPENDING_GROUPS: Group[] = ['essential', 'discretionary', 'transfer'];

// Large/irregular categories treated as one-off for burn-rate purposes.
export const ONE_OFF_CATEGORIES = new Set(['ที่พัก/ท่องเที่ยว', 'โรงพยาบาล/สุขภาพ']);

// Debt-settlement categories that are NEVER spending — paying a credit-card
// bill just settles purchases already counted from the card statement, so
// counting it again would double-count. Always excluded from spending events.
export const SETTLEMENT_CATEGORIES = new Set(['ชำระบัตรเครดิต']);

// Known travel platforms whose refunds must route back to ที่พัก/ท่องเที่ยว.
// (Bug #1: refund rows carry category "คืนเงิน (refund)", not their source.)
const REFUND_STATIC: Record<string, string> = {
  Airbnb: 'ที่พัก/ท่องเที่ยว',
  'Booking.com': 'ที่พัก/ท่องเที่ยว',
};

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Build merchant -> dominant out-category, used to route refunds back. */
function buildMerchantCategory(txns: Transaction[]): Map<string, string> {
  const tally = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (t.direction !== 'out') continue;
    if (!tally.has(t.merchant)) tally.set(t.merchant, new Map());
    const m = tally.get(t.merchant)!;
    m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
  }
  const out = new Map<string, string>();
  for (const [merchant, cats] of tally) {
    let best = '';
    let bestAmt = -1;
    for (const [cat, amt] of cats) {
      if (amt > bestAmt) { best = cat; bestAmt = amt; }
    }
    out.set(merchant, best);
  }
  return out;
}

function resolveRefundCategory(t: Transaction, merchantCat: Map<string, string>): string {
  return REFUND_STATIC[t.merchant] ?? merchantCat.get(t.merchant) ?? 'ที่พัก/ท่องเที่ยว';
}

export interface EventOptions {
  /** keep transfer-group spend (default true). */
  includeTransfer?: boolean;
  account?: 'all' | string;
  /** drop transfers the user classified as "moving" (own money). */
  excludeMovingTransfers?: boolean;
  /** drop large one-off categories (travel, hospital) for burn-rate views. */
  excludeOneOff?: boolean;
}

/**
 * Normalize transactions into signed spending events.
 *   - out               -> +amount in its category
 *   - refund (in)        -> -amount routed to source category (net)
 *   - income / other in  -> excluded (funding, not spending)
 */
export function toSpendingEvents(txns: Transaction[], opts: EventOptions = {}): SpendingEvent[] {
  const { includeTransfer = true, account = 'all', excludeMovingTransfers = false, excludeOneOff = false } = opts;
  const merchantCat = buildMerchantCategory(txns);
  const events: SpendingEvent[] = [];

  for (const t of txns) {
    if (account !== 'all' && t.account !== account) continue;

    if (t.direction === 'out') {
      if (SETTLEMENT_CATEGORIES.has(t.category)) continue; // debt settlement, never spending
      if (!includeTransfer && t.group === 'transfer') continue;
      if (excludeMovingTransfers && t.group === 'transfer' && t.transferKind === 'moving') continue;
      if (excludeOneOff && ONE_OFF_CATEGORIES.has(t.category)) continue;
      events.push({
        id: t.id,
        date: t.date,
        month: monthOf(t.date),
        account: t.account,
        category: t.category,
        group: t.group,
        merchant: t.merchant,
        signed: t.amount,
        isRefundAdjustment: false,
        transferKind: t.transferKind,
        oneOff: ONE_OFF_CATEGORIES.has(t.category),
      });
    } else if (t.group === 'refund') {
      const cat = resolveRefundCategory(t, merchantCat);
      const grp = categoryGroup(cat);
      if (!includeTransfer && grp === 'transfer') continue;
      if (excludeOneOff && ONE_OFF_CATEGORIES.has(cat)) continue;
      events.push({
        id: t.id,
        date: t.date,
        month: monthOf(t.date),
        account: t.account,
        category: cat,
        group: grp,
        merchant: t.merchant,
        signed: -t.amount,
        isRefundAdjustment: true,
        oneOff: ONE_OFF_CATEGORIES.has(cat),
      });
    }
    // income / non-refund `in` rows are funding -> skipped here on purpose.
  }
  return events;
}

/**
 * Estimate fixed (recurring) monthly cost vs variable spend, over the complete
 * months. Recurring monthly-equivalent = total of a recurring series / #months.
 */
export function fixedVsVariable(txns: Transaction[]): { fixed: number; variable: number; items: RecurringItem[] } {
  const months = aggregateByMonth(txns);
  const complete = months.filter((m) => !m.incomplete);
  const nMonths = Math.max(1, complete.length);
  const completeSet = new Set(complete.map((m) => m.month));

  const recurring = detectRecurring(txns).filter((r) => r.cadence !== 'ไม่แน่นอน');
  const recurringKeys = new Set(recurring.map((r) => `${r.merchant}|||${r.category}`));

  let fixed = 0;
  let variable = 0;
  for (const e of toSpendingEvents(txns)) {
    if (!completeSet.has(e.month)) continue;
    const key = `${e.merchant}|||${e.category}`;
    if (recurringKeys.has(key)) fixed += e.signed;
    else variable += e.signed;
  }
  return { fixed: fixed / nMonths, variable: variable / nMonths, items: recurring };
}

export function aggregateByCategory(events: SpendingEvent[]): CategoryAgg[] {
  const map = new Map<string, { total: number; count: number; group: Group }>();
  let grand = 0;
  for (const e of events) {
    const cur = map.get(e.category) ?? { total: 0, count: 0, group: e.group };
    cur.total += e.signed;
    if (!e.isRefundAdjustment) cur.count += 1;
    map.set(e.category, cur);
    grand += e.signed;
  }
  const rows: CategoryAgg[] = [];
  for (const [category, v] of map) {
    rows.push({
      category,
      group: v.group,
      total: v.total,
      count: v.count,
      avg: v.count ? v.total / v.count : 0,
      share: grand ? v.total / grand : 0,
    });
  }
  return rows.sort((a, b) => b.total - a.total);
}

export function aggregateByGroup(events: SpendingEvent[]): Record<Group, number> {
  const out: Record<Group, number> = {
    essential: 0, discretionary: 0, transfer: 0, income: 0, refund: 0,
  };
  for (const e of events) out[e.group] += e.signed;
  return out;
}

/** Distinct calendar days that have any transaction in a month. */
function coverageDays(txns: Transaction[], ym: string): number {
  const days = new Set<string>();
  for (const t of txns) if (monthOf(t.date) === ym) days.add(t.date);
  return days.size;
}

export function aggregateByMonth(txns: Transaction[], opts: EventOptions = {}): MonthAgg[] {
  const events = toSpendingEvents(txns, opts);
  const byMonth = new Map<string, MonthAgg>();
  for (const e of events) {
    const cur =
      byMonth.get(e.month) ??
      ({ month: e.month, total: 0, essential: 0, discretionary: 0, transfer: 0, count: 0, incomplete: false } as MonthAgg);
    cur.total += e.signed;
    if (e.group === 'essential') cur.essential += e.signed;
    else if (e.group === 'discretionary') cur.discretionary += e.signed;
    else if (e.group === 'transfer') cur.transfer += e.signed;
    if (!e.isRefundAdjustment) cur.count += 1;
    byMonth.set(e.month, cur);
  }
  const rows = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  // Mark a month incomplete when the dataset covers < 60% of its days
  // (catches the edge-truncated Feb start & June tail). Bug #3 guard.
  for (const r of rows) {
    const cov = coverageDays(txns, r.month);
    r.incomplete = cov < daysInMonth(r.month) * 0.6;
  }
  return rows;
}

/**
 * Default "current" month: the latest month with a substantial amount of data,
 * so the dashboard never defaults to a near-empty edge month (Bug #3).
 */
export function defaultMonth(months: MonthAgg[]): string {
  if (months.length === 0) return '';
  const totals = months.map((m) => Math.abs(m.total)).filter((t) => t > 0).sort((a, b) => a - b);
  const median = totals.length ? totals[Math.floor(totals.length / 2)] : 0;
  for (let i = months.length - 1; i >= 0; i--) {
    if (Math.abs(months[i].total) >= median * 0.4) return months[i].month;
  }
  return months[months.length - 1].month;
}

export function topMerchants(
  txns: Transaction[],
  opts: { excludeGroups?: Group[]; limit?: number; account?: string } = {},
): MerchantAgg[] {
  // Bug #5: exclude transfer/income/refund so self-transfers (e.g. "ปรารถนา")
  // don't masquerade as favorite merchants.
  const exclude = new Set(opts.excludeGroups ?? ['transfer', 'income', 'refund']);
  const map = new Map<string, MerchantAgg>();
  for (const t of txns) {
    if (t.direction !== 'out') continue;
    if (exclude.has(t.group)) continue;
    if (opts.account && opts.account !== 'all' && t.account !== opts.account) continue;
    const cur = map.get(t.merchant) ?? { merchant: t.merchant, total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    map.set(t.merchant, cur);
  }
  const rows = [...map.values()].sort((a, b) => b.total - a.total);
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

/** Net monthly series for one category (for trend charts). */
export function categoryMonthlyTrend(txns: Transaction[], category: string): { month: string; total: number }[] {
  const events = toSpendingEvents(txns).filter((e) => e.category === category);
  const map = new Map<string, number>();
  for (const e of events) map.set(e.month, (map.get(e.month) ?? 0) + e.signed);
  const allMonths = [...new Set(txns.map((t) => monthOf(t.date)))].sort();
  return allMonths.map((m) => ({ month: m, total: map.get(m) ?? 0 }));
}

/**
 * Project a month's end-of-month spend from current pace. Refuses to
 * extrapolate (reliable=false) when the month is incomplete or too early
 * (Bug #3): projecting June from 3 days would explode.
 */
export function projectMonth(txns: Transaction[], month: string, opts: EventOptions = {}): Projection {
  const events = toSpendingEvents(txns, opts).filter((e) => e.month === month);
  const spentSoFar = events.reduce((s, e) => s + e.signed, 0);
  const dim = daysInMonth(month);

  const daysWithData = new Set(events.map((e) => e.date)).size;
  // last day-of-month with any data == how far the month has "elapsed" for us
  let lastDay = 0;
  for (const e of events) lastDay = Math.max(lastDay, Number(e.date.slice(8, 10)));

  const incomplete = coverageDays(txns, month) < dim * 0.6;
  const reliable = !incomplete && lastDay >= 7 && daysWithData >= 5;
  const projected = reliable ? (spentSoFar / lastDay) * dim : null;

  return { month, spentSoFar, projected, daysElapsed: lastDay, daysInMonth: dim, reliable };
}

/**
 * Detect recurring charges (subscriptions / daily fees). Groups by
 * merchant+category, looks at how regularly they appear.
 */
export function detectRecurring(txns: Transaction[]): RecurringItem[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.direction !== 'out') continue;
    const key = `${t.merchant}|||${t.category}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const items: RecurringItem[] = [];
  for (const [key, list] of groups) {
    if (list.length < 4) continue;
    const dates = [...new Set(list.map((t) => t.date))].sort();
    if (dates.length < 4) continue;
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    let cadence: RecurringItem['cadence'] = 'ไม่แน่นอน';
    if (avgGap <= 2) cadence = 'รายวัน';
    else if (avgGap <= 10) cadence = 'รายสัปดาห์';
    else if (avgGap <= 40) cadence = 'รายเดือน';
    const [merchant, category] = key.split('|||');
    const total = list.reduce((s, t) => s + t.amount, 0);
    items.push({
      merchant, category, count: list.length, total,
      avgAmount: total / list.length, cadence,
    });
  }
  // surface the most "regular" + frequent first
  return items.sort((a, b) => b.count - a.count);
}

/** Days whose total spend is an outlier (z-score) vs the daily distribution. */
export function detectOutliers(txns: Transaction[], opts: EventOptions = {}): Outlier[] {
  const events = toSpendingEvents(txns, opts);
  const byDay = new Map<string, { total: number; merchants: Map<string, number> }>();
  for (const e of events) {
    const cur = byDay.get(e.date) ?? { total: 0, merchants: new Map() };
    cur.total += e.signed;
    cur.merchants.set(e.merchant, (cur.merchants.get(e.merchant) ?? 0) + e.signed);
    byDay.set(e.date, cur);
  }
  const totals = [...byDay.values()].map((d) => d.total);
  if (totals.length < 5) return [];
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const sd = Math.sqrt(totals.reduce((s, t) => s + (t - mean) ** 2, 0) / totals.length) || 1;

  const outliers: Outlier[] = [];
  for (const [date, d] of byDay) {
    const z = (d.total - mean) / sd;
    if (z >= 2.2) {
      let topMerchant = '';
      let top = -Infinity;
      for (const [m, amt] of d.merchants) if (amt > top) { top = amt; topMerchant = m; }
      outliers.push({ date, total: d.total, topMerchant, zScore: z });
    }
  }
  return outliers.sort((a, b) => b.total - a.total);
}

export function grandTotal(events: SpendingEvent[]): number {
  return events.reduce((s, e) => s + e.signed, 0);
}

/** Net spending per day (for the calendar heatmap). */
export function dailySpending(txns: Transaction[], opts: EventOptions = {}): { date: string; total: number }[] {
  const map = new Map<string, number>();
  for (const e of toSpendingEvents(txns, opts)) map.set(e.date, (map.get(e.date) ?? 0) + e.signed);
  return [...map.entries()].map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Average net monthly spend per category over the complete months (for what-if). */
export function avgMonthlyByCategory(txns: Transaction[]): Record<string, number> {
  const months = aggregateByMonth(txns);
  const complete = months.filter((m) => !m.incomplete).map((m) => m.month);
  const usable = complete.length ? complete : months.map((m) => m.month);
  const n = Math.max(1, usable.length);
  const per = new Map<string, number>();
  for (const e of toSpendingEvents(txns)) {
    if (!usable.includes(e.month)) continue;
    per.set(e.category, (per.get(e.category) ?? 0) + e.signed);
  }
  const out: Record<string, number> = {};
  for (const [cat, sum] of per) out[cat] = sum / n;
  return out;
}
