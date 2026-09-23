'use client';

import { useMemo, useRef, useState } from 'react';
import { X, FileText, Check, AlertTriangle, Lock, Loader2, Image as ImageIcon, Sparkles, ArrowLeft } from 'lucide-react';
import { useData } from './DataProvider';
import { categoryColor } from '@/lib/categories';
import { formatTHB, formatDate } from '@/lib/format';
import { dedupe } from '@/lib/io';
import { extractPdfLines, PdfPasswordError } from '@/lib/pdf/extract';
import { summarizeBill } from '@/lib/pdf/uob';
import { parseStatement, type StatementResult } from '@/lib/pdf/statement';
import { ocrImage } from '@/lib/ocr/extract';
import { extractStatementWithAI, aiErrorMessage, AI_MODELS, DEFAULT_AI_MODEL, resolveAiModel } from '@/lib/ai/statement';
import { useLocalStorage, KEYS } from '@/lib/storage';
import { Modal, CategorySelect } from './ui';
import type { Statement } from '@/lib/types';


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

  const runCloud = async (files: File[]) => {
    setResult(null); setError(''); setDone(''); setBusy('ส่งให้ Cloud AI อ่าน…');
    try {
      const r = await extractStatementWithAI(files, { apiKey: aiKey, model: aiModel, onProgress: setBusy });
      if (r.transactions.length === 0) { setError('AI อ่านไม่เจอรายการ — รูปอาจไม่ชัด'); setResult(null); }
      else { setResult(r); setCloud(false); }
      setCatOverrides({});
    } catch (e) {
      setError(aiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const onPickCloud = (files: File[]) => { if (files.length) runCloud(files); };

  // per-row trust flags from the KBank parser: which amounts were repaired
  // from the balance column, and where the chain stops adding up
  const fixedAt = useMemo(() => new Map((result?.corrections ?? []).map((c) => [c.index, c])), [result]);
  const brokenAt = useMemo(() => new Set(result?.chainBreaks ?? []), [result]);

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
          <button aria-label="ปิด" onClick={close} className="btn-ghost btn-icon"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={aiRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { onPickCloud(e.target.files ? [...e.target.files] : []); e.target.value = ''; }} />

          {!result && !needPw && (
            busy ? (
              <div className="w-full border-2 border-dashed border-line rounded-2xl py-10 text-center text-ink-soft">
                <Loader2 size={20} className="animate-spin mx-auto mb-2" /> {busy}
              </div>
            ) : cloud ? (
              <div className="space-y-3">
                <button onClick={() => { setCloud(false); setError(''); }} className="btn-ghost btn-sm"><ArrowLeft size={14} /> กลับ</button>
                <div className="rounded-xl bg-brand/5 border border-brand/20 p-3 space-y-2.5">
                  <p className="text-body font-medium flex items-center gap-1.5"><Sparkles size={15} className="text-brand" /> อ่านด้วย Cloud AI (แม่นกับรูปมาก)</p>
                  <label className="block">
                    <span className="field-label">Claude API key</span>
                    <input type="password" className="input !py-1.5 font-mono" placeholder="sk-ant-…"
                      value={aiKey} onChange={(e) => setAiKey(e.target.value)} autoComplete="off" />
                  </label>
                  <label className="block">
                    <span className="field-label">โมเดล</span>
                    <select className="input !py-1.5" value={resolveAiModel(aiModel)} onChange={(e) => setAiModel(e.target.value)}>
                      {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </label>
                  <button onClick={() => aiRef.current?.click()} disabled={!aiKey.trim()}
                    className="btn-primary w-full disabled:opacity-50"><ImageIcon size={16} /> เลือกรูปแล้วอ่านด้วย AI (เลือกได้หลายรูปถ้ามีหลายหน้า)</button>
                  <p className="text-caption text-ink-soft">คีย์เก็บในเบราว์เซอร์ · รูป+คีย์ส่งตรงถึง Claude API ไม่ผ่านเซิร์ฟเวอร์อื่น · ออกคีย์ที่ console.anthropic.com</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => pdfRef.current?.click()} className="border-2 border-dashed border-line rounded-2xl py-8 text-center hover:border-brand transition-colors text-ink-soft">
                  <FileText size={24} className="mx-auto mb-1.5" /><br />ไฟล์ PDF<br /><span className="text-caption">(แม่นสุด)</span>
                </button>
                <button onClick={() => imgRef.current?.click()} className="border-2 border-dashed border-line rounded-2xl py-8 text-center hover:border-brand transition-colors text-ink-soft">
                  <ImageIcon size={24} className="mx-auto mb-1.5" /><br />รูปภาพ<br /><span className="text-caption">(OCR)</span>
                </button>
                <button onClick={() => { setError(''); setCloud(true); }} className="border-2 border-dashed border-brand/40 rounded-2xl py-8 text-center hover:border-brand transition-colors text-brand">
                  <Sparkles size={24} className="mx-auto mb-1.5" /><br />Cloud AI<br /><span className="text-caption">(รูป·แม่น)</span>
                </button>
              </div>
            )
          )}

          {needPw && (
            <div className="space-y-2">
              <p className="text-body font-medium flex items-center gap-1.5"><Lock size={15} /> ไฟล์ล็อกรหัสผ่าน</p>
              <div className="flex gap-2">
                <input type="password" className="input" placeholder="รหัสผ่าน PDF" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !busy && pendingFile) { setError(''); run(pendingFile, password); } }} />
                <button className="btn-primary" disabled={!!busy || !pendingFile} onClick={() => pendingFile && run(pendingFile, password)}>ปลดล็อก</button>
              </div>
            </div>
          )}

          {error && <div className="text-body-sm text-error flex gap-1.5 items-start"><AlertTriangle size={14} className="mt-0.5" />{error}</div>}

          {result && result.transactions.length > 0 && (
            <>
              {/* reconcile summary */}
              <div className={`rounded-xl p-3 ${result.reconciled ? 'bg-success/10' : 'bg-warning/10'}`}>
                <div className="flex items-center gap-2 text-body font-medium mb-2">
                  {result.reconciled ? <><Check size={16} className="text-success" /> ยอดตรงกับสเตทเมนต์ ({result.bank})</>
                    : <><AlertTriangle size={16} className="text-warning" /> ยอดไม่ตรง — ตรวจรายการ/ลองใช้ PDF ({result.bank})</>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-caption">
                  {result.summaryRows.map((r) => (
                    <div key={r.label}><div className="text-ink-soft">{r.label}</div><div className={`font-semibold tnum ${r.warn ? 'text-warning' : ''}`}>{r.value}</div></div>
                  ))}
                </div>
              </div>

              {/* category breakdown */}
              <div className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body font-semibold">สรุปแยกหมวด</span>
                  {result.amountDue != null && (
                    <div className="text-right">
                      <div className="text-caption text-ink-soft">ยอดที่ต้องชำระ</div>
                      <div className="text-h2 font-bold tnum text-error">{formatTHB(result.amountDue)}</div>
                      {result.minPayment != null && <div className="text-caption text-ink-soft">ขั้นต่ำ {formatTHB(result.minPayment)}</div>}
                    </div>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {bill.rows.slice(0, 6).map((r) => (
                    <li key={r.category}>
                      <div className="flex items-center justify-between text-body-sm">
                        <span className="flex items-center gap-2 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: categoryColor(r.category) }} /><span className="truncate">{r.category}</span></span>
                        <span className="tnum font-medium shrink-0">{formatTHB(r.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1">
                        <div className="h-full rounded-full" style={{ width: `${bill.purchases ? Math.max(3, (r.total / bill.purchases) * 100) : 0}%`, background: categoryColor(r.category) }} />
                      </div>
                    </li>
                  ))}
                </ul>
                {bill.refunds > 0 && <p className="text-caption text-success mt-2">เงินคืน/รับเข้า {formatTHB(bill.refunds)}</p>}
              </div>

              {/* preview */}
              <div>
                <div className="flex items-center justify-between mb-2 text-body-sm">
                  <span className="font-medium">{result.transactions.length} รายการ · ใหม่ {ded.added.length} · ซ้ำ {ded.duplicates}</span>
                  <span className="text-ink-soft text-caption">หมวดจัดอัตโนมัติ แก้ได้</span>
                </div>
                {ded.overlaps.length > 0 && (
                  <div className="text-caption text-warning flex gap-1.5 items-start mb-2"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{ded.overlaps.join(' · ')}</span></div>
                )}
                <div className="max-h-64 overflow-y-auto rounded-xl border border-line divide-y divide-line/60">
                  {previewRaws.slice(0, 300).map((r, i) => (
                    <div key={i} className={`px-3 py-2 text-body-sm ${brokenAt.has(i) ? 'bg-warning/10' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-ink-soft w-12 shrink-0">{formatDate(r.date)}</span>
                      <span className="truncate flex-1" title={r.desc}>{r.merchant}</span>
                      <span className="max-w-36 min-w-0 shrink">
                        <CategorySelect value={r.category}
                          onChange={(v) => setCatOverrides((o) => ({ ...o, [i]: v }))} />
                      </span>
                      <span className={`tnum font-semibold w-16 text-right shrink-0 ${r.direction === 'in' ? 'text-success' : ''}`}>
                        {r.direction === 'in' ? '+' : ''}{formatTHB(r.amount)}
                      </span>
                    </div>
                    {fixedAt.has(i) && (
                      <div className="text-caption text-sky-600 dark:text-sky-400 pl-14">
                        แก้ยอดจากคอลัมน์คงเหลือ: {formatTHB(fixedAt.get(i)!.from)} → {formatTHB(fixedAt.get(i)!.to)}
                      </div>
                    )}
                    {brokenAt.has(i) && (
                      <div className="text-caption text-warning pl-14">
                        ยอดคงเหลือไม่ต่อเนื่องที่แถวนี้ — ตรวจตัวเลขก่อนเพิ่ม
                      </div>
                    )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {done && <div className="text-body-sm text-success flex items-center gap-1.5"><Check size={15} /> {done}</div>}

          <div className="flex gap-2">
            <button onClick={close} className="btn-ghost flex-1">ปิด</button>
            {result && result.transactions.length > 0 && <button onClick={commit} disabled={ded.added.length === 0} className="btn-primary flex-1"><Check size={16} /> เพิ่ม {ded.added.length} รายการ</button>}
          </div>
          {!cloud && <p className="text-caption text-ink-soft text-center">PDF/OCR อ่านในเครื่อง ไม่ส่งออก · Cloud AI ส่งรูปไป Claude API</p>}
        </div>
    </Modal>
  );
}
