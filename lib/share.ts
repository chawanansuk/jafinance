'use client';

import { formatTHB } from './format';

// ── shareable month-summary image ───────────────────────────────────────────
// Hand-drawn on a canvas (no extra deps, nothing uploaded): a 1080×1350
// portrait card with the period total, the จำเป็น/ลดได้/โอน split, and the top
// categories. Uses the already-loaded Noto Sans Thai and the same validated
// light-mode category colors as the app's charts.

export interface ShareSummary {
  title: string; // e.g. "พฤษภาคม 2569"
  total: number;
  deltaPct: number | null; // vs previous month, null to hide
  count: number;
  avgPerDay: number;
  split: { label: string; value: number; color: string }[];
  cats: { name: string; total: number; share: number; color: string }[];
  incomplete: boolean;
}

const W = 1080;
const H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export async function drawMonthSummary(canvas: HTMLCanvasElement, s: ShareSummary): Promise<void> {
  await document.fonts.ready; // Noto Sans Thai must be usable in canvas
  const thai = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const font = (weight: number, px: number) => `${weight} ${px}px ${thai}`;

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#d1fae5');
  bg.addColorStop(1, '#f0fdfa');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // card
  const PAD = 56;
  roundRect(ctx, PAD, PAD, W - PAD * 2, H - PAD * 2, 40);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  const L = PAD + 64; // content left
  const R = W - PAD - 64; // content right
  let y = PAD + 110;

  // header
  ctx.fillStyle = '#64746e';
  ctx.font = font(500, 30);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('สรุปรายจ่าย', L, y);
  y += 56;
  ctx.fillStyle = '#0f1c18';
  ctx.font = font(700, 56);
  ctx.fillText(s.title, L, y);
  if (s.incomplete) {
    const w = ctx.measureText(s.title).width;
    ctx.font = font(500, 26);
    ctx.fillStyle = '#b45309';
    ctx.fillText('· ข้อมูลไม่ครบ', L + w + 20, y);
  }

  // hero number
  y += 118;
  ctx.fillStyle = '#059669';
  ctx.font = font(800, 108);
  ctx.fillText(formatTHB(s.total), L, y);

  // meta line
  y += 56;
  ctx.fillStyle = '#64746e';
  ctx.font = font(500, 30);
  const deltaTxt =
    s.deltaPct != null && Math.round(Math.abs(s.deltaPct) * 100) >= 1
      ? `${s.deltaPct > 0 ? '▲ +' : '▼ −'}${Math.abs(Math.round(s.deltaPct * 100))}% จากเดือนก่อน · `
      : '';
  ctx.fillText(`${deltaTxt}${s.count} รายการ · เฉลี่ย ${formatTHB(s.avgPerDay)}/วัน`, L, y);

  // split bar
  y += 64;
  const barH = 26;
  const splitTotal = s.split.reduce((a, p) => a + Math.max(0, p.value), 0);
  if (splitTotal > 0) {
    let x = L;
    const usable = R - L - (s.split.filter((p) => p.value > 0).length - 1) * 6;
    for (const p of s.split) {
      if (p.value <= 0) continue;
      const w = (p.value / splitTotal) * usable;
      roundRect(ctx, x, y, w, barH, 13);
      ctx.fillStyle = p.color;
      ctx.fill();
      x += w + 6;
    }
    y += barH + 44;
    ctx.font = font(500, 26);
    let lx = L;
    for (const p of s.split) {
      if (p.value <= 0) continue;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(lx + 9, y - 9, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f1c18';
      const txt = `${p.label} ${formatTHB(p.value)}`;
      ctx.fillText(txt, lx + 30, y);
      lx += 30 + ctx.measureText(txt).width + 40;
    }
  }

  // top categories
  y += 84;
  ctx.fillStyle = '#0f1c18';
  ctx.font = font(700, 34);
  ctx.fillText('หมวดที่จ่ายมากสุด', L, y);
  y += 28;

  const cats = s.cats.slice(0, 6);
  const maxShare = cats.length ? Math.max(...cats.map((c) => c.share)) : 1;
  const rowH = 96;
  for (const c of cats) {
    const nameY = y + 40;
    ctx.font = font(600, 29);
    ctx.fillStyle = '#0f1c18';
    // truncate the name so it never collides with the right-aligned amount
    let name = c.name;
    while (ctx.measureText(name).width > R - L - 260 && name.length > 4) name = name.slice(0, -1);
    if (name !== c.name) name += '…';
    ctx.fillText(name, L, nameY);
    ctx.font = font(700, 29);
    const amt = `${formatTHB(c.total)}  ·  ${Math.round(c.share * 100)}%`;
    ctx.fillStyle = '#0f1c18';
    ctx.fillText(amt, R - ctx.measureText(amt).width, nameY);
    // track + fill
    const barY = y + 56;
    roundRect(ctx, L, barY, R - L, 14, 7);
    ctx.fillStyle = '#eef2f0';
    ctx.fill();
    roundRect(ctx, L, barY, Math.max(14, (c.share / maxShare) * (R - L)), 14, 7);
    ctx.fillStyle = c.color;
    ctx.fill();
    y += rowH;
  }

  // footer
  ctx.fillStyle = '#94a6a0';
  ctx.font = font(500, 24);
  ctx.fillText('วางแผนค่าใช้จ่าย · ข้อมูลอยู่ในเครื่องเท่านั้น', L, H - PAD - 52);
}

/** Render the summary and hand it to the user as a PNG download. */
export async function downloadMonthSummaryImage(s: ShareSummary, filename: string): Promise<void> {
  const canvas = document.createElement('canvas');
  await drawMonthSummary(canvas, s);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
  if (!blob) throw new Error('สร้างรูปไม่สำเร็จ');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
