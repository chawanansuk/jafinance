'use client';

import { categoryGroup } from '../categories';
import { autoCategorize } from '../autocat';
import { classifyKbank, kbankMerchant } from '../pdf/kbank';
import { normalizeUobMerchant } from '../pdf/uob';
import { formatTHB } from '../format';
import type { RawTransaction } from '../types';
import type { Bank, StatementResult } from '../pdf/statement';

// ── Cloud AI statement reader (client side) ─────────────────────────────────
// Sends a statement image straight from the browser to the Claude API, using
// the user's own API key, then shapes the model's JSON into the same
// StatementResult the PDF/OCR path produces — so the import UI (preview,
// reconcile, commit) is reused untouched.
//
// The call goes browser -> api.anthropic.com directly (no backend): the app is
// a static export (`output: 'export'`) with no server to proxy through, so a
// server route would 404 on the deployed site. The SDK is loaded lazily and
// runs with `dangerouslyAllowBrowser` — the key + image never touch any
// intermediate server, only Anthropic. Keep this aligned with the static,
// no-backend design in the README.

export const AI_MODELS = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8 · แม่นสุด' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 · คุ้มค่า' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 · ประหยัด' },
] as const;

export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

export interface AiTxn {
  date: string;
  time?: string;
  type?: string;
  direction: 'in' | 'out';
  amount: number;
  balance?: number | null;
  desc?: string;
}

export interface AiResult {
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

function readAsBase64(file: Blob): Promise<string> {
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

export function toStatementResult(r: AiResult): StatementResult {
  const bank: Bank = r.bank === 'UOB' ? 'UOB' : 'KBank';
  const account = bank === 'KBank' ? 'KBank ออมทรัพย์' : 'UOB บัตรเครดิต';

  const transactions: RawTransaction[] = [];
  let parsedOut = 0;
  let parsedIn = 0;
  let payments = 0; // UOB card-bill payments — settle debt, never spending

  const isUobPayment = (d: string) => /PAYMENT\s+(THANK\s+YOU|RECEIVED)/i.test(d);

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

    // The prompt (correctly) demands every row, so the model returns the
    // card-bill payment line too. The PDF path excludes it — that money is
    // already recorded as a KBank-side settlement, importing it here would
    // double-count. Track it for the reconcile formula, but never commit it.
    if (bank === 'UOB' && direction === 'in' && isUobPayment(desc)) {
      payments += amount;
      continue;
    }

    let category: string;
    if (direction === 'in') {
      // a credit on a card statement is a refund (netted against spending),
      // not income — mirror the PDF path.
      category = bank === 'UOB' ? 'คืนเงิน (refund)' : 'รายรับ (เงินเข้า)';
    } else if (bank === 'KBank' && guess.direction === 'out') {
      category = guess.category;
    } else {
      const m = bank === 'KBank' ? kbankMerchant(desc) : normalizeUobMerchant(desc);
      category = autoCategorize(m, desc, {}, amount);
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
      merchant: bank === 'KBank' ? kbankMerchant(desc) : normalizeUobMerchant(desc),
      desc,
    });
  }

  const controlOut = r.controlOut ?? null;
  const controlIn = r.controlIn ?? null;
  const period = r.period || '';

  if (bank === 'UOB') {
    const amountDue = r.amountDue ?? null;
    const opening = r.openingBalance ?? 0; // PREVIOUS BALANCE on the bill
    const parsedNet = parsedOut - parsedIn;
    // TOTAL BALANCE = previous balance - payments + net new spend, so the
    // spend we parsed should equal amountDue - opening + payments. Comparing
    // parsedNet to amountDue directly (the old formula) only reconciles when
    // the previous bill was zero.
    const expectedNet = amountDue != null ? amountDue - opening + payments : null;
    const diff = expectedNet != null ? parsedNet - expectedNet : null;
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
      {
        label: 'ตรงยอดควบคุม',
        value: reconciled
          ? controlOut != null && controlIn != null
            ? 'ตรง'
            : 'ตรง (พบยอดคุมฝั่งเดียว)'
          : 'ไม่ตรง',
        warn: !reconciled,
      },
    ],
  };
}

export interface AiExtractOptions {
  apiKey: string;
  model: string;
}

