'use client';

import { categoryGroup } from '../categories';
import { autoCategorize } from '../autocat';
import { classifyKbank, kbankMerchant } from '../pdf/kbank';
import { formatTHB } from '../format';
import type { RawTransaction } from '../types';
import type { Bank, StatementResult } from '../pdf/statement';

// ── Cloud AI statement reader (client side) ─────────────────────────────────
// Sends a statement image to /api/extract-statement (server proxy) along with
// the user's own Claude API key, then shapes the model's JSON into the same
// StatementResult the PDF/OCR path produces — so the import UI (preview,
// reconcile, commit) is reused untouched.

export const AI_MODELS = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8 · แม่นสุด' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 · คุ้มค่า' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 · ประหยัด' },
] as const;

export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

interface AiTxn {
  date: string;
  time?: string;
  type?: string;
  direction: 'in' | 'out';
  amount: number;
  balance?: number | null;
  desc?: string;
}

interface AiResult {
  bank?: string;
  account?: string | null;
  period?: string | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
  controlOut?: number | null;
  controlIn?: number | null;
  amountDue?: number | null;
  minPayment?: number | null;
  transactions?: AiTxn[];
}

const IMAGE_MEDIA: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/gif': 'image/gif',
  'image/webp': 'image/webp',
};

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

/** Pull the first JSON object out of a model reply, tolerating ``` fences. */
function parseJsonLoose(text: string): AiResult {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(t) as AiResult;
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1)) as AiResult;
    throw new Error('แปลผลลัพธ์จาก AI ไม่ได้');
  }
}

const money = (n: number | null) => (n != null ? formatTHB(n) : '—');

function toStatementResult(r: AiResult): StatementResult {
  const bank: Bank = r.bank === 'UOB' ? 'UOB' : 'KBank';
  const account = bank === 'KBank' ? 'KBank ออมทรัพย์' : 'UOB บัตรเครดิต';

  const transactions: RawTransaction[] = [];
  let parsedOut = 0;
  let parsedIn = 0;

  for (const t of r.transactions ?? []) {
    const amount = Math.abs(Number(t.amount) || 0);
    if (!amount) continue;
    const date = (t.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const time = (t.time || '').trim();
    const type = (t.type || '').trim();
    const desc = (t.desc || type).trim();

    const guess = classifyKbank(type, desc, amount);
    const direction: 'in' | 'out' =
      t.direction === 'in' || t.direction === 'out' ? t.direction : guess.direction;

    let category: string;
    if (direction === 'in') {
      category = 'รายรับ (เงินเข้า)';
    } else if (bank === 'KBank' && guess.direction === 'out') {
      category = guess.category;
    } else {
      category = autoCategorize(kbankMerchant(desc), desc, {}, amount);
    }

    if (direction === 'in') parsedIn += amount;
    else parsedOut += amount;

    transactions.push({
      date,
      time,
      account,
      direction,
      amount,
      category,
      group: categoryGroup(category),
      merchant: bank === 'KBank' ? kbankMerchant(desc) : desc.slice(0, 40).trim(),
      desc,
    });
  }

  const controlOut = r.controlOut ?? null;
  const controlIn = r.controlIn ?? null;
  const period = r.period || '';

  if (bank === 'UOB') {
    const amountDue = r.amountDue ?? null;
    const parsedNet = parsedOut - parsedIn;
    const diff = amountDue != null ? parsedNet - amountDue : null;
    const reconciled = diff != null && Math.abs(diff) < 1;
    return {
      bank,
      transactions,
      account: r.account || account,
      statementDate: period,
      reconciled,
      amountDue,
      minPayment: r.minPayment ?? null,
      summaryRows: [
        { label: 'รอบบิล', value: period || '—' },
        { label: 'ยอดรวมบิล', value: money(amountDue) },
        { label: 'รูดสุทธิ (AI อ่าน)', value: money(parsedNet) },
        { label: 'ส่วนต่าง', value: money(diff), warn: !reconciled },
      ],
    };
  }

  // KBank
  const diffOut = controlOut != null ? parsedOut - controlOut : null;
  const diffIn = controlIn != null ? parsedIn - controlIn : null;
  const reconciled =
    (diffOut === null || Math.abs(diffOut) < 0.05) &&
    (diffIn === null || Math.abs(diffIn) < 0.05) &&
    (controlOut != null || controlIn != null);

  return {
    bank,
    transactions,
    account,
    statementDate: period,
    reconciled,
    amountDue: null,
    minPayment: null,
    summaryRows: [
      { label: 'รอบบัญชี', value: period || '—' },
      { label: 'ถอน/จ่าย (AI อ่าน)', value: `${money(parsedOut)}${controlOut != null ? ` / ${money(controlOut)}` : ''}` },
      { label: 'ฝาก/รับ (AI อ่าน)', value: `${money(parsedIn)}${controlIn != null ? ` / ${money(controlIn)}` : ''}` },
      { label: 'ตรงยอดควบคุม', value: reconciled ? 'ตรง' : 'ไม่ตรง', warn: !reconciled },
    ],
  };
}

export interface AiExtractOptions {
  apiKey: string;
  model: string;
}

/** Read a statement image via the Claude API (through our server proxy). */
export async function extractStatementWithAI(
  file: File,
  { apiKey, model }: AiExtractOptions,
): Promise<StatementResult> {
  const media = IMAGE_MEDIA[file.type.toLowerCase()];
  if (!media) throw new Error('Cloud AI รองรับเฉพาะรูปภาพ (JPG/PNG/WebP)');

  const imageBase64 = await readAsBase64(file);

  const resp = await fetch('/api/extract-statement', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: apiKey.trim(), model, imageBase64, mediaType: media }),
  });

  const payload = (await resp.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!resp.ok) throw new Error(payload.error || `Cloud AI ผิดพลาด (${resp.status})`);
  if (!payload.text) throw new Error('AI ไม่ได้ส่งข้อความกลับ');

  return toStatementResult(parseJsonLoose(payload.text));
}

/** Friendly Thai message for a failed extraction. */
export function aiErrorMessage(e: unknown): string {
  return (e as Error)?.message || 'อ่านด้วย AI ไม่สำเร็จ';
}
