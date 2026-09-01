'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Check, Camera, Loader2, Image as ImageIcon, AlertTriangle, ChevronDown } from 'lucide-react';
import { useData } from './DataProvider';
import { Modal } from './ui';
import { CATEGORIES, categoryGroup, categoryMeta } from '@/lib/categories';
import { makeId, ACCOUNTS, accountLabel } from '@/lib/data';
import { autoCategorize } from '@/lib/autocat';
import { parseReceiptText } from '@/lib/ocr/receipt';
import { ocrImage } from '@/lib/ocr/extract';
import { formatTHB, formatDate } from '@/lib/format';
import {
  frequentMerchants, searchMerchants, findPossibleDuplicate, amountSteps,
  quickDates, toISODate, toHHMM,
} from '@/lib/suggest';
import type { Transaction, Direction } from '@/lib/types';

const CAT_NAMES = CATEGORIES.map((c) => c.name);

/** Fired on window to open the QuickAdd sheet (e.g. from the desktop header). */
export const QUICKADD_EVENT = 'jafinance:quickadd';

export function QuickAdd() {
  const { txns, setImported, rules, hydrated } = useData();
  const [open, setOpen] = useState(false);

  // header button (desktop) opens the same sheet via a window event
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(QUICKADD_EVENT, on);
    return () => window.removeEventListener(QUICKADD_EVENT, on);
  }, []);

  const [date, setDate] = useState(() => toISODate(new Date()));
  const [time, setTime] = useState(() => toHHMM(new Date()));
  const [account, setAccount] = useState<string>(ACCOUNTS[0]);
  const [direction, setDirection] = useState<Direction>('out');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('ค่าใช้จ่ายอื่น');
  const [catTouched, setCatTouched] = useState(false);
  const [allCats, setAllCats] = useState(false);
  const [acOpen, setAcOpen] = useState(false);
  const [saved, setSaved] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<{ busy: boolean; pct: number; msg: string }>({ busy: false, pct: 0, msg: '' });
  const [scanText, setScanText] = useState('');

  // re-stamp "now" each time the sheet opens, not on every render
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setDate(toISODate(now));
    setTime(toHHMM(now));
  }, [open]);

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setScan({ busy: true, pct: 0, msg: 'กำลังอ่านรูป…' });
    setScanText('');
    try {
      const text = await ocrImage(file, (p) => setScan((s) => ({ ...s, pct: Math.round(p.progress * 100), msg: p.status || s.msg })));
      setScanText(text);
      const g = parseReceiptText(text);
      if (g.amount) setAmount(String(g.amount));
      if (g.merchant) setMerchant(g.merchant);
      if (g.date) setDate(g.date);
      if (g.category) { setCategory(g.category); setCatTouched(true); }
      setScan({ busy: false, pct: 100, msg: g.amount ? 'อ่านสำเร็จ — ตรวจสอบแล้วบันทึก' : 'อ่านไม่เจอยอด ลองตรวจข้อความ/กรอกเอง' });
    } catch {
      setScan({ busy: false, pct: 0, msg: 'อ่านรูปไม่สำเร็จ — ลองใหม่หรือกรอกเอง' });
    }
  };

  // auto-suggest category from merchant/desc/amount until the user picks one
  useEffect(() => {
    if (catTouched) return;
    setCategory(autoCategorize(merchant, desc, rules, Number(amount) || undefined));
  }, [merchant, desc, amount, rules, catTouched]);

  // ── suggestions from the user's own history ──────────────────────────────
  const tiles = useMemo(() => frequentMerchants(txns, 6), [txns]);
  const steps = useMemo(() => amountSteps(txns), [txns]);
  const dates = useMemo(() => quickDates(new Date()), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches = useMemo(
    () => (acOpen ? searchMerchants(txns, merchant, 4) : []),
    [txns, merchant, acOpen],
  );
  const dup = useMemo(
    () => findPossibleDuplicate(txns, { date, amount: Math.abs(Number(amount)) || 0, merchant, account }),
    [txns, date, amount, merchant, account],
  );

  // the 8 categories this user reaches for most, so the grid is theirs, not alphabetical
  const topCats = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of txns) if (t.direction === 'out') n.set(t.category, (n.get(t.category) ?? 0) + 1);
    const ranked = CAT_NAMES.filter((c) => n.has(c)).sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0));
    const seven = ranked.slice(0, 7);
    return seven.includes(category) ? seven : [...seven.slice(0, 6), category];
  }, [txns, category]);

  const shownCats = allCats ? CAT_NAMES : topCats;

  const existingIds = useMemo(() => new Set(txns.map((t) => t.id)), [txns]);
  // guards against id collisions when saving several rows before a re-render
  const sessionIds = useRef<Set<string>>(new Set());

  const applyMerchant = (m: { merchant: string; category: string; typical: number }) => {
    setMerchant(m.merchant);
    setCategory(m.category);
    setCatTouched(true);
    if (!Number(amount)) setAmount(String(m.typical));
    setAcOpen(false);
  };

  /** Clear what changes per receipt; keep date/account/direction for the next one. */
  const clearEntry = () => {
    setAmount(''); setMerchant(''); setDesc('');
    setCategory('ค่าใช้จ่ายอื่น'); setCatTouched(false); setAllCats(false); setAcOpen(false);
    setScan({ busy: false, pct: 0, msg: '' }); setScanText('');
  };

  const save = (again: boolean) => {
    const amt = Math.abs(Number(amount));
    if (!amt) return;
    const raw = {
      date, time, account, direction,
      amount: amt, category, group: categoryGroup(category),
      merchant: merchant.trim() || '—', desc: desc.trim(),
    };
    // unique id (keep genuine repeats); sessionIds closes the same-tick gap
    const base = makeId(raw);
    let id = base; let n = 1;
    while (existingIds.has(id) || sessionIds.current.has(id)) id = `${base}_${n++}`;
    sessionIds.current.add(id);
    setImported((p) => [...p, { ...raw, id } as Transaction]);

    setSaved(`บันทึก ${formatTHB(amt)} แล้ว`);
    setTimeout(() => setSaved(''), 1600);
    clearEntry();
    if (!again) setOpen(false);
  };

  if (!hydrated) return null;

  const catBtn = (c: string) => {
    const meta = categoryMeta(c);
    const Icon = meta.icon;
    const on = c === category;
    return (
      <button
        key={c}
        type="button"
        onClick={() => { setCategory(c); setCatTouched(true); }}
        aria-pressed={on}
        className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors ${
          on ? 'border-brand bg-brand/10' : 'border-line bg-surface hover:bg-surface-2'
        }`}
      >
        <Icon size={18} style={{ color: meta.color }} aria-hidden />
        <span className={`text-[10px] leading-tight ${on ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
          {c.replace('/เดลิเวอรี่/แท็กซี่', '').replace('มาร์เก็ต', '').replace(' (AUD)', '')}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="เพิ่มรายการ"
        className="lg:hidden fixed right-4 bottom-20 sm:bottom-6 z-40 h-14 w-14 rounded-2xl text-white shadow-lg grid place-items-center active:scale-95 transition-transform"
        style={{ backgroundImage: 'linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand-2)))' }}
      >
        <Plus size={26} />
      </button>

      {saved && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-28 sm:bottom-24 z-50 rounded-full bg-emerald-600 text-white text-sm px-4 py-2 shadow-lg flex items-center gap-1.5 animate-rise"
        >
          <Check size={15} /> {saved}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} labelledBy="quickadd-title">
        <div className="sticky top-0 z-10 bg-surface border-b border-line px-4 py-3 flex items-center justify-between">
          <h2 id="quickadd-title" className="font-semibold flex items-center gap-2"><Plus size={18} /> เพิ่มรายการ</h2>
          <button aria-label="ปิด" onClick={() => setOpen(false)} className="btn-ghost !px-2 !py-1.5"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3.5">
          <div className="inline-flex rounded-xl bg-surface-2 p-1 w-full">
            {(['out', 'in'] as Direction[]).map((d) => (
              <button key={d} onClick={() => setDirection(d)} className={`seg flex-1 ${direction === d ? 'seg-on' : 'seg-off'}`}>
                {d === 'out' ? 'จ่ายออก' : 'รับเข้า'}
              </button>
            ))}
          </div>

          {/* amount — the hero field */}
          <div>
            <label className="block">
              <span className="text-xs text-ink-soft">จำนวนเงิน (บาท)</span>
              <input
                autoFocus type="number" inputMode="decimal" step="0.01"
                className="input mt-1 text-2xl font-semibold tabular-nums text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {steps.map((s) => (
                <button
                  key={s} type="button"
                  onClick={() => setAmount(String(Math.round(((Number(amount) || 0) + s) * 100) / 100))}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium tabular-nums hover:bg-surface-2"
                >
                  +{s}
                </button>
              ))}
              <button
                type="button" onClick={() => setAmount('')} disabled={!amount}
                className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-ink-soft disabled:opacity-40 hover:bg-surface-2"
              >
                ล้าง
              </button>
            </div>
          </div>

          {/* one-tap frequent merchants */}
          {direction === 'out' && tiles.length > 0 && (
            <div>
              <span className="text-xs text-ink-soft">ร้านที่จ่ายบ่อย <span className="text-brand font-medium">· แตะครั้งเดียว</span></span>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {tiles.map((m) => {
                  const Icon = categoryMeta(m.category).icon;
                  return (
                    <button
                      key={m.merchant} type="button" onClick={() => applyMerchant(m)}
                      className="flex flex-col items-center gap-0.5 rounded-xl border border-line bg-surface px-1.5 py-2 hover:bg-surface-2"
                    >
                      <Icon size={18} style={{ color: categoryMeta(m.category).color }} aria-hidden />
                      <span className="text-[11px] font-semibold leading-tight text-center line-clamp-1 w-full">{m.merchant}</span>
                      <span className="text-[10px] text-ink-soft tabular-nums">฿{m.typical.toLocaleString('th-TH')}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* merchant + type-ahead over the user's own history */}
          <div>
            <label className="block">
              <span className="text-xs text-ink-soft">ร้าน / ผู้รับ</span>
              <input
                className="input mt-1" placeholder="เช่น Grab, 7-Eleven" value={merchant}
                onChange={(e) => { setMerchant(e.target.value); setAcOpen(true); }}
                onFocus={() => setAcOpen(true)}
                onBlur={() => setTimeout(() => setAcOpen(false), 120)}
                autoComplete="off"
              />
            </label>
            {matches.length > 0 && (
              <ul className="mt-1 overflow-hidden rounded-xl border border-line bg-surface">
                {matches.map((m) => (
                  <li key={m.merchant} className="border-t border-line first:border-t-0">
                    <button
                      type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMerchant(m)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-2"
                    >
                      <span className="text-sm font-medium truncate">{m.merchant}</span>
                      <span className="text-[11px] text-ink-soft shrink-0">{m.count} ครั้ง · {m.category}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* category as an icon grid */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-soft">หมวด</span>
              {!catTouched && (merchant || amount) && (
                <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand">แนะนำอัตโนมัติ</span>
              )}
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {shownCats.map(catBtn)}
              {!allCats && (
                <button
                  type="button" onClick={() => setAllCats(true)}
                  className="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface px-1 py-2 hover:bg-surface-2"
                >
                  <ChevronDown size={18} className="text-ink-soft" aria-hidden />
                  <span className="text-[10px] leading-tight text-ink-soft">ทั้งหมด {CAT_NAMES.length}</span>
                </button>
              )}
            </div>
          </div>

          {/* account — includes เงินสด for money that never appears on a statement */}
          <div>
            <span className="text-xs text-ink-soft">บัญชี</span>
            <div className="mt-1 inline-flex w-full rounded-xl bg-surface-2 p-1">
              {ACCOUNTS.map((a) => (
                <button key={a} onClick={() => setAccount(a)} className={`seg flex-1 ${account === a ? 'seg-on' : 'seg-off'}`}>
                  {accountLabel(a)}
                </button>
              ))}
            </div>
          </div>

          {/* date + time */}
          <div>
            <span className="text-xs text-ink-soft">วัน-เวลา</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {dates.map((d) => (
                <button
                  key={d.label} type="button" onClick={() => setDate(d.date)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    date === d.date ? 'border-brand bg-brand/10 font-semibold text-brand' : 'border-line bg-surface hover:bg-surface-2'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <input type="date" aria-label="วันที่" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              <input type="time" aria-label="เวลา" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* warn, never block: a second ฿69 run on the same day is ordinary */}
          {dup && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-300">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                มีรายการ {dup.merchant} {formatTHB(dup.amount)} วันที่ {formatDate(dup.date)}
                {dup.time ? ` เวลา ${dup.time}` : ''} อยู่แล้ว — กดบันทึกได้ถ้าเป็นคนละครั้งจริง
              </span>
            </div>
          )}

          <label className="block">
            <span className="text-xs text-ink-soft">หมายเหตุ (ไม่บังคับ)</span>
            <input className="input mt-1" placeholder="เช่น ซื้อให้ที่บ้าน" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>

          {/* receipt scan — a shortcut, not the main path */}
          <div>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={galleryRef} type="file" accept="image/*" hidden
              onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            {scan.busy ? (
              <button disabled className="w-full btn-ghost !py-2 border border-dashed border-line text-xs">
                <Loader2 size={15} className="animate-spin" /> {scan.msg} {scan.pct ? `${scan.pct}%` : ''}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => photoRef.current?.click()} className="btn-ghost !py-2 !text-xs border border-dashed border-line">
                  <Camera size={15} /> ถ่ายใบเสร็จ
                </button>
                <button onClick={() => galleryRef.current?.click()} className="btn-ghost !py-2 !text-xs border border-dashed border-line">
                  <ImageIcon size={15} /> เลือกรูป
                </button>
              </div>
            )}
            {!scan.busy && scan.msg && <p className="mt-1 text-xs text-ink-soft">{scan.msg}</p>}
            {!scan.busy && scanText && (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-ink-soft">ดูข้อความที่อ่านได้</summary>
                <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-surface-2 p-2 whitespace-pre-wrap break-words">{scanText}</pre>
              </details>
            )}
          </div>
        </div>

        {/* action bar pinned to the bottom of the sheet */}
        <div className="sticky bottom-0 z-10 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => save(true)} disabled={!Number(amount)} className="btn-ghost border border-line disabled:opacity-40">
              บันทึก + เพิ่มอีก
            </button>
            <button onClick={() => save(false)} disabled={!Number(amount)} className="btn-primary">
              <Check size={16} /> บันทึก
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-soft">บันทึกในเครื่อง · สแกนรูปอ่านในเครื่อง ไม่อัปโหลดรูปออกไป</p>
        </div>
      </Modal>
    </>
  );
}