const SYSTEM_PROMPT = `คุณคือผู้ช่วยอ่านสเตทเมนต์ธนาคารไทย (KBank ออมทรัพย์ / UOB บัตรเครดิต) จากรูปภาพอย่างแม่นยำ
หน้าที่ของคุณคือถอดข้อความทุกแถวของตารางรายการเดินบัญชีให้ครบถ้วน ห้ามข้ามแถว ห้ามเดาตัวเลข
กฎสำคัญ:
- อ่านตัวเลขจำนวนเงินและยอดคงเหลือให้ตรงเป๊ะตามภาพ (ทศนิยม 2 ตำแหน่ง) แปลงให้เป็นตัวเลขล้วน ไม่มีเครื่องหมายคอมมา
- amount เป็นค่าบวกเสมอ ทิศทางเงินบอกผ่าน direction: "out" = เงินออก/ถอน/จ่าย/โอนออก, "in" = เงินเข้า/รับโอน/ฝาก/ดอกเบี้ย/คืนเงิน
- date เป็นรูปแบบ YYYY-MM-DD (ปีพ.ศ.ในสลิป เช่น 68/2568 ให้แปลงเป็น ค.ศ. โดยลบ 543 — เช่น 12-06-68 → 2025-06-12; ถ้าเป็นปี ค.ศ. 2 หลักเช่น 26 → 2026)
- เก็บยอดควบคุมถ้ามี: รวมถอนเงิน→controlOut, รวมฝากเงิน→controlIn, ยอดยกมา→openingBalance, ยอดยกไป→closingBalance
- สำหรับบิลบัตรเครดิต UOB: PREVIOUS BALANCE→openingBalance, TOTAL BALANCE→amountDue, MINIMUM PAYMENT→minPayment และให้ใส่แถว PAYMENT THANK YOU เป็น direction "in" ตามจริง
- ถ้าไม่แน่ใจค่าใด ให้ใส่ null อย่าเดา`;

const USER_PROMPT =
  'อ่านสเตทเมนต์นี้แล้วส่งกลับเป็น JSON ตาม schema ที่กำหนด ให้ครบทุกรายการในตาราง พร้อมยอดควบคุมและยอดยกมา/ยกไปถ้ามี';

const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bank: { type: 'string', enum: ['KBank', 'UOB', 'other'] },
    account: { type: ['string', 'null'] },
    period: { type: ['string', 'null'] },
    openingBalance: { type: ['number', 'null'] },
    closingBalance: { type: ['number', 'null'] },
    controlOut: { type: ['number', 'null'] },
    controlIn: { type: ['number', 'null'] },
    amountDue: { type: ['number', 'null'] },
    minPayment: { type: ['number', 'null'] },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string' },
          time: { type: 'string' },
          type: { type: 'string' },
          direction: { type: 'string', enum: ['in', 'out'] },
          amount: { type: 'number' },
          balance: { type: ['number', 'null'] },
          desc: { type: 'string' },
        },
        required: ['date', 'direction', 'amount'],
      },
    },
  },
  required: ['bank', 'transactions'],
};

/**
 * Downscale/re-encode big phone photos before upload: the API rejects images
 * over ~5 MB / 8000 px, and a 15 MB JPEG would balloon to ~20 MB of base64 in
 * memory. Statement text survives 2200 px on the long edge comfortably. Falls
 * back to the original bytes if canvas decoding fails.
 */
async function toApiImage(
  file: File,
  media: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
): Promise<{ data: string; media: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }> {
  const LIMIT = 3.5 * 1024 * 1024; // stay well under the 5 MB API cap
  if (file.size <= LIMIT) return { data: await readAsBase64(file), media };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { data: await readAsBase64(file), media };
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.9));
    if (!blob) return { data: await readAsBase64(file), media };
    return { data: await readAsBase64(blob), media: 'image/jpeg' };
  } catch {
    return { data: await readAsBase64(file), media };
  }
}

/** Read a statement image by calling the Claude API directly from the browser. */
export async function extractStatementWithAI(
  file: File,
  { apiKey, model }: AiExtractOptions,
): Promise<StatementResult> {
  const media = IMAGE_MEDIA[file.type.toLowerCase()];
  if (!media) throw new Error('Cloud AI รองรับเฉพาะรูปภาพ (JPG/PNG/WebP)');
  const key = apiKey.trim();
  if (!key) throw new Error('ยังไม่ได้ใส่ API key');

  const { data: imageBase64, media: sendMedia } = await toApiImage(file, media);

  // Lazy-load the SDK so it stays out of the main bundle until Cloud AI is used.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });

  let res;
  try {
    res = await client.messages.create({
      model: model || DEFAULT_AI_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: sendMedia, data: imageBase64 } },
            { type: 'text', text: USER_PROMPT },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      throw new Error('API key ไม่ถูกต้อง — ตรวจสอบคีย์อีกครั้ง');
    if (e instanceof Anthropic.PermissionDeniedError)
      throw new Error('API key ไม่มีสิทธิ์ใช้โมเดลนี้');
    if (e instanceof Anthropic.RateLimitError)
      throw new Error('ถูกจำกัดอัตราการเรียก (rate limit) — ลองใหม่อีกครั้ง');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API ผิดพลาด: ${e.message}`);
    throw e;
  }

  if (res.stop_reason === 'max_tokens')
    throw new Error('สเตทเมนต์มีรายการเยอะเกินคำตอบเดียว — ลองครอปรูปเป็นครึ่งบน/ล่าง แล้วอ่านทีละส่วน');

  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  if (!text) throw new Error('AI ไม่ได้ส่งข้อความกลับ (อาจถูกปฏิเสธ)');

  return toStatementResult(parseJsonLoose(text));
}

/** Friendly Thai message for a failed extraction. */
export function aiErrorMessage(e: unknown): string {
  return (e as Error)?.message || 'อ่านด้วย AI ไม่สำเร็จ';
}
