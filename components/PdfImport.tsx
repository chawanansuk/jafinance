'use client';

import { useMemo, useRef, useState } from 'react';
import { X, FileText, Check, AlertTriangle, Lock, Loader2, Image as ImageIcon, Sparkles, ArrowLeft } from 'lucide-react';
import { useData } from './DataProvider';
import { CATEGORIES, categoryColor } from '@/lib/categories';
import { formatTHB, formatDate } from '@/lib/format';
import { dedupe } from '@/lib/io';
import { extractPdfLines, PdfPasswordError } from '@/lib/pdf/extract';
import { summarizeBill } from '@/lib/pdf/uob';
import { parseStatement, type StatementResult } from '@/lib/pdf/statement';
import { ocrImage } from '@/lib/ocr/extract';
import { extractStatementWithAI, aiErrorMessage, AI_MODELS, DEFAULT_AI_MODEL } from '@/lib/ai/statement';
import { useLocalStorage, KEYS } from '@/lib/storage';
import { Modal } from './ui';
import type { Statement } from '@/lib/types';

const CAT_NAMES = CATEGORIES.map((c) => c.name);

export function PdfImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { txns, setImported, addStatement } = useData();
  const pdfRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const aiRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [needPw, setNeedPw] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<StatementResult | null>(null);
  const [catOverrides, setCatOverrides] = useState<Record<number, string>>({});
  const [done, setDone] = useState('');
  const [cloud, setCloud] = useState(false);
  const [aiKey, setAiKey] = useLocalStorage<string>(KEYS.aiKey, '');
  const [aiModel, setAiModel] = useLocalStorage<string>(KEYS.aiModel, DEFAULT_AI_MODEL);

  const run = async (file: File, pw?: string) => {
    setBusy(file.type.startsWith('image/') ? 'กำลังอ่านรูป…' : 'กำลังอ่านไฟล์…'); setError(''); setDone('');
    try {
      let lines: string[];
      if (file.type.startsWith('image/')) {
        const text = await ocrImage(file, (p) => setBusy(`อ่านรูป ${Math.round(p.progress * 100)}%`));
        lines = text.split('\n');
      } else {
        lines = await extractPdfLines(file, pw);
      }
      const r = parseStatement(lines);
      if (!r) { setError('ไม่รู้จักรูปแบบสเตทเมนต์ (รองรับ UOB / KBank) — ลองไฟล์ PDF จะแม่นกว่ารูป'); setResult(null); }
      else { setResult(r); if (r.transactions.length === 0) setError('อ่านไม่เจอรายการ — รูปอาจไม่ชัด ลองใช้ PDF'); }
      setNeedPw(false); setCatOverrides({});
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setNeedPw(true);
        setPendingFile(file);
        // a retry that supplied a password and still landed here = wrong password
        if (pw != null) setError('รหัสผ่านไม่ถูกต้อง — ลองใหม่อีกครั้ง');
      } else { setError('อ่านไฟล์ไม่สำเร็จ: ' + (e as Error).message); }
    } finally {
      setBusy('');
    }
  };

  const onPick = (file?: File) => { if (file) { setResult(null); setPassword(''); run(file); } };

  const runCloud = async (file: File) => {
    setResult(null); setError(''); setDone(''); setBusy('ส่งให้ Cloud AI อ่าน…');
    try {
      const r = await extractStatementWithAI(file, { apiKey: aiKey, model: aiModel });
      if (r.transactions.length === 0) { setError('AI อ่านไม่เจอรายการ — รูปอาจไม่ชัด'); setResult(null); }
      else { setResult(r); setCloud(false); }
      setCatOverrides({});
    } catch (e) {
      setError(aiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const onPickCloud = (file?: File) => { if (file) runCloud(file); };

  const previewRaws = useMemo(
    () => (result?.transactions ?? []).map((t, i) => (catOverrides[i] ? { ...t, category: catOverrides[i] } : t)),
    [result, catOverrides],
  );
  const ded = useMemo(() => dedupe(previewRaws, txns), [previewRaws, txns]);

  const bill = useMemo(() => {
    const map = new Map<string, number>();
    let refunds = 0;
    for (const t of previewRaws) {
      if (t.direction === 'in') { refunds += t.amount; continue; }
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    const rows = [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
    return { rows, purchases: rows.reduce((s, r) => s + r.total, 0), refunds };
  }, [previewRaws]);

  const commit = () => {
    if (!result) return;
    if (ded.added.length === 0) { setDone('ไม่มีรายการใหม่ (อาจนำเข้าไปแล้ว)'); return; }
    setImported((p) => [...p, ...ded.added]);
    const sm = summarizeBill(previewRaws);
    addStatement({
      id: `${result.bank}|${result.statementDate}|${result.account}`,
      account: `${result.bank} ${result.account}`,
      statementDate: result.statementDate,
      dateFrom: sm.dateFrom, dateTo: sm.dateTo,
      totalBalance: result.amountDue, minPayment: result.minPayment,
      purchases: sm.purchases, refunds: sm.refunds,
      parsedNet: sm.purchases - sm.refunds, reconciled: result.reconciled,
      count: result.transactions.length,
      byCategory: sm.byCategory,
      importedAt: new Date().toISOString(),
    } as Statement);
    setDone(`เพิ่ม ${ded.added.length} รายการ · บันทึกสรุปแล้ว`);
    setResult(null);
  };

  const close = () => {
    if (result && result.transactions.length > 0 && !done) {
      if (!confirm('ยังไม่ได้กด "เพิ่มรายการ" — ปิดแล้วผลที่อ่านได้และหมวดที่แก้ไว้จะหายไป ปิดเลย?')) return;
    }
    setResult(null); setError(''); setNeedPw(false); setPassword(''); setPendingFile(null); setDone(''); setCloud(false); onClose();
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={close} labelledBy="pdfimport-title" maxW="max-w-2xl">
        <div className="sticky top-0 bg-surface border-b border-line px-4 py-3 flex items-center justify-between z-10">
          <h2 id="pdfimport-title" className="font-semibold flex items-center gap-2"><FileText size={18} /> นำเข้าสเตทเมนต์ (UOB / KBank)</h2>
          <button aria-label="ปิด" onClick={close} className="btn-ghost !px-2 !py-1.5"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={aiRef} type="file" accept="image/*" hidden onChange={(e) => { onPickCloud(e.target.files?.[0]); e.target.value = ''; }} />

          {!result && !needPw && (
            busy ? (
              <div className="w-full border-2 border-dashed border-line rounded-2xl py-10 text-center text-ink-soft">
                <Loader2 size={20} className="animate-spin mx-auto mb-2" /> {busy}
              </div>
            ) : cloud ? (
              <div className="space-y-3">
                <button onClick={() => { setCloud(false); setError(''); }} className="btn-ghost !px-2 !py-1 text-xs"><ArrowLeft size={14} /> กลับ</button>
                <div className="rounded-xl bg-brand/5 border border-brand/20 p-3 space-y-2.5">
                  <p className="text-sm font-medium flex items-center gap-1.5"><Sparkles size={15} className="text-brand" /> อ่านด้วย Cloud AI (แม่นกับรูปมาก)</p>
                  <label className="block">
                    <span className="text-xs text-ink-soft">Claude API key</span>
                    <input type="password" className="input mt-1 !py-1.5 font-mono text-xs" placeholder="sk-ant-…"
                      value={aiKey} onChange={(e) => setAiKey(e.target.value)} autoComplete="off" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-ink-soft">โมเดล</span>
                    <select className="input mt-1 !py-1.5" value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
                      {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </label>
                  <button onClick={() => aiRef.current?.click()} disabled={!aiKey.trim()}
                    className="btn-primary w-full disabled:opacity-50"><ImageIcon size={16} /> เลือกรูปแล้วอ่านด้วย AI</button>
                  <p className="text-[11px] text-ink-soft">คีย์เก็บในเบราว์เซอร์ · รูป+คีย์ส่งตรงถึง Claude API ไม่ผ่านเซิร์ฟเวอร์อื่น · ออกคีย์ที่ console.anthropic.com</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => pdfRef.current?.click()} className="border-2 border-dashed border-line rounded-2xl py-8 text-center hover:border-brand transition-colors text-ink-soft">
                  <FileText size={24} className="mx-auto mb-1.5" /><br />ไฟล์ PDF<br /><span className="text-[11px]">(แม่นสุด)</span>
                </button>
                <button onClick={() => imgRef.current?.click()} className="border-2 border-dashed border-line rounded-2xl py-8 text-center hover:border-brand transition-colors text-ink-soft">
                  <ImageIcon size={24} className="mx-auto mb-1.5" /><br />รูปภาพ<br /><span className="text-[11px]">(OCR)</span>
                </button>
                <button onClick={() => { setError(''); setCloud(true); }} className="border-2 border-dashed border-brand/40 rounded-2xl py-8 text-center hover:border-brand transition-colors text-brand">
                  <Sparkles size={24} className="mx-auto mb-1.5" /><br />Cloud AI<br /><span className="text-[11px]">(รูป·แม่น)</span>
                </button>
              </div>
            )
          )}

          {needPw && (
            <div className="space-y-2">
              <p className="text-sm flex items-center gap-1.5"><Lock size={15} /> ไฟล์ล็อกรหัสผ่าน</p>
              <div className="flex gap-2">
                <input type="password" className="input" placeholder="รหัสผ่าน PDF" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !busy && pendingFile) { setError(''); run(pendingFile, password); } }} />
                <button className="btn-primary" disabled={!!busy || !pendingFile} onClick={() => pendingFile && run(pendingFile, password)}>ปลดล็อก</button>
              </div>
            </div>
          )}

          {error && <div className="text-sm text-rose-500 flex gap-1.5 items-start"><AlertTriangle size={14} className="mt-0.5" />{error}</div>}

          {result && result.transactions.length > 0 && (
            <>
              {/* reconcile summary */}
              <div className={`rounded-xl p-3 ${result.reconciled ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  {result.reconciled ? <><Check size={16} className="text-emerald-500" /> ยอดตรงกับสเตทเมนต์ ({result.bank})</>
                    : <><AlertTriangle size={16} className="text-amber-500" /> ยอดไม่ตรง — ตรวจรายการ/ลองใช้ PDF ({result.bank})</>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {result.summaryRows.map((r) => (
                    <div key={r.label}><div className="text-ink-soft">{r.label}</div><div className={`font-semibold tnum ${r.warn ? 'text-amber-600' : ''}`}>{r.value}</div></div>
                  ))}
                </div>
              </div>

              {/* category breakdown */}
              <div className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">สรุปแยกหมวด</span>
                  {result.amountDue != null && (
                    <div className="text-right">
                      <div className="text-xs text-ink-soft">ยอดที่ต้องชำระ</div>
                      <div className="text-lg font-bold tnum text-rose-500">{formatTHB(result.amountDue)}</div>
                      {result.minPayment != null && <div className="text-[11px] text-ink-soft">ขั้นต่ำ {formatTHB(result.minPayment)}</div>}
                    </div>
                  )}
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
                {bill.refunds > 0 && <p className="text-xs text-emerald-600 mt-2">เงินคืน/รับเข้า {formatTHB(bill.refunds)}</p>}
              </div>

              {/* preview */}
              <div>
                <div className="flex items-center justify-between mb-2 text-sm">
                  <span className="font-medium">{result.transactions.length} รายการ · ใหม่ {ded.added.length} · ซ้ำ {ded.duplicates}</span>
                  <span className="text-ink-soft text-xs">หมวดจัดอัตโนมัติ แก้ได้</span>
                </div>
                {ded.overlaps.length > 0 && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5 items-start mb-2"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{ded.overlaps.join(' · ')}</span></div>
                )}
                <div className="max-h-64 overflow-y-auto rounded-xl border border-line divide-y divide-line/60">
                  {previewRaws.slice(0, 300).map((r, i) => (
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
            {result && result.transactions.length > 0 && <button onClick={commit} disabled={ded.added.length === 0} className="btn-primary flex-1"><Check size={16} /> เพิ่ม {ded.added.length} รายการ</button>}
          </div>
          {!cloud && <p className="text-[11px] text-ink-soft text-center">PDF/OCR อ่านในเครื่อง ไม่ส่งออก · Cloud AI ส่งรูปไป Claude API</p>}
        </div>
    </Modal>
  );
}
