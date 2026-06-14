'use client';

import { useMemo, useRef, useState } from 'react';
import { Search, Upload, Download, ArrowUpDown, Wand2, Check, ClipboardPaste, FileText } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { SectionTitle, Money, Skeleton, Notice, GroupBadge } from '@/components/ui';
import { AccountToggle, Segmented, type AccountFilter } from '@/components/Controls';
import { SmartImport } from '@/components/SmartImport';
import { PdfImport } from '@/components/PdfImport';
import { BillsPanel } from '@/components/BillsPanel';
import { CATEGORIES } from '@/lib/categories';
import { formatDate } from '@/lib/format';
import { parseImport, toCSV, downloadFile } from '@/lib/io';

type SortKey = 'date' | 'amount';
type Dir = 'in' | 'out' | 'all';

const CAT_NAMES = CATEGORIES.map((c) => c.name);

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="input !py-1 !px-2 text-xs !w-auto max-w-[150px]">
      {!CAT_NAMES.includes(value) && <option value={value}>{value}</option>}
      {CAT_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
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
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,.json,application/json,text/csv" hidden
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button onClick={() => setPdfOpen(true)} className="btn-ghost !py-1.5 !px-3 text-xs"><FileText size={14} /> PDF บิล</button>
          <button onClick={() => setSmartOpen(true)} className="btn-ghost !py-1.5 !px-3 text-xs"><ClipboardPaste size={14} /> วางข้อความ</button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost !py-1.5 !px-3 text-xs"><Upload size={14} /> ไฟล์</button>
          <button onClick={() => downloadFile('transactions.csv', toCSV(filtered), 'text/csv')} className="btn-ghost !py-1.5 !px-3 text-xs"><Download size={14} /> CSV</button>
          <button onClick={() => downloadFile('jafinance-backup.json', JSON.stringify(txns, null, 2), 'application/json')} className="btn-ghost !py-1.5 !px-3 text-xs"><Download size={14} /> JSON</button>
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

      <div className="flex items-center justify-between text-sm text-ink-soft px-1">
        <span>{filtered.length} รายการ</span>
        <span>รวมรายจ่าย <b className="tnum text-ink"><Money value={totalShown} /></b></span>
      </div>

      {/* table */}
      <div className="card overflow-x-auto no-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-soft border-b border-line">
              <th className="text-left font-medium px-3 py-2.5 cursor-pointer" onClick={() => toggleSort('date')}>
                <span className="inline-flex items-center gap-1">วันที่ <ArrowUpDown size={12} /></span>
              </th>
              <th className="text-left font-medium px-3 py-2.5">ร้าน / รายละเอียด</th>
              <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">หมวด</th>
              <th className="text-right font-medium px-3 py-2.5 cursor-pointer" onClick={() => toggleSort('amount')}>
                <span className="inline-flex items-center gap-1">จำนวน <ArrowUpDown size={12} /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((t) => (
              <tr key={t.id} className="border-b border-line/50 last:border-0 hover:bg-surface-2/60">
                <td className="px-3 py-2.5 whitespace-nowrap align-top">
                  <div>{formatDate(t.date)}</div>
                  <div className="text-xs text-ink-soft">{t.time || (t.account.startsWith('KBank') ? 'KBank' : 'UOB')}</div>
                </td>
                <td className="px-3 py-2.5 align-top max-w-[200px]">
                  <div className="truncate font-medium">{t.merchant || '—'}</div>
                  <div className="text-xs text-ink-soft truncate">{t.desc}</div>
                  <div className="sm:hidden mt-1"><CategorySelect value={t.category} onChange={(v) => setCategory(t.id, v)} /></div>
                  {t.direction === 'in' && t.group !== 'refund' && (
                    <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer">
                      <input type="checkbox" checked={!!t.isRealIncome} onChange={() => toggleRealIncome(t.id)} />
                      เป็นรายได้จริง
                    </label>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top hidden sm:table-cell">
                  <CategorySelect value={t.category} onChange={(v) => setCategory(t.id, v)} />
                  <div className="mt-1"><GroupBadge group={t.group} /></div>
                </td>
                <td className="px-3 py-2.5 text-right align-top whitespace-nowrap font-semibold tnum">
                  <span className={t.direction === 'in' ? 'text-emerald-500' : ''}>
                    {t.direction === 'in' ? '+' : ''}<Money value={t.amount} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="px-4 py-10 text-center text-sm text-ink-soft">ไม่พบรายการที่ตรงเงื่อนไข</div>}
      </div>
      {filtered.length > limit && (
        <button onClick={() => setLimit((l) => l + 200)} className="btn-ghost w-full">โหลดเพิ่ม ({filtered.length - limit} รายการ)</button>
      )}

      <SmartImport open={smartOpen} onClose={() => setSmartOpen(false)} />
      <PdfImport open={pdfOpen} onClose={() => setPdfOpen(false)} />
    </div>
  );
}
