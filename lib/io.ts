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
 * De-dup a batch of parsed rows against the existing set and assign ids.
 * Compares the FULL row (date+time+account+direction+amount+merchant+desc)
 * — NOT just date+amount+desc — so genuine same-day repeats (Bug #2) are kept.
 */
export function dedupe(raws: RawTransaction[], existing: Transaction[]): ImportResult {
  // count existing ids (with their duplicate-suffix collisions resolved)
  const existingKeys = new Map<string, number>();
  for (const t of existing) {
    const k = makeId(t);
    existingKeys.set(k, (existingKeys.get(k) ?? 0) + 1);
  }
  const existingIds = new Set(existing.map((e) => e.id));
  const incomingSeen = new Map<string, number>();
  const added: Transaction[] = [];
  let duplicates = 0;
  for (const r of raws) {
    const base = makeId(r);
    const already = existingKeys.get(base) ?? 0;
    const seenNow = incomingSeen.get(base) ?? 0;
    incomingSeen.set(base, seenNow + 1);
    // the first `already` incoming copies match existing copies -> duplicates
    if (seenNow < already) { duplicates++; continue; }
    // otherwise it's new; pick the next free ordinal id (seenNow >= already)
    const id = seenNow > 0 ? `${base}_${seenNow}` : base;
    if (existingIds.has(id)) { duplicates++; continue; }
    existingIds.add(id);
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

/** Parse a CSV/JSON file then de-dup against existing rows. */
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
  return dedupe(raws, existing);
}

// ── pasted-text importer ────────────────────────────────────────────────────

export type PasteDelimiter = 'auto' | 'comma' | 'tab' | 'space';

/** Split pasted text into a grid of cells using the chosen delimiter. */
export function splitPasted(text: string, delim: PasteDelimiter = 'auto'): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  let d = delim;
  if (d === 'auto') {
    const first = lines[0];
    if (first.includes('\t')) d = 'tab';
    else if (first.includes(',')) d = 'comma';
    else d = 'space';
  }
  const sep = d === 'comma' ? /\s*,\s*/ : d === 'tab' ? /\t/ : /\s{2,}|\t/;
  return lines.map((l) => l.split(sep).map((c) => c.trim()));
}

/** Loosely parse a date in common TH/EN formats to YYYY-MM-DD ('' if unknown). */
export function parseDateLoose(s: string): string {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    let y = Number(m[1]);
    if (y > 2400) y -= 543; // ISO with a Buddhist year (e.g. 2569-06-10)
    return `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); // DD/MM/YYYY
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (y > 2400) y -= 543; // Buddhist year typed in
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

/** Parse an amount, stripping ฿, commas, spaces. Returns {value, negative}. */
export function parseAmountLoose(s: string): { value: number; negative: boolean } {
  const neg = /^\(.*\)$/.test(s.trim()) || /-/.test(s);
  const n = Math.abs(Number(s.replace(/[฿,\s()]/g, '').replace(/-/g, ''))) || 0;
  return { value: n, negative: neg };
}

export interface PasteMapping {
  date: number;
  amount: number;
  merchant: number | null;
  desc: number | null;
  account: string;
  /** 'sign' = negative amount means money out; 'out'/'in' = force a direction */
  directionMode: 'sign' | 'out' | 'in';
}

/** Build RawTransactions from a parsed grid + a column mapping. */
export function rowsFromMapping(
  grid: string[][],
  map: PasteMapping,
  categorize: (merchant: string, desc: string) => string,
): RawTransaction[] {
  const out: RawTransaction[] = [];
  for (const cells of grid) {
    const date = parseDateLoose(cells[map.date] ?? '');
    const { value, negative } = parseAmountLoose(cells[map.amount] ?? '');
    if (!date || !value) continue;
    const merchant = (map.merchant != null ? cells[map.merchant] : '') ?? '';
    const desc = (map.desc != null ? cells[map.desc] : '') ?? '';
    const direction = map.directionMode === 'sign' ? (negative ? 'out' : 'in') : map.directionMode;
    const category = categorize(merchant, desc);
    out.push({
      date, time: '', account: map.account, direction,
      amount: value, category, group: categoryGroup(category),
      merchant: merchant || '—', desc,
    });
  }
  return out;
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
