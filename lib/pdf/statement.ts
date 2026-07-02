import { parseUobStatement } from './uob';
import { parseKbankStatement } from './kbank';
import { formatTHB } from '../format';
import type { RawTransaction } from '../types';

export type Bank = 'UOB' | 'KBank';

/** Detect which bank a statement (reconstructed text lines) belongs to. */
export function detectBank(lines: string[]): Bank | null {
  const text = lines.join('\n');
  if (/UOB\s*PREMIER|TOTAL BALANCE|PAYMENT DUE DATE|UOB บัตร/i.test(text)) return 'UOB';
  if (/K-?DEPOSIT|รายการเดินบัญชี|MAKE by KBank|รวมถอนเงิน|กสิกร|KASIKORN/i.test(text)) return 'KBank';
  return null;
}

export interface StatementResult {
  bank: Bank;
  transactions: RawTransaction[];
  account: string;
  statementDate: string;
  reconciled: boolean;
  amountDue: number | null; // UOB statement total; null for KBank
  minPayment: number | null;
  summaryRows: { label: string; value: string; warn?: boolean }[];
}

const money = (n: number | null) => (n != null ? formatTHB(n) : '—');

/** Parse a statement after auto-detecting the bank. Returns null if unknown. */
export function parseStatement(lines: string[]): StatementResult | null {
  const bank = detectBank(lines);

  if (bank === 'UOB') {
    const r = parseUobStatement(lines);
    const s = r.summary;
    return {
      bank, transactions: r.transactions, account: r.account, statementDate: s.statementDate,
      reconciled: s.reconciled, amountDue: s.totalBalance, minPayment: s.minPayment,
      summaryRows: [
        { label: 'รอบบิล', value: s.statementDate || '—' },
        { label: 'ยอดรวมบิล', value: money(s.totalBalance) },
        { label: 'รูดสุทธิ (แกะได้)', value: money(s.parsedNet) },
        { label: 'ส่วนต่าง', value: money(s.diff), warn: !s.reconciled },
      ],
    };
  }

  if (bank === 'KBank') {
    const r = parseKbankStatement(lines);
    const s = r.summary;
    return {
      bank, transactions: r.transactions, account: r.account, statementDate: s.period,
      reconciled: s.reconciled, amountDue: null, minPayment: null,
      summaryRows: [
        { label: 'รอบบัญชี', value: s.period || '—' },
        { label: 'ถอน/จ่าย (แกะได้)', value: `${money(s.parsedOut)}${s.controlOut != null ? ` / ${money(s.controlOut)}` : ''}` },
        { label: 'ฝาก/รับ (แกะได้)', value: `${money(s.parsedIn)}${s.controlIn != null ? ` / ${money(s.controlIn)}` : ''}` },
        {
          label: 'ตรงยอดควบคุม',
          value: s.reconciled
            ? s.amountSource === 'balance'
              ? 'ตรง (แก้ยอดจากคอลัมน์คงเหลือ)'
              : s.controlOut != null && s.controlIn != null
                ? 'ตรง'
                : 'ตรง (พบยอดคุมฝั่งเดียว)'
            : 'ไม่ตรง',
          warn: !s.reconciled,
        },
      ],
    };
  }

  return null;
}
