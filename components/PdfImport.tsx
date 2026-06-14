'use client';

import { useMemo, useRef, useState } from 'react';
import { X, FileText, Check, AlertTriangle, Lock, Loader2 } from 'lucide-react';
import { useData } from './DataProvider';
import { CATEGORIES, categoryColor } from '@/lib/categories';
import { formatTHB, formatDate } from '@/lib/format';
import { dedupe } from '@/lib/io';
import { extractPdfLines, PdfPasswordError } from '@/lib/pdf/extract';
import { parseUobStatement, type UobParseResult } from '@/lib/pdf/uob';

const CAT_NAMES = CATEGORIES.map((c) => c.name);

export function PdfImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { txns, setImported } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [needPw, setNeedPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UobParseResult | null>(null);
  const [catOverrides, setCatOverrides] = useState<Record<number, string>>({});
  const [done, setDone] = useState('');

  const run = async (file: File, pw?: string) => {
    setBusy(true); setError(''); setDone('');
    try {
      const lines = await extractPdfLines(file, pw);
      const r = parseUobStatement(lines);
      if (r.transactions.length === 0) {
        setError('ไม่พบรายการในไฟล์ — อาจเป็น PDF สแกนภาพ หรือไม่ใช่ statement UOB');
      }
      setResult(r); setNeedPw(false); setCatOverrides({});
    } catch (e) {
      if (e instanceof PdfPasswordError) { setNeedPw(true); setPendingFile(file); }
      else { setError('อ่านไฟล์ไม่สำเร็จ: ' + (e as Error).message); }
    } finally {
      setBusy(false);
    }
  };

  const onPick = (file?: File) => { if (file) { setResult(null); setPassword(''); run(file); } };

  const previewRaws = useMemo(
    () => (result?.transactions ?? []).map((t, i) => (catOverrides[i] ? { ...t, category: catOverrides[i] } : t)),
    [result, catOverrides],
  );
  const ded = useMemo(() => dedupe(previewRaws, txns), [previewRaws, txns]);

  // bill summary: purchases grouped by category (net of in-bill refunds)
  const bill = useMemo(() => {
    const map = new Map<string, number>();
    let refunds = 0;
    for (const t of previewRaws) {
      if (t.direction === 'in') { refunds += t.amount; continue; }
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    const rows = [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
    const purchases = rows.reduce((s, r) => s + r.total, 0);
    return { rows, purchases, refunds };
  }, [previewRaws]);

  const commit = () => {
    if (ded.added.length === 0) { setDone('ไม่มีรายการใหม่ (อาจนำเข้าไปแล้ว)'); return; }
    setImported((p) => [...p, ...ded.added]);
    setDone(`เพิ่ม ${ded.added.length} รายการ · ข้ามซ้ำ ${ded.duplicates}`);
    setResult(null);
  };

  const close = () => { setResult(null); setError(''); setNeedPw(false); setPassword(''); setPendingFile(null); setDone(''); onClose(); };

  if (!open) return null;
  const s = result?.summary;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={close}>
      <div className="card w-full max-w-2xl rounded-b-none sm:rounded-2xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-line px-4 py-3 flex items-center justify-between z-10">
          <h2 className="font-semibold flex items-center gap-2"><FileText size={18} /> นำเข้า PDF บิลบัตรเครดิต (UOB)</h2>
          <button aria-label="ปิด" onClick={close} className="btn-ghost !px-2 !py-1.5"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden
            onChange={(e) => onPick(e.target.files?.[0])} />

          {!result && !needPw && (
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="w-full border-2 border-dashed border-line rounded-2xl py-10 text-center hover:border-brand transition-colors">
              {busy ? <span className="inline-flex items-center gap-2 text-ink-soft"><Loader2 size={18} className="animate-spin" /> กำลังอ่านไฟล์…</span>
                : <span className="text-ink-soft"><FileText size={28} className="mx-auto mb-2" /><br />เลือกไฟล์ PDF statement</span>}
            </button>
          )}

          {needPw && (
            <div className="space-y-2">
              <p className="text-sm flex items-center gap-1.5"><Lock size={15} /> ไฟล์ล็อกรหัสผ่าน</p>
              <div className="flex gap-2">
                <input type="password" className="input" placeholder="รหัสผ่าน PDF" value={password}
                  onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pendingFile && run(pendingFile, password)} />
                <button className="btn-primary" disabled={busy || !pendingFile} onClick={() => pendingFile && run(pendingFile, password)}>ปลดล็อก</button>
              </div>
            </div>
          )}

          {error && <div className="text-sm text-rose-500 flex gap-1.5 items-start"><AlertTriangle size={14} className="mt-0.5" />{error}</div>}

          {s && (
            <>
              {/* reconcile summary */}
              <div className={`rounded-xl p-3 ${s.reconciled ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  {s.reconciled ? <><Check size={16} className="text-emerald-500" /> ยอดตรงกับสลิป</>
                    : <><AlertTriangle size={16} className="text-amber-500" /> ยอดไม่ตรง (ส่วนต่างอาจเป็นดอกเบี้ย/ค่าธรรมเนียม)</>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><div className="text-ink-soft">รอบบิล</div><div className="font-semibold">{s.statementDate || '—'}</div></div>
                  <div><div className="text-ink-soft">ยอดรวมบิล</div><div className="font-semibold tnum">{s.totalBalance != null ? formatTHB(s.totalBalance) : '—'}</div></div>
                  <div><div className="text-ink-soft">รูดสุทธิ (แกะได้)</div><div className="font-semibold tnum">{formatTHB(s.parsedNet)}</div></div>
                  <div><div className="text-ink-soft">ส่วนต่าง</div><div className={`font-semibold tnum ${s.reconciled ? '' : 'text-amber-600'}`}>{s.diff != null ? formatTHB(s.diff) : '—'}</div></div>
                </div>
              </div>

              {/* bill summary */}
              <div className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">สรุปบิล (ก่อนชำระ)</span>
                  <div className="text-right">
                    <div className="text-xs text-ink-soft">ยอดที่ต้องชำระ</div>
                    <div className="text-lg font-bold tnum text-rose-500">{s.totalBalance != null ? formatTHB(s.totalBalance) : formatTHB(bill.purchases)}</div>
                    {s.minPayment != null && <div className="text-[11px] text-ink-soft">ขั้นต่ำ {formatTHB(s.minPayment)}</div>}
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {bill.rows.slice(0, 6).map((r) => (
                    <li key={r.category}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: categoryColor(r.category) }} /><span className="truncate">{r.category}</span></span>
                        <span className="tnum font-medium shrink-0">{formatTHB(r.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1">
                        <div className="h-full rounded-full" style={{ width: `${bill.purchases ? Math.max(3, (r.total / bill.purchases) * 100) : 0}%`, background: categoryColor(r.category) }} />
                      </div>
                    </li>
                  ))}
                </ul>
                {bill.refunds > 0 && <p className="text-xs text-emerald-600 mt-2">มีเงินคืนในบิล {formatTHB(bill.refunds)} (หักออกแล้ว)</p>}
                <p className="text-[11px] text-ink-soft mt-2 flex gap-1.5 items-start">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  เมื่อจ่ายบิลนี้จาก KBank รายการ “จ่ายค่าบัตร” จะถูกตั้งเป็นหมวด “ชำระบัตรเครดิต” อัตโนมัติ และ<b>ไม่ถูกนับซ้ำ</b>กับรายการในบิล
                </p>
              </div>

              {/* preview */}
              <div>
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="font-medium">{result!.transactions.length} รายการ · ใหม่ {ded.added.length} · ซ้ำ {ded.duplicates}</span>
                  <span className="text-ink-soft text-xs">หมวดจัดอัตโนมัติ แก้ได้</span>
                </div>
                {ded.overlaps.length > 0 && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5 items-start mb-2"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{ded.overlaps.join(' · ')}</span></div>
                )}
                <div className="max-h-64 overflow-y-auto rounded-xl border border-line divide-y divide-line/60">
                  {previewRaws.slice(0, 200).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="text-xs text-ink-soft w-12 shrink-0">{formatDate(r.date)}</span>
                      <span className="truncate flex-1" title={r.desc}>{r.merchant}</span>
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
            <button onClick={close} className="btn-ghost flex-1">ปิด</button>
            {result && <button onClick={commit} disabled={ded.added.length === 0} className="btn-primary flex-1"><Check size={16} /> เพิ่ม {ded.added.length} รายการ</button>}
          </div>
          <p className="text-[11px] text-ink-soft text-center">อ่านไฟล์ในเครื่องด้วย pdf.js · ไฟล์ไม่ถูกส่งออกไปไหน</p>
        </div>
      </div>
    </div>
  );
}
