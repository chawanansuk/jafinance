'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, ClipboardPaste, Check, AlertTriangle } from 'lucide-react';
import { useData } from './DataProvider';
import { Modal } from './ui';
import { CATEGORIES } from '@/lib/categories';
import { autoCategorize } from '@/lib/autocat';
import { formatTHB, formatDate } from '@/lib/format';
import {
  splitPasted, rowsFromMapping, dedupe, parseDateLoose, parseAmountLoose,
  type PasteDelimiter, type PasteMapping,
} from '@/lib/io';

const CAT_NAMES = CATEGORIES.map((c) => c.name);
const ACCOUNTS = ['KBank ออมทรัพย์', 'UOB บัตรเครดิต'];

/** Guess which column holds the date / amount by scanning the grid. */
function guessColumns(grid: string[][]): { date: number; amount: number; merchant: number | null; desc: number | null } {
  const cols = Math.max(0, ...grid.map((r) => r.length));
  let date = 0, amount = 1;
  let dateScore = -1, amtScore = -1;
  for (let c = 0; c < cols; c++) {
    let ds = 0;
    for (const r of grid) if (parseDateLoose(r[c] ?? '')) ds++;
    if (ds > dateScore) { dateScore = ds; date = c; }
  }
  for (let c = 0; c < cols; c++) {
    if (c === date) continue;
    let as = 0;
    for (const r of grid) if (parseAmountLoose(r[c] ?? '').value) as++;
    if (as > amtScore) { amtScore = as; amount = c; }
  }
  const textCols = [];
  for (let c = 0; c < cols; c++) if (c !== date && c !== amount) textCols.push(c);
  return { date, amount, merchant: textCols[0] ?? null, desc: textCols[1] ?? null };
}

