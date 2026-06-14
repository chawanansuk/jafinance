import { categoryGroup } from './categories';
import { makeId } from './data';
import type { RawTransaction, Transaction, Direction, Group } from './types';

const COLUMNS = ['date', 'time', 'account', 'direction', 'amount', 'category', 'group', 'merchant', 'desc'];

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? '').trim()));
    return o;
  });
}

function normalize(o: Record<string, any>): RawTransaction | null {
  if (!o.date || !o.amount) return null;
  const direction = (o.direction === 'in' ? 'in' : 'out') as Direction;
  const category = String(o.category ?? 'ค่าใช้จ่ายอื่น');
  const group = (o.group as Group) || categoryGroup(category);
  return {
    date: String(o.date).slice(0, 10),
    time: String(o.time ?? ''),
    account: String(o.account ?? ''),
    direction,
    amount: Math.abs(Number(o.amount)) || 0,
    category,
    group,
    merchant: String(o.merchant ?? ''),
    desc: String(o.desc ?? ''),
  };
}

export interface ImportResult {
  added: Transaction[];
  duplicates: number;
  parsed: number;
  /** human-readable warnings about date-range overlap per account */
  overlaps: string[];
}

function dateRange(rows: { account: string; date: string }[]): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>();
  for (const r of rows) {
    const cur = out.get(r.account);
    if (!cur) out.set(r.account, [r.date, r.date]);
    else out.set(r.account, [r.date < cur[0] ? r.date : cur[0], r.date > cur[1] ? r.date : cur[1]]);
  }
  return out;
}

/**
 * Parse a CSV/JSON file and return rows that are NOT already present.
 * De-dup compares the FULL row (date+time+account+direction+amount+merchant+desc)
 * — NOT just date+amount+desc — so genuine same-day repeats (Bug #2) are kept.
 */
export function parseImport(text: string, existing: Transaction[]): ImportResult {
  let records: Record<string, any>[];
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed);
    records = Array.isArray(json) ? json : [json];
  } else {
    records = parseCSV(text);
  }
  const raws = records.map(normalize).filter((r): r is RawTransaction => r != null);

  // count existing ids (with their duplicate-suffix collisions resolved)
  const existingKeys = new Map<string, number>();
  for (const t of existing) {
    const k = makeId(t);
    existingKeys.set(k, (existingKeys.get(k) ?? 0) + 1);
  }
  const incomingSeen = new Map<string, number>();
  const added: Transaction[] = [];
  let duplicates = 0;
  for (const r of raws) {
    const base = makeId(r);
    const already = existingKeys.get(base) ?? 0;
    const seenNow = incomingSeen.get(base) ?? 0;
    const ordinal = already + seenNow;
    incomingSeen.set(base, seenNow + 1);
    if (ordinal < already) {
      // there is room within existing copies -> treat as duplicate
      duplicates++;
      continue;
    }
    const id = ordinal > 0 ? `${base}_${ordinal}` : base;
    if (existing.some((e) => e.id === id)) { duplicates++; continue; }
    added.push({ ...r, id });
  }

  // warn when incoming data overlaps an existing date range for the same
  // account (a frequent source of accidental double-counting).
  const overlaps: string[] = [];
  const exRange = dateRange(existing);
  const inRange = dateRange(raws);
  for (const [account, [inLo, inHi]] of inRange) {
    const ex = exRange.get(account);
    if (ex && inLo <= ex[1] && inHi >= ex[0]) {
      overlaps.push(`${account}: ช่วง ${inLo}–${inHi} คาบเกี่ยวกับข้อมูลเดิม (${ex[0]}–${ex[1]}) — ตรวจรายการซ้ำ`);
    }
  }
  return { added, duplicates, parsed: raws.length, overlaps };
}

export function toCSV(txns: Transaction[]): string {
  const esc = (v: any) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.join(',')];
  for (const t of txns) lines.push(COLUMNS.map((c) => esc((t as any)[c])).join(','));
  return lines.join('\n');
}

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
