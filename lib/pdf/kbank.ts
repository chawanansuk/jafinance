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

// Date/time separators are intentionally loose: the clean PDF-text path emits
// "12-06-26 17:37", but OCR of a photo often renders the same cell as
// "12/06/26 17.37" (or with dots). Accept -, /, . (and spaced) so a noisy scan
// still parses into the same row shape.
const ROW_RE =
  /^(\d{2})[-/. ](\d{2})[-/. ](\d{2})\s+(\d{1,2})[:.](\d{2})\s+(\S+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*(.*)$/;
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
  /** where row amounts came from: the amount column, or reconstructed from the
   *  running-balance column when the amount column failed to reconcile. */
  amountSource: 'column' | 'balance';
}

export interface KbankParseResult {
  transactions: RawTransaction[];
  account: string;
  summary: KbankSummary;
}

/** Heuristic merchant from a KBank detail string. */
export function kbankMerchant(desc: string): string {
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

export function classifyKbank(type: string, desc: string, amount: number): { direction: 'in' | 'out'; category: string } {
  const isIn = IN_TYPES.some((k) => type.includes(k));
  if (isIn) return { direction: 'in', category: 'รายรับ (เงินเข้า)' };
  if (/ถอน/.test(type)) return { direction: 'out', category: 'ถอนเงินสด' };
  if (/โอน|พร้อมเพย์/.test(type) || /โอนไป|พร้อมเพย์/.test(desc)) return { direction: 'out', category: 'โอนเงิน/บุคคล' };
  // payment: try keyword auto-categorize, else "other"
  const cat = autoCategorize(kbankMerchant(desc), desc, {}, amount);
  return { direction: 'out', category: cat };
}

/**
 * Recover row amounts from the running-balance column. Each real transaction
 * moves the balance by exactly its amount, so |balance[i] - balance[i-1]| is the
 * amount even when the amount column itself was misread by OCR. The keyword-based
 * direction is authoritative; if a balance reading disagrees with it (the balance
 * was the misread cell), that row keeps its amount-column value and the chain
 * continues from the implied balance instead.
 */
function reconstructFromBalance(
  rows: { direction: 'in' | 'out'; amtCol: number; balance: number }[],
  opening: number | null,
): number[] {
  let prev = opening;
  if (prev === null && rows.length) {
    const r0 = rows[0];
    prev = r0.balance - (r0.direction === 'in' ? r0.amtCol : -r0.amtCol);
  }
  const out: number[] = [];
  for (const r of rows) {
    const sign = r.direction === 'in' ? 1 : -1;
    const delta = r.balance - (prev as number);
    if (sign > 0 ? delta > 0.005 : delta < -0.005) {
      out.push(Math.round(Math.abs(delta) * 100) / 100);
      prev = r.balance; // balance reading trusted
    } else {
      out.push(r.amtCol); // balance conflicts with direction → distrust it
      prev = (prev as number) + sign * r.amtCol;
    }
  }
  return out;
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

  // First pass: keep BOTH the amount column and the running-balance column for
  // each row (the statement's built-in redundancy used for self-correction).
  interface Row {
    date: string; time: string; desc: string;
    direction: 'in' | 'out'; category: string; amtCol: number; balance: number;
  }
  const rows: Row[] = [];
  for (const raw of lines) {
    const m = raw.trim().match(ROW_RE);
    if (!m) continue;
    const [, dd, mm, yy, hh, mi, type, amtRaw, balRaw, descRaw] = m;
    const amtCol = num(amtRaw);
    if (!amtCol) continue;
    const date = `20${yy}-${mm}-${dd}`;
    const time = `${hh.padStart(2, '0')}:${mi}`;
    const desc = (descRaw || type).trim();
    const { direction, category } = classifyKbank(type, desc, amtCol);
    rows.push({ date, time, desc, direction, category, amtCol, balance: num(balRaw) });
  }

  const dirs = rows.map((r) => r.direction);
  const recon = (amts: number[]) => {
    let o = 0, i = 0;
    amts.forEach((a, k) => (dirs[k] === 'in' ? (i += a) : (o += a)));
    const dOut = controlOut !== null ? o - controlOut : null;
    const dIn = controlIn !== null ? i - controlIn : null;
    const ok =
      (dOut === null || Math.abs(dOut) < 0.05) &&
      (dIn === null || Math.abs(dIn) < 0.05) &&
      (controlOut !== null || controlIn !== null);
    return { o, i, dOut, dIn, ok };
  };

  // Trust the amount column first; if it fails to reconcile against the control
  // totals but the balance-derived amounts DO reconcile, use those instead.
  let amounts = rows.map((r) => r.amtCol);
  let amountSource: 'column' | 'balance' = 'column';
  let chosen = recon(amounts);
  if (!chosen.ok && rows.length > 0 && (controlOut !== null || controlIn !== null)) {
    const rebuilt = reconstructFromBalance(rows, openingBalance);
    const rr = recon(rebuilt);
    if (rr.ok) {
      amounts = rebuilt;
      amountSource = 'balance';
      chosen = rr;
    }
  }

  const transactions: RawTransaction[] = rows.map((r, k) => ({
    date: r.date, time: r.time, account, direction: r.direction, amount: amounts[k],
    category: r.category, group: categoryGroup(r.category),
    merchant: kbankMerchant(r.desc), desc: r.desc,
  }));

  return {
    transactions,
    account,
    summary: {
      account, period, openingBalance, closingBalance,
      controlOut, controlIn, parsedOut: chosen.o, parsedIn: chosen.i,
      reconciled: chosen.ok, diffOut: chosen.dOut, diffIn: chosen.dIn, amountSource,
    },
  };
}
