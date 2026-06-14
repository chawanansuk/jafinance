// Thai-localized formatting helpers.

const THB = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 0,
});

const THB2 = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat('th-TH');

/** ฿1,234 (no decimals) */
export function formatTHB(n: number): string {
  return THB.format(Math.round(n));
}

/** ฿1,234.56 (exact) */
export function formatTHB2(n: number): string {
  return THB2.format(n);
}

/** plain grouped number */
export function formatNum(n: number): string {
  return NUM.format(n);
}

export function formatPct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** signed percentage with arrow, e.g. +12% ▲ / -5% ▼ */
export function formatDelta(fraction: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (!isFinite(fraction)) return { text: '—', dir: 'flat' };
  const pct = Math.round(fraction * 100);
  if (pct === 0) return { text: '0%', dir: 'flat' };
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, dir: pct > 0 ? 'up' : 'down' };
}

const TH_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const TH_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/** "2026-03" -> "มี.ค. 69" (Buddhist year, 2 digits) */
export function formatMonth(ym: string, full = false): string {
  const [y, m] = ym.split('-').map(Number);
  const be = y + 543;
  const names = full ? TH_MONTHS_FULL : TH_MONTHS;
  const name = names[m - 1] ?? ym;
  return full ? `${name} ${be}` : `${name} ${String(be).slice(-2)}`;
}

/** "2026-03-20" -> "20 มี.ค." */
export function formatDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = `${d} ${TH_MONTHS[m - 1] ?? ''}`;
  return withYear ? `${base} ${String(y + 543).slice(-2)}` : base;
}

export function formatDateTime(iso: string, time: string): string {
  return time ? `${formatDate(iso)} ${time}` : formatDate(iso);
}
