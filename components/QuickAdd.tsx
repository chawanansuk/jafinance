'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Check, Camera, Loader2, Image as ImageIcon } from 'lucide-react';
import { useData } from './DataProvider';
import { CATEGORIES, categoryGroup } from '@/lib/categories';
import { makeId } from '@/lib/data';
import { autoCategorize } from '@/lib/autocat';
import { parseReceiptText } from '@/lib/ocr/receipt';
import { ocrImage } from '@/lib/ocr/extract';
import { formatTHB } from '@/lib/format';
import type { Transaction, Direction } from '@/lib/types';

const CAT_NAMES = CATEGORIES.map((c) => c.name);
const ACCOUNTS = ['KBank ออมทรัพย์', 'UOB บัตรเครดิต'];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function QuickAdd() {
  const { txns, setImported, rules, hydrated } = useData();
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState(todayISO());
  const [account, setAccount] = useState(ACCOUNTS[0]);
  const [direction, setDirection] = useState<Direction>('out');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('ค่าใช้จ่ายอื่น');
  const [catTouched, setCatTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<{ busy: boolean; pct: number; msg: string }>({ busy: false, pct: 0, msg: '' });

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setScan({ busy: true, pct: 0, msg: 'กำลังอ่านรูป…' });
    try {
      const text = await ocrImage(file, (p) => setScan((s) => ({ ...s, pct: Math.round(p.progress * 100), msg: p.status || s.msg })));
      const g = parseReceiptText(text);
      if (g.amount) setAmount(String(g.amount));
      if (g.merchant) setMerchant(g.merchant);
      if (g.date) setDate(g.date);
      if (g.category) { setCategory(g.category); setCatTouched(true); }
      setScan({ busy: false, pct: 100, msg: g.amount ? 'อ่านสำเร็จ — ตรวจสอบแล้วบันทึก' : 'อ่านไม่เจอยอด ลองกรอกเอง' });
    } catch (e) {
      setScan({ busy: false, pct: 0, msg: 'อ่านรูปไม่สำเร็จ — ลองใหม่หรือกรอกเอง' });
    }
  };

  // auto-suggest category from merchant/desc/amount until the user picks one
  useEffect(() => {
    if (catTouched) return;
    setCategory(autoCategorize(merchant, desc, rules, Number(amount) || undefined));
  }, [merchant, desc, amount, rules, catTouched]);

  const existingIds = useMemo(() => new Set(txns.map((t) => t.id)), [txns]);
  // guards against id collisions when saving several rows before a re-render
  const sessionIds = useRef<Set<string>>(new Set());

  const reset = () => {
    setScan({ busy: false, pct: 0, msg: '' });
    setDate(todayISO()); setAccount(ACCOUNTS[0]); setDirection('out');
    setAmount(''); setMerchant(''); setDesc(''); setCategory('ค่าใช้จ่ายอื่น'); setCatTouched(false);
  };

  const save = () => {
    const amt = Math.abs(Number(amount));
    if (!amt) return;
    const raw = {
      date, time: '', account, direction,
      amount: amt, category, group: categoryGroup(category), merchant: merchant.trim() || '—', desc: desc.trim(),
    };
    // unique id (keep genuine repeats); sessionIds closes the same-tick gap
    const base = makeId(raw);
    let id = base; let n = 1;
    while (existingIds.has(id) || sessionIds.current.has(id)) id = `${base}_${n++}`;
    sessionIds.current.add(id);
    const tx = { ...raw, id } as Transaction;
    setImported((p) => [...p, tx]);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
    reset();
  };

  if (!hydrated) return null;

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="เพิ่มรายการ"
        className="fixed right-4 bottom-20 sm:bottom-6 z-40 h-14 w-14 rounded-2xl text-white shadow-lg grid place-items-center active:scale-95 transition-transform"
        style={{ backgroundImage: 'linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand-2)))' }}
      >
        <Plus size={26} />
      </button>

      {saved && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 sm:bottom-24 z-50 rounded-full bg-emerald-600 text-white text-sm px-4 py-2 shadow-lg flex items-center gap-1.5 animate-rise">
          <Check size={15} /> เพิ่มรายการแล้ว
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md rounded-b-none sm:rounded-2xl max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-surface border-b border-line px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2"><Plus size={18} /> เพิ่มรายการ</h2>
              <button aria-label="ปิด" onClick={() => setOpen(false)} className="btn-ghost !px-2 !py-1.5"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              {/* scan a receipt / slip — from camera or an existing photo file */}
              <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              <input ref={galleryRef} type="file" accept="image/*" hidden
                onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              {scan.busy ? (
                <button disabled className="w-full btn-ghost !py-2.5 border border-dashed border-line">
                  <Loader2 size={16} className="animate-spin" /> {scan.msg} {scan.pct ? `${scan.pct}%` : ''}
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => photoRef.current?.click()}
                    className="btn-ghost !py-2.5 border border-dashed border-line">
                    <Camera size={16} /> ถ่ายรูป
                  </button>
                  <button onClick={() => galleryRef.current?.click()}
                    className="btn-ghost !py-2.5 border border-dashed border-line">
                    <ImageIcon size={16} /> เลือกรูป
                  </button>
                </div>
              )}
              {!scan.busy && scan.msg && <p className="text-xs text-ink-soft -mt-1">{scan.msg}</p>}

              <div className="inline-flex rounded-xl bg-surface-2 p-1 w-full">
                {(['out', 'in'] as Direction[]).map((d) => (
                  <button key={d} onClick={() => setDirection(d)}
                    className={`seg flex-1 ${direction === d ? 'seg-on' : 'seg-off'}`}>
                    {d === 'out' ? 'จ่ายออก' : 'รับเข้า'}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="text-xs text-ink-soft">จำนวนเงิน (บาท)</span>
                <input autoFocus type="number" inputMode="decimal" className="input mt-1 text-lg font-semibold"
                  placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                {amount && <span className="text-xs text-ink-soft">= {formatTHB(Math.abs(Number(amount)))}</span>}
              </label>

              <label className="block">
                <span className="text-xs text-ink-soft">ร้าน / ผู้รับ</span>
                <input className="input mt-1" placeholder="เช่น Grab, 7-Eleven" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
              </label>

              <label className="block">
                <span className="text-xs text-ink-soft">หมวด {!catTouched && merchant && <span className="text-brand">(แนะนำอัตโนมัติ)</span>}</span>
                <select className="input mt-1" value={category} onChange={(e) => { setCategory(e.target.value); setCatTouched(true); }}>
                  {!CAT_NAMES.includes(category) && <option value={category}>{category}</option>}
                  {CAT_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-ink-soft">วันที่</span>
                  <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-xs text-ink-soft">บัญชี</span>
                  <select className="input mt-1" value={account} onChange={(e) => setAccount(e.target.value)}>
                    {ACCOUNTS.map((a) => <option key={a} value={a}>{a.startsWith('KBank') ? 'KBank' : 'UOB'}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs text-ink-soft">รายละเอียด (ไม่บังคับ)</span>
                <input className="input mt-1" placeholder="โน้ตเพิ่มเติม" value={desc} onChange={(e) => setDesc(e.target.value)} />
              </label>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setOpen(false)} className="btn-ghost flex-1">ปิด</button>
                <button onClick={save} disabled={!Number(amount)} className="btn-primary flex-1"><Check size={16} /> บันทึก</button>
              </div>
              <p className="text-[11px] text-ink-soft text-center">บันทึกในเครื่อง · สแกนรูปอ่านในเครื่อง ไม่อัปโหลดรูปออกไป</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
