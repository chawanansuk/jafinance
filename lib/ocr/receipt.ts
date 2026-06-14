import { autoCategorize } from '../autocat';
import { parseDateLoose } from '../io';

// Keyword tiers for picking the paid amount. Tier 1 (net/final) beats tier 2
// (subtotal/total) so a discounted receipt yields the actual amount paid.
const NET_KEYWORDS = ['ยอดสุทธิ', 'สุทธิ', 'ยอดที่ต้องชำระ', 'ยอดชำระ', 'ยอดที่ชำระ', 'grand total', 'net', 'total due', 'amount due', 'ชำระเงิน'];
const TOTAL_KEYWORDS = ['รวมทั้งสิ้น', 'ยอดรวม', 'รวมเงิน', 'จำนวนเงิน', 'ยอดเงิน', 'รวม', 'total', 'amount'];

export interface ReceiptGuess {
  amount: number;
  merchant: string;
  date: string; // YYYY-MM-DD or ''
  category: string;
  rawText: string;
}

/** All currency-like numbers in a string (prefers values with 2 decimals). */
function numbersIn(s: string): { val: number; dec: boolean }[] {
  const out: { val: number; dec: boolean }[] = [];
  for (const m of s.matchAll(/\d[\d,]*\.\d{1,2}|\d[\d,]*/g)) {
    const raw = m[0];
    const digits = raw.replace(/[^0-9]/g, '');
    // skip phone/tax-id-like long runs and bare years
    if (!raw.includes('.') && (digits.length >= 9 || /^(19|20|25)\d{2}$/.test(raw))) continue;
    const val = Number(raw.replace(/,/g, ''));
    if (isFinite(val) && val > 0) out.push({ val, dec: raw.includes('.') });
  }
  return out;
}

const hasAny = (line: string, kws: string[]) => kws.some((k) => line.includes(k));

function pickAmount(lines: string[]): number {
  const lower = lines.map((l) => l.toLowerCase());
  const fromTier = (kws: string[]): number => {
    let best = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!hasAny(lower[i], kws.map((k) => k.toLowerCase()))) continue;
      // numbers on the keyword line, else the next line
      const nums = [...numbersIn(lines[i]), ...numbersIn(lines[i + 1] ?? '')];
      for (const n of nums) best = Math.max(best, n.val);
    }
    return best;
  };
  const net = fromTier(NET_KEYWORDS);
  if (net > 0) return net;
  const total = fromTier(TOTAL_KEYWORDS);
  if (total > 0) return total;
  // fallback: largest 2-decimal number, else largest number
  const all = lines.flatMap((l) => numbersIn(l));
  const dec = all.filter((n) => n.dec);
  const pool = dec.length ? dec : all;
  return pool.reduce((m, n) => Math.max(m, n.val), 0);
}

function pickMerchant(lines: string[]): string {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (hasAny(lower, [...NET_KEYWORDS, ...TOTAL_KEYWORDS].map((k) => k.toLowerCase()))) continue;
    if (/^[\d\s.,:/\-]+$/.test(line)) continue; // only numbers/punctuation
    if (line.replace(/[^0-9]/g, '').length >= 9) continue; // phone/tax id
    if (parseDateLoose(line)) continue;
    const letters = line.replace(/[^A-Za-z฀-๿]/g, '');
    if (letters.length < 2) continue;
    return line.slice(0, 40).trim();
  }
  return '';
}

function pickDate(lines: string[]): string {
  for (const line of lines) {
    for (const m of line.matchAll(/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/g)) {
      const d = parseDateLoose(m[0]);
      if (d) return d;
    }
  }
  return '';
}

/** Heuristically extract amount / merchant / date / category from OCR text. */
export function parseReceiptText(text: string): ReceiptGuess {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const amount = pickAmount(lines);
  const merchant = pickMerchant(lines);
  const date = pickDate(lines);
  const category = autoCategorize(merchant, text, {}, amount);
  return { amount, merchant, date, category, rawText: text };
}
