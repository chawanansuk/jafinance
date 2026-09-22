'use client';

import { useMemo, useRef, useState } from 'react';
import { Search, Upload, Download, ArrowUpDown, Wand2, Check, ClipboardPaste, FileText, ChevronDown } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { SectionTitle, Money, Skeleton, Notice } from '@/components/ui';
import { AccountToggle, Segmented, type AccountFilter } from '@/components/Controls';
import { SmartImport } from '@/components/SmartImport';
import { PdfImport } from '@/components/PdfImport';
import { BillsPanel } from '@/components/BillsPanel';
import { categoryMeta, CATEGORIES } from '@/lib/categories';
import { formatDate } from '@/lib/format';
import { parseImport, toCSV, downloadFile } from '@/lib/io';

type SortKey = 'date' | 'amount';
type Dir = 'in' | 'out' | 'all';

const CAT_NAMES = CATEGORIES.map((c) => c.name);

/** V2: still a native <select> — same keyboard, same screen-reader behaviour —
 *  but painted as a category chip so a 120-row table stops reading as 120 form
 *  controls. The dot carries the category colour used everywhere else. */
function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const color = categoryMeta(value).color;
  return (
    <span className="relative inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 max-w-full"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      <span aria-hidden className="h-[7px] w-[7px] rounded-full shrink-0" style={{ background: color }} />
      <span className="text-caption truncate">{value}</span>
      <ChevronDown size={12} className="text-ink-soft shrink-0" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="เปลี่ยนหมวด"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {!CAT_NAMES.includes(value) && <option value={value}>{value}</option>}
        {CAT_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </span>
  );
}

