import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

// Server-side proxy for the Cloud AI statement reader. The browser posts the
// statement image + the user's own API key here; we call the Claude API from
// Node (where the SDK's node deps resolve) and hand the structured JSON back.
// On this app's own Vercel deployment the key never leaves the user's infra
// except to Anthropic.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const SYSTEM_PROMPT = `คุณคือผู้ช่วยอ่านสเตทเมนต์ธนาคารไทย (KBank ออมทรัพย์ / UOB บัตรเครดิต) จากรูปภาพอย่างแม่นยำ
หน้าที่ของคุณคือถอดข้อความทุกแถวของตารางรายการเดินบัญชีให้ครบถ้วน ห้ามข้ามแถว ห้ามเดาตัวเลข
กฎสำคัญ:
- อ่านตัวเลขจำนวนเงินและยอดคงเหลือให้ตรงเป๊ะตามภาพ (ทศนิยม 2 ตำแหน่ง) แปลงให้เป็นตัวเลขล้วน ไม่มีเครื่องหมายคอมมา
- amount เป็นค่าบวกเสมอ ทิศทางเงินบอกผ่าน direction: "out" = เงินออก/ถอน/จ่าย/โอนออก, "in" = เงินเข้า/รับโอน/ฝาก/ดอกเบี้ย/คืนเงิน
- date เป็นรูปแบบ YYYY-MM-DD (ปีพ.ศ.ในสลิป เช่น 68/2568 ให้แปลงเป็น ค.ศ. โดยลบ 543 — เช่น 12-06-68 → 2025-06-12; ถ้าเป็นปี ค.ศ. 2 หลักเช่น 26 → 2026)
- เก็บยอดควบคุมถ้ามี: รวมถอนเงิน→controlOut, รวมฝากเงิน→controlIn, ยอดยกมา→openingBalance, ยอดยกไป→closingBalance
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

export async function POST(req: Request) {
  let body: { apiKey?: string; model?: string; imageBase64?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 400 });
  }

  const { apiKey, model, imageBase64, mediaType } = body;
  if (!apiKey?.trim()) return NextResponse.json({ error: 'ไม่มี API key' }, { status: 400 });
  if (!imageBase64) return NextResponse.json({ error: 'ไม่มีรูป' }, { status: 400 });
  if (!mediaType || !MEDIA_TYPES.has(mediaType))
    return NextResponse.json({ error: 'รองรับเฉพาะรูป JPG/PNG/GIF/WebP' }, { status: 400 });

  const client = new Anthropic({ apiKey: apiKey.trim() });

  try {
    const res = await client.messages.create({
      model: model || 'claude-opus-4-8',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as 'image/png', data: imageBase64 },
            },
            { type: 'text', text: USER_PROMPT },
          ],
        },
      ],
    });

    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    if (!text) return NextResponse.json({ error: 'AI ไม่ได้ส่งข้อความกลับ (อาจถูกปฏิเสธ)' }, { status: 502 });
    return NextResponse.json({ text });
  } catch (e) {
    const status = e instanceof Anthropic.APIError && typeof e.status === 'number' ? e.status : 500;
    let msg = 'อ่านด้วย AI ไม่สำเร็จ';
    if (e instanceof Anthropic.AuthenticationError) msg = 'API key ไม่ถูกต้อง — ตรวจสอบคีย์อีกครั้ง';
    else if (e instanceof Anthropic.PermissionDeniedError) msg = 'API key ไม่มีสิทธิ์ใช้โมเดลนี้';
    else if (e instanceof Anthropic.RateLimitError) msg = 'ถูกจำกัดอัตราการเรียก (rate limit) — ลองใหม่อีกครั้ง';
    else if (e instanceof Anthropic.APIError) msg = `Claude API ผิดพลาด: ${e.message}`;
    return NextResponse.json({ error: msg }, { status: status >= 400 ? status : 500 });
  }
}
