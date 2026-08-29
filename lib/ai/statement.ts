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
  { id: 'claude-opus-5', label: 'Opus 5 · แม่นสุด' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 · คุ้มค่า' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 · ประหยัด' },
] as const;

export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

/**
 * The picked model is remembered in localStorage, so a browser can still be
 * holding an id we no longer offer (e.g. claude-opus-4-8 from before this list
 * was refreshed). Fall back to the default rather than rendering a <select>
 * with no matching <option> and sending a stale id to the API.
 */
export function resolveAiModel(id: string | undefined | null): string {
  return AI_MODELS.some((m) => m.id === id) ? (id as string) : DEFAULT_AI_MODEL;
}

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
  controlOutCount?: number | null;
  controlInCount?: number | null;
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
  /** status line for the import UI while the (possibly two-pass) read runs */
  onProgress?: (msg: string) => void;
}

const SYSTEM_PROMPT = `คุณคือผู้ช่วยอ่านสเตทเมนต์ธนาคารไทย (KBank ออมทรัพย์ / UOB บัตรเครดิต) จากรูปภาพอย่างแม่นยำ
หน้าที่ของคุณคือถอดข้อความทุกแถวของตารางรายการเดินบัญชีให้ครบถ้วน ห้ามข้ามแถว ห้ามเดาตัวเลข
กฎสำคัญ:
- อ่านตัวเลขจำนวนเงินและยอดคงเหลือให้ตรงเป๊ะตามภาพ (ทศนิยม 2 ตำแหน่ง) แปลงให้เป็นตัวเลขล้วน ไม่มีเครื่องหมายคอมมา
- amount เป็นค่าบวกเสมอ ทิศทางเงินบอกผ่าน direction: "out" = เงินออก/ถอน/จ่าย/โอนออก, "in" = เงินเข้า/รับโอน/ฝาก/ดอกเบี้ย/คืนเงิน
- date เป็นรูปแบบ YYYY-MM-DD (ปีพ.ศ.ในสลิป เช่น 68/2568 ให้แปลงเป็น ค.ศ. โดยลบ 543 — เช่น 12-06-68 → 2025-06-12; ถ้าเป็นปี ค.ศ. 2 หลักเช่น 26 → 2026)
- เก็บยอดควบคุมถ้ามี: รวมถอนเงิน→controlOut (จำนวนรายการ→controlOutCount), รวมฝากเงิน→controlIn (→controlInCount), ยอดยกมา→openingBalance, ยอดยกไป→closingBalance
- ก่อนตอบ ให้ตรวจงานตัวเอง: (1) ผลรวมแถวถอนต้องเท่ากับ controlOut และแถวฝากเท่ากับ controlIn (2) ยอดคงเหลือแต่ละแถวต้องต่อเนื่อง = ยอดก่อนหน้า ± จำนวนเงิน — ถ้าไม่ตรง ให้กลับไปอ่านภาพซ้ำจนกว่าจะตรง
- ถ้ามีหลายรูป คือสเตทเมนต์เดียวกันหลายหน้า/หลายช่วง: รวมทุกแถวเรียงตามวันเวลา ห้ามใส่แถวซ้ำที่ปรากฏในสองรูป
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
    controlOutCount: { type: ['integer', 'null'] },
    controlInCount: { type: ['integer', 'null'] },
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

// ── client-side verification (the checks a careful human transcriber runs) ──

export interface AiVerifyIssue {
  message: string;
  rows?: number[]; // 0-based indices into r.transactions
}

/**
 * Cross-check the model's transcription the way we do by hand: sums vs the
 * printed control totals, row counts, and a per-row running-balance walk.
 * Returns the discrepancies as human-readable hints usable for a re-read.
 */
export function verifyAiResult(r: AiResult): { ok: boolean; issues: AiVerifyIssue[] } {
  const issues: AiVerifyIssue[] = [];
  const txns = r.transactions ?? [];
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const outRows = txns.filter((t) => t.direction === 'out');
  const inRows = txns.filter((t) => t.direction === 'in');
  const sumOut = r2(outRows.reduce((s, t) => s + Math.abs(t.amount || 0), 0));
  const sumIn = r2(inRows.reduce((s, t) => s + Math.abs(t.amount || 0), 0));

  if (r.controlOut != null && Math.abs(sumOut - r.controlOut) > 0.05)
    issues.push({ message: `ผลรวมแถวถอน/จ่ายที่อ่านได้ ${sumOut.toFixed(2)} ไม่เท่ายอดคุมในภาพ ${r.controlOut.toFixed(2)} (ต่าง ${r2(sumOut - r.controlOut).toFixed(2)})` });
  if (r.controlIn != null && Math.abs(sumIn - r.controlIn) > 0.05)
    issues.push({ message: `ผลรวมแถวฝาก/รับที่อ่านได้ ${sumIn.toFixed(2)} ไม่เท่ายอดคุมในภาพ ${r.controlIn.toFixed(2)} (ต่าง ${r2(sumIn - r.controlIn).toFixed(2)})` });
  if (r.controlOutCount != null && outRows.length !== r.controlOutCount)
    issues.push({ message: `จำนวนแถวถอน/จ่ายที่อ่านได้ ${outRows.length} รายการ แต่ภาพระบุ ${r.controlOutCount} รายการ — อาจอ่านตกหล่นหรือเกิน` });
  if (r.controlInCount != null && inRows.length !== r.controlInCount)
    issues.push({ message: `จำนวนแถวฝาก/รับที่อ่านได้ ${inRows.length} รายการ แต่ภาพระบุ ${r.controlInCount} รายการ` });

  // running-balance walk (KBank-style statements); needs most rows to carry
  // a balance to be meaningful
  const withBal = txns.filter((t) => t.balance != null).length;
  if (r.openingBalance != null && txns.length > 0 && withBal >= txns.length * 0.8) {
    let prev = r.openingBalance;
    const bad: number[] = [];
    txns.forEach((t, i) => {
      const expected = r2(prev + (t.direction === 'in' ? 1 : -1) * Math.abs(t.amount || 0));
      if (t.balance != null) {
        if (Math.abs(expected - t.balance) > 0.01) bad.push(i);
        prev = t.balance; // resync so one bad row doesn't flag the rest
      } else {
        prev = expected;
      }
    });
    if (bad.length)
      issues.push({
        rows: bad,
        message: `ยอดคงเหลือไม่ต่อเนื่องที่แถว: ${bad
          .slice(0, 6)
          .map((i) => `#${i + 1} (${txns[i].date}${txns[i].time ? ' ' + txns[i].time : ''} จำนวน ${Math.abs(txns[i].amount).toFixed(2)})`)
          .join(', ')}${bad.length > 6 ? ` และอีก ${bad.length - 6} แถว` : ''}`,
      });
    if (r.closingBalance != null && Math.abs(prev - r.closingBalance) > 0.01)
      issues.push({ message: `เดินยอดถึงแถวสุดท้ายได้ ${prev.toFixed(2)} แต่ยอดยกไปในภาพคือ ${r.closingBalance.toFixed(2)}` });
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Read statement image(s) by calling the Claude API directly from the browser.
 * Mirrors how a careful human reads: adaptive thinking on, then the result is
 * cross-checked (control totals, row counts, balance walk) and — if anything
 * disagrees — the model is asked ONCE to look at the same image(s) again with
 * the specific discrepancies pointed out.
 */
export async function extractStatementWithAI(
  fileOrFiles: File | File[],
  { apiKey, model, onProgress }: AiExtractOptions,
): Promise<StatementResult> {
  const files = (Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]).slice(0, 4);
  if (files.length === 0) throw new Error('ยังไม่ได้เลือกรูป');
  const key = apiKey.trim();
  if (!key) throw new Error('ยังไม่ได้ใส่ API key');

  onProgress?.(files.length > 1 ? `เตรียมรูป ${files.length} รูป…` : 'เตรียมรูป…');
  const images: { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } }[] = [];
  for (const file of files) {
    const media = IMAGE_MEDIA[file.type.toLowerCase()];
    if (!media) throw new Error('Cloud AI รองรับเฉพาะรูปภาพ (JPG/PNG/WebP)');
    const { data, media: sendMedia } = await toApiImage(file, media);
    images.push({ type: 'image', source: { type: 'base64', media_type: sendMedia, data } });
  }

  // Lazy-load the SDK so it stays out of the main bundle until Cloud AI is used.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });

  const chosenModel = resolveAiModel(model);
  const params = {
    model: chosenModel,
    max_tokens: 20000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema' as const, schema: OUTPUT_SCHEMA } },
    // adaptive thinking = the single biggest accuracy lever for careful table
    // transcription (Haiku 4.5 doesn't support adaptive — leave it off there)
    ...(chosenModel.includes('haiku') ? {} : { thinking: { type: 'adaptive' as const } }),
  };

  const call = async (messages: any[]) => {
    let res;
    try {
      res = await client.messages.create({ ...params, messages });
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
    // A safety decline returns HTTP 200 with no usable text; say so plainly
    // instead of surfacing the generic "ไม่ได้ส่งข้อความกลับ".
    if (res.stop_reason === 'refusal')
      throw new Error('AI ปฏิเสธคำขอนี้ — ลองส่งเฉพาะภาพตารางรายการ (ครอปส่วนหัวที่มีเลขบัญชี/ชื่อออก)');
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    if (!text) throw new Error('AI ไม่ได้ส่งข้อความกลับ (อาจถูกปฏิเสธ)');
    return { res, parsed: parseJsonLoose(text) };
  };

  onProgress?.('AI กำลังอ่านรูป…');
  const firstUser = { role: 'user' as const, content: [...images, { type: 'text' as const, text: USER_PROMPT }] };
  const first = await call([firstUser]);
  let best = first.parsed;
  let retried = false;

  const check = verifyAiResult(best);
  if (!check.ok) {
    // point the model at the exact discrepancies and let it re-read the image
    retried = true;
    onProgress?.('ยอดไม่ตรง — ให้ AI ตรวจรูปซ้ำ…');
    const hints = check.issues.map((i) => `- ${i.message}`).join('\n');
    const correction = `ตรวจสอบผลของคุณกับภาพแล้วพบความไม่สอดคล้อง:\n${hints}\nกรุณาดูภาพอีกครั้งอย่างละเอียด โดยเฉพาะแถวที่ระบุและแถวที่อาจตกหล่น/อ่านตัวเลขผิด แล้วส่ง JSON ฉบับสมบูรณ์ใหม่ทั้งหมดตาม schema เดิม`;
    const second = await call([
      firstUser,
      // echo the full assistant content (incl. thinking blocks) back unchanged
      { role: 'assistant' as const, content: first.res.content },
      { role: 'user' as const, content: [{ type: 'text' as const, text: correction }] },
    ]);
    const secondCheck = verifyAiResult(second.parsed);
    // keep the retry when it verifies or at least reduced the discrepancies;
    // otherwise the first attempt stands
    best = secondCheck.ok || secondCheck.issues.length < check.issues.length ? second.parsed : first.parsed;
  }

  const result = toStatementResult(best);
  // hand the balance-walk hints to the preview so suspect rows get highlighted
  // (same amber treatment as the PDF path's chainBreaks)
  const finalCheck = verifyAiResult(best);
  const chainRows = finalCheck.issues.flatMap((i) => i.rows ?? []);
  if (chainRows.length) result.chainBreaks = chainRows;
  if (retried) {
    result.summaryRows = [
      ...result.summaryRows,
      { label: 'การอ่านซ้ำ', value: result.reconciled ? 'AI ตรวจซ้ำแล้วยอดตรง' : 'AI ตรวจซ้ำแล้วยังไม่ตรง — ตรวจแถวที่ไฮไลต์', warn: !result.reconciled },
    ];
  }
  return result;
}

/** Friendly Thai message for a failed extraction. */
export function aiErrorMessage(e: unknown): string {
  return (e as Error)?.message || 'อ่านด้วย AI ไม่สำเร็จ';
}
