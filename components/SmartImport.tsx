'use client';

import { useMemo, useState } from 'react';
import { X, ClipboardPaste, Check, AlertTriangle } from 'lucide-react';
import { useData } from './DataProvider';
import { Modal, CategorySelect } from './ui';
import { autoCategorize } from '@/lib/autocat';
import { formatTHB, formatDate } from '@/lib/format';
import {
  splitPasted, rowsFromMapping, dedupe, parseDateLoose, parseAmountLoose,
  type PasteDelimiter, type PasteMapping,
} from '@/lib/io';
import { dedupKey } from '@/lib/data';

const ACCOUNTS = ['KBank ออมทรัพย์', 'UOB บัตรเครดิต'];
const NO_EDITS: Record<number, string> = {};

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
  const [done, setDone] = useState<string | null>(null);

  const grid = useMemo(() => splitPasted(text, delim), [text, delim]);
  const guess = useMemo(() => guessColumns(grid), [grid]);
  const cols = Math.max(0, ...grid.map((r) => r.length));

  const mapping: PasteMapping = useMemo(
    () => ({
      date: manual.date ?? guess.date,
      amount: manual.amount ?? guess.amount,
      merchant: manual.merchant !== undefined ? manual.merchant : guess.merchant,
      desc: manual.desc !== undefined ? manual.desc : guess.desc,
      account,
      directionMode,
    }),
    [manual, guess, account, directionMode],
  );

  // Category edits belong to one parse of one input, so they are stored with
  // the input they were made against. Any change to the input gives a new key
  // and the old edits simply stop applying — an effect used to clear them,
  // which rendered twice.
  const inputKey = useMemo(
    () => JSON.stringify([text, delim, account, directionMode, manual]),
    [text, delim, account, directionMode, manual],
  );
  const [edits, setEdits] = useState<{ key: string; map: Record<number, string> }>({ key: '', map: {} });
  const catOverrides = edits.key === inputKey ? edits.map : NO_EDITS;
  const setCatOverride = (i: number, category: string) =>
    setEdits((prev) => ({ key: inputKey, map: { ...(prev.key === inputKey ? prev.map : {}), [i]: category } }));

  const raws = useMemo(
    () => rowsFromMapping(grid, mapping, (m, d, amt) => autoCategorize(m, d, rules, amt)),
    [grid, mapping, rules],
  );
  const previewRaws = raws.map((r, i) => (catOverrides[i] ? { ...r, category: catOverrides[i] } : r));
  const result = useMemo(() => dedupe(previewRaws, txns), [previewRaws, txns]);

  // which preview rows dedupe() will SKIP — mirrors its count-matching so the
  // user can see (and not waste category edits on) rows that won't be imported
  const isDup = useMemo(() => {
    const existing = new Map<string, number>();
    for (const t of txns) {
      const k = dedupKey(t);
      existing.set(k, (existing.get(k) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    return previewRaws.map((r) => {
      const k = dedupKey(r);
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return n < (existing.get(k) ?? 0);
    });
  }, [previewRaws, txns]);

  const commit = () => {
    if (result.added.length === 0) { setDone('ไม่มีรายการใหม่ให้เพิ่ม'); return; }
    setImported((p) => [...p, ...result.added]);
    setDone(`เพิ่ม ${result.added.length} รายการ · ข้ามซ้ำ ${result.duplicates}`);
    setText(''); setEdits({ key: '', map: {} });
  };

  if (!open) return null;
  const colOptions = Array.from({ length: cols }, (_, i) => i);

  return (
    <Modal open={open} onClose={onClose} labelledBy="smartimport-title" maxW="max-w-2xl">
        <div className="sticky top-0 bg-surface border-b border-line px-4 py-3 flex items-center justify-between z-10">
          <h2 id="smartimport-title" className="font-semibold flex items-center gap-2"><ClipboardPaste size={18} /> นำเข้าด้วยการวางข้อความ</h2>
          <button aria-label="ปิด" onClick={onClose} className="btn-ghost btn-icon"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-caption text-ink-soft mb-1.5">วางรายการจาก statement (บรรทัดละ 1 รายการ) — รองรับคั่นด้วย comma / tab / ช่องว่าง</p>
            <textarea
              className="input font-mono sm:text-body-sm h-28 resize-y"
              placeholder={'2026-06-10, 120, Grab, ค่าเดินทาง\n2026-06-11, 89, 7-Eleven, ของใช้'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {grid.length > 0 && (
            <>
              {/* mapping controls */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="block"><span className="field-label">ตัวคั่น</span>
                  <select className="input !py-1.5" value={delim} onChange={(e) => setDelim(e.target.value as PasteDelimiter)}>
                    <option value="auto">อัตโนมัติ</option><option value="comma">comma</option><option value="tab">tab</option><option value="space">ช่องว่าง</option>
                  </select></label>
                <label className="block"><span className="field-label">คอลัมน์ วันที่</span>
                  <select className="input !py-1.5" value={mapping.date} onChange={(e) => setManual((m) => ({ ...m, date: Number(e.target.value) }))}>
                    {colOptions.map((i) => <option key={i} value={i}>คอลัมน์ {i + 1}</option>)}</select></label>
                <label className="block"><span className="field-label">คอลัมน์ จำนวนเงิน</span>
                  <select className="input !py-1.5" value={mapping.amount} onChange={(e) => setManual((m) => ({ ...m, amount: Number(e.target.value) }))}>
                    {colOptions.map((i) => <option key={i} value={i}>คอลัมน์ {i + 1}</option>)}</select></label>
                <label className="block"><span className="field-label">คอลัมน์ ร้าน</span>
                  <select className="input !py-1.5" value={mapping.merchant ?? -1} onChange={(e) => setManual((m) => ({ ...m, merchant: Number(e.target.value) < 0 ? null : Number(e.target.value) }))}>
                    <option value={-1}>ไม่ใช้คอลัมน์นี้</option>{colOptions.map((i) => <option key={i} value={i}>คอลัมน์ {i + 1}</option>)}</select></label>
                <label className="block"><span className="field-label">คอลัมน์ รายละเอียด</span>
                  <select className="input !py-1.5" value={mapping.desc ?? -1} onChange={(e) => setManual((m) => ({ ...m, desc: Number(e.target.value) < 0 ? null : Number(e.target.value) }))}>
                    <option value={-1}>ไม่ใช้คอลัมน์นี้</option>{colOptions.map((i) => <option key={i} value={i}>คอลัมน์ {i + 1}</option>)}</select></label>
                <label className="block"><span className="field-label">บัญชี</span>
                  <select className="input !py-1.5" value={account} onChange={(e) => setAccount(e.target.value)}>
                    {ACCOUNTS.map((a) => <option key={a} value={a}>{a.startsWith('KBank') ? 'KBank' : 'UOB'}</option>)}</select></label>
                <label className="block col-span-2 sm:col-span-3"><span className="field-label">ทิศทางเงิน</span>
                  <select className="input !py-1.5" value={directionMode} onChange={(e) => setDirectionMode(e.target.value as any)}>
                    <option value="out">จ่ายออกทั้งหมด</option><option value="in">รับเข้าทั้งหมด</option><option value="sign">ตามเครื่องหมาย (ติดลบ = จ่าย)</option>
                  </select></label>
              </div>

              {/* preview */}
              <div>
                <div className="flex items-center justify-between mb-2 text-body-sm">
                  <span className="font-medium">ตัวอย่าง ({result.added.length} ใหม่ · {result.duplicates} ซ้ำ)</span>
                  <span className="text-ink-soft text-caption">หมวดจัดอัตโนมัติ แก้ได้</span>
                </div>
                {result.overlaps.length > 0 && (
                  <div className="text-caption text-warning flex gap-1.5 items-start mb-2">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{result.overlaps.join(' · ')}</span>
                  </div>
                )}
                <div className="max-h-56 overflow-y-auto rounded-xl border border-line divide-y divide-line/60">
                  {previewRaws.length === 0 && <div className="p-4 text-center text-body-sm text-ink-soft">ยังแมปคอลัมน์ไม่ได้ — ลองปรับตัวคั่น/คอลัมน์</div>}
                  {previewRaws.slice(0, 50).map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 px-3 py-2 text-body-sm ${isDup[i] ? 'opacity-45' : ''}`}>
                      <span className="text-caption text-ink-soft w-14 shrink-0">{formatDate(r.date)}</span>
                      <span className="truncate flex-1">{r.merchant}</span>
                      {isDup[i] ? (
                        <span className="pill bg-surface-2 text-ink-soft shrink-0">ซ้ำ — ไม่นำเข้า</span>
                      ) : (
                        <span className="max-w-36 min-w-0 shrink">
                          <CategorySelect value={r.category}
                            onChange={(v) => setCatOverride(i, v)} />
                        </span>
                      )}
                      <span className={`tnum font-semibold w-16 text-right shrink-0 ${r.direction === 'in' ? 'text-success' : ''}`}>
                        {r.direction === 'in' ? '+' : ''}{formatTHB(r.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {done && <div className="text-body-sm text-success flex items-center gap-1.5"><Check size={15} /> {done}</div>}

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
