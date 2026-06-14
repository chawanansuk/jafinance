import { categoryGroup } from '../categories';
import { autoCategorize } from '../autocat';
import type { RawTransaction } from '../types';

// ── pure UOB Premier statement parser ───────────────────────────────────────
// Validated against a real statement: a transaction line looks like
//   "<POST DD MMM> <TRANS DD MMM> <DESCRIPTION ...> <AMOUNT>[ CR]"
// e.g. "23 APR 22 APR WWW.GRAB.COM BANGKOK 138.00"
// Credits (refunds / payments) carry a trailing " CR".

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

const TXN_RE = /^(\d{2}) ([A-Z]{3}) (\d{2}) ([A-Z]{3}) (.+?) ([\d,]+\.\d{2})( CR)?$/;

export interface UobSummary {
  statementDate: string; // YYYY-MM-DD ('' if not found)
  previousBalance: number | null;
  totalBalance: number | null;
  minPayment: number | null;
  payments: number; // sum of "PAYMENT THANK YOU" credits
  parsedNet: number; // purchases - refunds (excludes payments)
  expectedNet: number | null; // totalBalance - previousBalance + payments
  diff: number | null; // parsedNet - expectedNet (fees/interest if non-zero)
  reconciled: boolean;
}

export interface UobParseResult {
  transactions: RawTransaction[];
  summary: UobSummary;
  account: string;
}

const num = (s: string) => Number(s.replace(/,/g, ''));

/** Group parsed transactions into a per-category purchase summary (net of in-bill refunds). */
export function summarizeBill(transactions: RawTransaction[]): {
  byCategory: { category: string; total: number }[];
  purchases: number;
  refunds: number;
  dateFrom: string;
  dateTo: string;
} {
  const map = new Map<string, number>();
  let refunds = 0;
  const dates: string[] = [];
  for (const t of transactions) {
    if (t.date) dates.push(t.date);
    if (t.direction === 'in') { refunds += t.amount; continue; }
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  }
  dates.sort();
  const byCategory = [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  return {
    byCategory,
    purchases: byCategory.reduce((s, r) => s + r.total, 0),
    refunds,
    dateFrom: dates[0] ?? '',
    dateTo: dates[dates.length - 1] ?? '',
  };
}

/** Map a raw UOB description to a normalized merchant name. */
export function normalizeUobMerchant(descRaw: string): string {
  const d = descRaw.toUpperCase();
  if (/GRAB/.test(d)) return 'Grab';
  if (/7-?11|7-ELEVEN/.test(d)) return '7-Eleven';
  if (/FAST FOOD/.test(d)) return 'ร้านอาหาร/ตามสั่ง';
  if (/LOTUS/.test(d)) return 'Lotus';
  if (/SUSHIRO/.test(d)) return 'Sushiro';
  if (/TOPS/.test(d)) return 'Tops';
  if (/WATSONS/.test(d)) return 'Watsons';
  if (/MRT|BEM/.test(d)) return 'MRT';
  if (/BOOKING/.test(d)) return 'Booking.com';
  if (/AIRBNB/.test(d)) return 'Airbnb';
  // fallback: strip terminal/location noise
  return descRaw
    .replace(/^TMN\s+/i, '')
    .replace(/^\d{3,}[-\s]?/, '')
    .replace(/\s+BANGKOK\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || descRaw.trim();
}

function findStatementDate(lines: string[]): string {
  for (const l of lines) {
    const m = l.match(/\b(\d{1,2}) (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\d{4})\b/);
    if (m) {
      const y = Number(m[3]);
      return `${y}-${String(MONTHS[m[2]] + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
  }
  return '';
}

function findCardNumber(lines: string[]): string {
  for (const l of lines) {
    const m = l.match(/\b(\d{4} \d{2}XX XXXX \d{4})\b/);
    if (m) return m[1];
  }
  return '';
}

export function parseUobStatement(lines: string[]): UobParseResult {
  const statementDate = findStatementDate(lines);
  const stmtYear = statementDate ? Number(statementDate.slice(0, 4)) : new Date().getFullYear();
  const stmtMonth = statementDate ? Number(statementDate.slice(5, 7)) - 1 : 11;
  const account = 'UOB บัตรเครดิต';

  let previousBalance: number | null = null;
  let totalBalance: number | null = null;
  let minPayment: number | null = null;
  let payments = 0;
  let debit = 0;
  let credit = 0;
  const transactions: RawTransaction[] = [];

  for (const line of lines) {
    const l = line.trim();

    let m = l.match(/PREVIOUS BALANCE\s+([\d,]+\.\d{2})/i);
    if (m) { previousBalance = num(m[1]); continue; }
    m = l.match(/^TOTAL\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i);
    if (m && totalBalance === null) { totalBalance = num(m[1]); minPayment = num(m[2]); continue; }

    const t = l.match(TXN_RE);
    if (!t) continue;
    const [, , , td, tm, descRaw, amtRaw, cr] = t;
    const tMon = MONTHS[tm];
    if (tMon === undefined) continue;
    const amount = num(amtRaw);
    const desc = descRaw.trim();

    if (/PAYMENT THANK YOU/i.test(desc)) { payments += amount; continue; }

    // year rolls back when the txn month is after the statement month
    const year = tMon > stmtMonth ? stmtYear - 1 : stmtYear;
    const date = `${year}-${String(tMon + 1).padStart(2, '0')}-${td.padStart(2, '0')}`;
    const isCredit = !!cr;
    if (isCredit) credit += amount; else debit += amount;

    const merchant = normalizeUobMerchant(desc);
    const category = isCredit ? 'คืนเงิน (refund)' : autoCategorize(merchant, desc, {}, amount);
    transactions.push({
      date, time: '', account,
      direction: isCredit ? 'in' : 'out',
      amount,
      category,
      group: isCredit ? 'refund' : categoryGroup(category),
      merchant,
      desc,
    });
  }

  const parsedNet = debit - credit;
  const expectedNet = totalBalance !== null && previousBalance !== null
    ? totalBalance - previousBalance + payments
    : null;
  const diff = expectedNet !== null ? parsedNet - expectedNet : null;

  return {
    transactions,
    account: findCardNumber(lines) || account,
    summary: {
      statementDate, previousBalance, totalBalance, minPayment, payments,
      parsedNet, expectedNet, diff,
      reconciled: diff !== null && Math.abs(diff) < 0.05,
    },
  };
}
