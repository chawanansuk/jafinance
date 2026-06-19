import { categoryGroup } from '../categories';
import { autoCategorize } from '../autocat';
import type { RawTransaction } from '../types';

// ── pure KBank (K-DEPOSIT) savings statement parser ─────────────────────────
// A reconstructed row looks like:
//   "12-06-26 17:37 ชำระเงิน 507.00 2,608.22 MAKE by KBank เพื่อชำระ Ref X3115 อร่อยแซงคิว"
//   <DD-MM-YY> <HH:MM> <TYPE> <AMOUNT> <BALANCE> <CHANNEL ... DETAIL>
// Withdrawals (ชำระเงิน/โอนเงิน/ถอนเงิน) are money out; deposits
// (รับโอนเงิน/ฝากเงิน/ดอกเบี้ย) are money in. Control totals (รวมถอนเงิน /
// รวมฝากเงิน) are used to reconcile.

const ROW_RE = /^(\d{2})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2})\s+(\S+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*(.*)$/;
const IN_TYPES = ['รับโอน', 'ฝาก', 'ดอกเบี้ย', 'เงินเข้า', 'คืนเงิน'];

const num = (s: string) => Number(s.replace(/,/g, ''));

export interface KbankSummary {
  account: string;
  period: string;
  openingBalance: number | null;
  closingBalance: number | null;
  controlOut: number | null;
  controlIn: number | null;
  parsedOut: number;
  parsedIn: number;
  reconciled: boolean;
  diffOut: number | null;
  diffIn: number | null;
}

export interface KbankParseResult {
  transactions: RawTransaction[];
  account: string;
  summary: KbankSummary;
}

/** Heuristic merchant from a KBank detail string. */
function kbankMerchant(desc: string): string {
  let s = desc
    .replace(/^MAKE by KBank\s*/i, '')
    .replace(/^Internet\/Mobile\s*\w*\s*/i, '')
    .replace(/^เพื่อชำระ\s+Ref\s+\S+\s*/i, '')
    .replace(/^โอนไป\s+พร้อมเพย์\s+\S+\s*/i, '')
    .replace(/^โอนไป\s+\S+\s*/i, '')
    .replace(/^จาก\s+\S+\s+\S+\s*/i, '')
    .replace(/\+\+$/, '')
    .trim();
  return (s || desc).slice(0, 40).trim();
}

function classify(type: string, desc: string, amount: number): { direction: 'in' | 'out'; category: string } {
  const isIn = IN_TYPES.some((k) => type.includes(k));
  if (isIn) return { direction: 'in', category: 'รายรับ (เงินเข้า)' };
  if (/ถอน/.test(type)) return { direction: 'out', category: 'ถอนเงินสด' };
  if (/โอน|พร้อมเพย์/.test(type) || /โอนไป|พร้อมเพย์/.test(desc)) return { direction: 'out', category: 'โอนเงิน/บุคคล' };
  // payment: try keyword auto-categorize, else "other"
  const cat = autoCategorize(kbankMerchant(desc), desc, {}, amount);
  return { direction: 'out', category: cat };
}

export function parseKbankStatement(lines: string[]): KbankParseResult {
  const account = 'KBank ออมทรัพย์';
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let controlOut: number | null = null;
  let controlIn: number | null = null;
  let period = '';

  for (const raw of lines) {
    const l = raw.trim();
    let m = l.match(/ยอดยกมา.*?([\d,]+\.\d{2})/);
    if (m && openingBalance === null) openingBalance = num(m[1]);
    m = l.match(/ยอดยกไป.*?([\d,]+\.\d{2})/);
    if (m) closingBalance = num(m[1]);
    // "รวมถอนเงิน 20 รายการ 2,922.25" — skip the count, take the decimal total
    m = l.match(/รวมถอนเงิน.*?([\d,]+\.\d{2})/);
    if (m) controlOut = num(m[1]);
    m = l.match(/รวมฝากเงิน.*?([\d,]+\.\d{2})/);
    if (m) controlIn = num(m[1]);
    m = l.match(/(\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4})/);
    if (m && !period) period = m[1];
  }

  const transactions: RawTransaction[] = [];
  let parsedOut = 0;
  let parsedIn = 0;
  for (const raw of lines) {
    const m = raw.trim().match(ROW_RE);
    if (!m) continue;
    const [, dd, mm, yy, time, type, amtRaw, , descRaw] = m;
    const amount = num(amtRaw);
    if (!amount) continue;
    const date = `20${yy}-${mm}-${dd}`;
    const desc = (descRaw || type).trim();
    const { direction, category } = classify(type, desc, amount);
    if (direction === 'in') parsedIn += amount; else parsedOut += amount;
    transactions.push({
      date, time, account, direction, amount,
      category, group: categoryGroup(category),
      merchant: kbankMerchant(desc), desc,
    });
  }

  const diffOut = controlOut !== null ? parsedOut - controlOut : null;
  const diffIn = controlIn !== null ? parsedIn - controlIn : null;
  const reconciled =
    (diffOut === null || Math.abs(diffOut) < 0.05) &&
    (diffIn === null || Math.abs(diffIn) < 0.05) &&
    (controlOut !== null || controlIn !== null);

  return {
    transactions,
    account,
    summary: {
      account, period, openingBalance, closingBalance,
      controlOut, controlIn, parsedOut, parsedIn,
      reconciled, diffOut, diffIn,
    },
  };
}