export function SmartImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { txns, setImported, rules } = useData();
  const [text, setText] = useState('');
  const [delim, setDelim] = useState<PasteDelimiter>('auto');
  const [account, setAccount] = useState(ACCOUNTS[0]);
  const [directionMode, setDirectionMode] = useState<'sign' | 'out' | 'in'>('out');
  const [manual, setManual] = useState<Partial<Pick<PasteMapping, 'date' | 'amount' | 'merchant' | 'desc'>>>({});
  const [catOverrides, setCatOverrides] = useState<Record<number, string>>({});
  const [done, setDone] = useState<string | null>(null);

  const grid = useMemo(() => splitPasted(text, delim), [text, delim]);
  const guess = useMemo(() => guessColumns(grid), [grid]);
  const cols = Math.max(0, ...grid.map((r) => r.length));

  const mapping: PasteMapping = {
    date: manual.date ?? guess.date,
    amount: manual.amount ?? guess.amount,
    merchant: manual.merchant !== undefined ? manual.merchant : guess.merchant,
    desc: manual.desc !== undefined ? manual.desc : guess.desc,
    account,
    directionMode,
  };

  useEffect(() => {
    setCatOverrides({});
  }, [text, delim, account, directionMode, manual]);

  const raws = useMemo(
    () => rowsFromMapping(grid, mapping, (m, d, amt) => autoCategorize(m, d, rules, amt)),
    [grid, mapping.date, mapping.amount, mapping.merchant, mapping.desc, mapping.account, mapping.directionMode, rules],
  );
  const previewRaws = raws.map((r, i) => (catOverrides[i] ? { ...r, category: catOverrides[i] } : r));
  const result = useMemo(() => dedupe(previewRaws, txns), [previewRaws, txns]);

  const commit = () => {
    if (result.added.length === 0) { setDone('ไม่มีรายการใหม่ให้เพิ่ม'); return; }
    setImported((p) => [...p, ...result.added]);
    setDone(`เพิ่ม ${result.added.length} รายการ · ข้ามซ้ำ ${result.duplicates}`);
    setText(''); setCatOverrides({});
  };

  if (!open) return null;
  const colOptions = Array.from({ length: cols }, (_, i) => i);

  return (
    <Modal open={open} onClose={onClose} labelledBy="smartimport-title" maxW="max-w-2xl">
        <div className="sticky top-0 bg-surface border-b border-line px-4 py-3 flex items-center justify-between z-10">
          <h2 id="smartimport-title" className="font-semibold flex items-center gap-2"><ClipboardPaste size={18} /> นำเข้าด้วยการวางข้อความ</h2>
          <button aria-label="ปิด" onClick={onClose} className="btn-ghost !px-2 !py-1.5"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-ink-soft mb-1.5">วางรายการจาก statement (บรรทัดละ 1 รายการ) — รองรับคั่นด้วย comma / tab / ช่องว่าง</p>
            <textarea
              className="input font-mono text-xs h-28 resize-y"
              placeholder={'2026-06-10, 120, Grab, ค่าเดินทาง\n2026-06-11, 89, 7-Eleven, ของใช้'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {grid.length > 0 && (
            <>
              {/* mapping controls */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <label className="block"><span className="text-xs text-ink-soft">ตัวคั่น</span>
                  <select className="input mt-1 !py-1.5" value={delim} onChange={(e) => setDelim(e.target.value as PasteDelimiter)}>
                    <option value="auto">อัตโนมัติ</option><option value="comma">comma</option><option value="tab">tab</option><option value="space">ช่องว่าง</option>
                  </select></label>
                <label className="block"><span className="text-xs text-ink-soft">คอลัมน์ วันที่</span>
                  <select className="input mt-1 !py-1.5" value={mapping.date} onChange={(e) => setManual((m) => ({ ...m, date: Number(e.target.value) }))}>
                    {colOptions.map((i) => <option key={i} value={i}>คอลัมน์ {i + 1}</option>)}</select></label>
                <label className="block"><span className="text-xs text-ink-soft">คอลัมน์ จำนวนเงิน</span>
                  <select className="input mt-1 !py-1.5" value={mapping.amount} onChange={(e) => setManual((m) => ({ ...m, amount: Number(e.target.value) }))}>
                    {colOptions.map((i) => <option key={i} value={i}>คอลัมน์ {i + 1}</option>)}</select></label>
                <label className="block"><span className="text-xs text-ink-soft">คอลัมน์ ร้าน</span>
                  <select className="input mt-1 !py-1.5" value={mapping.merchant ?? -1} onChange={(e) => setManual((m) => ({ ...m, merchant: Number(e.target.value) < 0 ? null : Number(e.target.value) }))}>
                    <option value={-1}>—</option>{colOptions.map((i) => <option key={i} value={i}>คอลัมน์ {i + 1}</option>)}</select></label>
                <label className="block"><span className="text-xs text-ink-soft">คอลัมน์ รายละเอียด</span>
                  <select className="input mt-1 !py-1.5" value={mapping.desc ?? -1} onChange={(e) => setManual((m) => ({ ...m, desc: Number(e.target.value) < 0 ? null : Number(e.target.value) }))}>
                    <option value={-1}>—</option>{colOptions.map((i) => <option key={i} value={i}>คอลัมน์ {i + 1}</option>)}</select></label>
                <label className="block"><span className="text-xs text-ink-soft">บัญชี</span>
                  <select className="input mt-1 !py-1.5" value={account} onChange={(e) => setAccount(e.target.value)}>
                    {ACCOUNTS.map((a) => <option key={a} value={a}>{a.startsWith('KBank') ? 'KBank' : 'UOB'}</option>)}</select></label>
                <label className="block col-span-2 sm:col-span-3"><span className="text-xs text-ink-soft">ทิศทางเงิน</span>
                  <select className="input mt-1 !py-1.5" value={directionMode} onChange={(e) => setDirectionMode(e.target.value as any)}>
                    <option value="out">จ่ายออกทั้งหมด</option><option value="in">รับเข้าทั้งหมด</option><option value="sign">ตามเครื่องหมาย (ติดลบ = จ่าย)</option>
                  </select></label>
              </div>

              {/* preview */}
              <div>
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="font-medium">ตัวอย่าง ({result.added.length} ใหม่ · {result.duplicates} ซ้ำ)</span>
                  <span className="text-ink-soft text-xs">หมวดจัดอัตโนมัติ แก้ได้</span>
                </div>
                {result.overlaps.length > 0 && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5 items-start mb-2">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{result.overlaps.join(' · ')}</span>
                  </div>
                )}
                <div className="max-h-56 overflow-y-auto rounded-xl border border-line divide-y divide-line/60">
                  {previewRaws.length === 0 && <div className="p-4 text-center text-sm text-ink-soft">ยังแมปคอลัมน์ไม่ได้ — ลองปรับตัวคั่น/คอลัมน์</div>}
                  {previewRaws.slice(0, 50).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="text-xs text-ink-soft w-14 shrink-0">{formatDate(r.date)}</span>
                      <span className="truncate flex-1">{r.merchant}</span>
                      <select className="input !w-auto !py-1 !px-2 text-xs max-w-[130px]" value={r.category}
                        onChange={(e) => setCatOverrides((o) => ({ ...o, [i]: e.target.value }))}>
                        {!CAT_NAMES.includes(r.category) && <option value={r.category}>{r.category}</option>}
                        {CAT_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span className={`tnum font-semibold w-16 text-right shrink-0 ${r.direction === 'in' ? 'text-emerald-500' : ''}`}>
                        {r.direction === 'in' ? '+' : ''}{formatTHB(r.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {done && <div className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><Check size={15} /> {done}</div>}

          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost flex-1">ปิด</button>
            <button onClick={commit} disabled={result.added.length === 0} className="btn-primary flex-1">
              <Check size={16} /> เพิ่ม {result.added.length} รายการ
            </button>
          </div>
        </div>
    </Modal>
  );
}