export default function TransactionsPage() {
  const { txns, setCategory, bulkSetCategory, toggleRealIncome, setImported, hydrated } = useData();
  const fileRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState('');
  const [account, setAccount] = useState<AccountFilter>('all');
  const [cat, setCat] = useState('all');
  const [dir, setDir] = useState<Dir>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [limit, setLimit] = useState(120);
  const [bulkQ, setBulkQ] = useState('');
  const [bulkCat, setBulkCat] = useState(CAT_NAMES[0]);
  const [bulkMsg, setBulkMsg] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [smartOpen, setSmartOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = txns.filter((t) => {
      if (account !== 'all' && t.account !== account) return false;
      if (cat !== 'all' && t.category !== cat) return false;
      if (dir !== 'all' && t.direction !== dir) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (query && !t.desc.toLowerCase().includes(query) && !t.merchant.toLowerCase().includes(query)) return false;
      return true;
    });
    list = list.sort((a, b) => {
      const v = sortKey === 'date' ? a.date.localeCompare(b.date) : a.amount - b.amount;
      return sortAsc ? v : -v;
    });
    return list;
  }, [txns, q, account, cat, dir, from, to, sortKey, sortAsc]);

  const totalShown = filtered.reduce((s, t) => s + (t.direction === 'out' ? t.amount : 0), 0);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((s) => !s);
    else { setSortKey(k); setSortAsc(false); }
  };

  const runBulk = () => {
    const n = bulkSetCategory(bulkQ, bulkCat);
    setBulkMsg(n > 0 ? `อัปเดต ${n} รายการเป็น “${bulkCat}”` : 'ไม่พบรายการที่ตรงคำค้น');
  };

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      const res = parseImport(text, txns);
      if (res.added.length) setImported((p) => [...p, ...res.added]);
      const overlap = res.overlaps.length ? ` ⚠️ ${res.overlaps.join(' · ')}` : '';
      setImportMsg(`นำเข้า ${res.added.length} รายการใหม่ · ข้ามซ้ำ ${res.duplicates} · อ่านได้ ${res.parsed}${overlap}`);
    } catch (e) {
      setImportMsg('นำเข้าไม่สำเร็จ: ไฟล์ต้องเป็น CSV/JSON ตาม schema');
    }
  };

  if (!hydrated) return <div className="space-y-3">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">รายการธุรกรรม</h1>
        {/* V2: import and export were five identical ghost buttons in one
            unwrapped row — it overflowed 390px and gave no hierarchy. Now they
            wrap, and the two jobs are visually separated. */}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.json,application/json,text/csv" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ''; // allow re-picking the same file
              if (f) onFile(f);
            }} />
          <button onClick={() => setPdfOpen(true)} className="btn-secondary !py-2 !px-3"><FileText size={15} aria-hidden /> สเตทเมนต์</button>
          <button onClick={() => setSmartOpen(true)} className="btn-secondary !py-2 !px-3"><ClipboardPaste size={15} aria-hidden /> วางข้อความ</button>
          <button onClick={() => fileRef.current?.click()} className="btn-secondary !py-2 !px-3"><Upload size={15} aria-hidden /> ไฟล์</button>
          <span aria-hidden className="hidden sm:block h-5 w-px bg-line" />
          <button onClick={() => downloadFile('transactions.csv', toCSV(filtered), 'text/csv')} className="btn-ghost !py-2 !px-3"><Download size={15} aria-hidden /> CSV</button>
          <button onClick={() => downloadFile('jafinance-transactions.json', JSON.stringify(txns, null, 2), 'application/json')} className="btn-ghost !py-2 !px-3"><Download size={15} aria-hidden /> JSON</button>
        </div>
      </div>

      {importMsg && <Notice>{importMsg}</Notice>}

      <BillsPanel />

      {/* filters */}
      <div className="card card-pad space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input className="input !pl-9" placeholder="ค้นหาในรายละเอียด/ร้าน…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <AccountToggle value={account} onChange={setAccount} />
          <Segmented<Dir> value={dir} onChange={setDir}
            options={[{ v: 'all', label: 'ทั้งหมด' }, { v: 'out', label: 'จ่าย' }, { v: 'in', label: 'รับ' }]} />
          <select className="input !w-auto !py-1.5 text-sm" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">ทุกหมวด</option>
            {CAT_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="date" className="input !w-auto !py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-ink-soft text-sm">–</span>
          <input type="date" className="input !w-auto !py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {/* bulk recategorize */}
      <details className="card card-pad">
        <summary className="cursor-pointer text-sm font-medium flex items-center gap-2"><Wand2 size={15} /> แก้หมวดแบบกลุ่ม (bulk)</summary>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-ink-soft">ทุกรายการที่มีคำว่า</span>
          <input className="input !w-40 !py-1.5 text-sm" placeholder="เช่น GRAB" value={bulkQ} onChange={(e) => setBulkQ(e.target.value)} />
          <span className="text-sm text-ink-soft">→</span>
          <select className="input !w-auto !py-1.5 text-sm" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
            {CAT_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={runBulk} className="btn-primary !py-1.5 !px-3 text-sm"><Check size={14} /> ใช้</button>
          {bulkMsg && <span className="text-xs text-ink-soft">{bulkMsg}</span>}
        </div>
      </details>

      {/* V2: on mobile these three fought for one line and the sort buttons broke
          across two. Sort gets its own row; the count and total share the next. */}
      <div className="space-y-2 px-1">
        <div className="sm:hidden inline-flex rounded-md bg-surface-2 p-1">
          <button onClick={() => toggleSort('date')} className={`seg ${sortKey === 'date' ? 'seg-on' : 'seg-off'}`}>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">วันที่ <ArrowUpDown size={12} aria-hidden /></span>
          </button>
          <button onClick={() => toggleSort('amount')} className={`seg ${sortKey === 'amount' ? 'seg-on' : 'seg-off'}`}>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">จำนวน <ArrowUpDown size={12} aria-hidden /></span>
          </button>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-body-sm text-ink-soft">
          <span className="shrink-0">{filtered.length.toLocaleString('th-TH')} รายการ</span>
          <span className="text-right">รวมรายจ่าย <b className="tnum text-ink text-h3"><Money value={totalShown} /></b></span>
        </div>
      </div>

      {/* mobile: 2-line cards (the table squeezes unreadably at 390px) */}
      <ul className="sm:hidden card divide-y divide-line/60">
        {filtered.slice(0, limit).map((t) => {
          const meta = categoryMeta(t.category);
          const MetaIcon = meta.icon;
          return (
            <li key={t.id} className="px-3.5 py-3">
              <div className="flex items-start gap-3">
                <span className="grid place-items-center h-9 w-9 rounded-xl shrink-0 mt-0.5"
                  style={{ background: meta.color + '1f', color: meta.color }}>
                  <MetaIcon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium truncate">{t.merchant || '—'}</span>
                    <span className={`ml-auto shrink-0 font-semibold tnum ${t.direction === 'in' ? 'text-emerald-500' : ''}`}>
                      {t.direction === 'in' ? '+' : ''}<Money value={t.amount} />
                    </span>
                  </div>
                  {t.desc && t.desc !== t.merchant && (
                    <div className="text-xs text-ink-soft truncate">{t.desc}</div>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-xs text-ink-soft whitespace-nowrap truncate">
                      {formatDate(t.date)}{t.time ? ` ${t.time}` : ''} · {t.account.startsWith('KBank') ? 'KBank' : 'UOB'}
                    </span>
                    <span className="ml-auto min-w-0 shrink"><CategorySelect value={t.category} onChange={(v) => setCategory(t.id, v)} /></span>
                  </div>
                  {t.direction === 'in' && t.group !== 'refund' && (
                    <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer">
                      <input type="checkbox" checked={!!t.isRealIncome} onChange={() => toggleRealIncome(t.id)} />
                      เป็นรายได้จริง
                    </label>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="px-4 py-10 text-center text-sm text-ink-soft">ไม่พบรายการที่ตรงเงื่อนไข</li>}
      </ul>

      {/* desktop table — V2: the header sticks, rows are one line tall, and the
          group badge is gone (it only restated the category beside it) */}
      {/* no overflow-hidden here: it would make the card a scroll container and
          silently kill the sticky header. Corners are rounded on the cells. */}
      <div className="hidden sm:block card">
        <table className="w-full border-separate border-spacing-0">
          <thead className="sticky top-15 z-10 [&_th]:bg-surface-2 [&_th:first-child]:rounded-tl-lg [&_th:last-child]:rounded-tr-lg">
            <tr className="text-ink-soft [&_th]:border-b [&_th]:border-line">
              <th scope="col" className="text-left px-4 py-3 cursor-pointer w-[112px]" onClick={() => toggleSort('date')}>
                <span className="inline-flex items-center gap-1 text-label">วันที่ <ArrowUpDown size={12} aria-hidden /></span>
              </th>
              <th scope="col" className="text-left px-4 py-3 text-label">ร้าน / รายละเอียด</th>
              <th scope="col" className="text-left px-4 py-3 text-label w-[220px]">หมวด</th>
              <th scope="col" className="text-right px-4 py-3 cursor-pointer w-[130px]" onClick={() => toggleSort('amount')}>
                <span className="inline-flex items-center gap-1 text-label">จำนวน <ArrowUpDown size={12} aria-hidden /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((t) => (
              <tr key={t.id} className="[&_td]:border-b [&_td]:border-line hover:[&_td]:bg-surface-2/60">
                <td className="px-4 py-2.5 whitespace-nowrap align-middle">
                  <div className="text-body-sm">{formatDate(t.date)}</div>
                  <div className="text-caption text-ink-soft">{t.time || (t.account.startsWith('KBank') ? 'KBank' : 'UOB')}</div>
                </td>
                <td className="px-4 py-2.5 align-middle max-w-0">
                  <div className="truncate text-body">{t.merchant || '—'}</div>
                  {t.desc && t.desc !== t.merchant && (
                    <div className="text-caption text-ink-soft truncate">{t.desc}</div>
                  )}
                  {t.direction === 'in' && t.group !== 'refund' && (
                    <label className="mt-1 inline-flex items-center gap-1.5 text-caption text-ink-soft cursor-pointer">
                      <input type="checkbox" checked={!!t.isRealIncome} onChange={() => toggleRealIncome(t.id)} />
                      เป็นรายได้จริง
                    </label>
                  )}
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <CategorySelect value={t.category} onChange={(v) => setCategory(t.id, v)} />
                </td>
                <td className="px-4 py-2.5 text-right align-middle whitespace-nowrap text-h3 font-semibold tnum">
                  <span className={t.direction === 'in' ? 'text-success' : ''}>
                    {t.direction === 'in' ? '+' : ''}<Money value={t.amount} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="px-4 py-12 text-center text-body-sm text-ink-soft">ไม่พบรายการที่ตรงเงื่อนไข</div>}
        {/* V2: how many of how many, where you can actually see it */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-line bg-surface-2 px-4 py-3">
            <span className="text-body-sm text-ink-soft">
              แสดง {Math.min(limit, filtered.length).toLocaleString('th-TH')} จาก {filtered.length.toLocaleString('th-TH')} รายการ
            </span>
            {filtered.length > limit && (
              <button onClick={() => setLimit((l) => l + 200)} className="btn-secondary !py-2 !px-3">
                โหลดเพิ่ม 200 รายการ
              </button>
            )}
          </div>
        )}
      </div>
      {filtered.length > limit && (
        <button onClick={() => setLimit((l) => l + 200)} className="sm:hidden btn-secondary w-full">
          โหลดเพิ่ม ({(filtered.length - limit).toLocaleString('th-TH')} รายการ)
        </button>
      )}

      <SmartImport open={smartOpen} onClose={() => setSmartOpen(false)} />
      <PdfImport open={pdfOpen} onClose={() => setPdfOpen(false)} />
    </div>
  );
}
