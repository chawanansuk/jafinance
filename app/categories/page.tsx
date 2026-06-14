'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { SectionTitle, CategoryChip, Money, Skeleton } from '@/components/ui';
import { MonthSelect, AccountToggle, Segmented, type AccountFilter } from '@/components/Controls';
import { TrendLineChart } from '@/components/charts';
import {
  aggregateByCategory, toSpendingEvents, categoryMonthlyTrend,
} from '@/lib/analytics';
import { formatMonth, formatDate } from '@/lib/format';
import { categoryColor } from '@/lib/categories';

type Scope = 'month' | 'all';

export default function CategoriesPage() {
  const { txns, months, defaultMonth, hydrated } = useData();
  const [scope, setScope] = useState<Scope>('month');
  const [account, setAccount] = useState<AccountFilter>('all');
  const [month, setMonth] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const selected = month || defaultMonth || months[months.length - 1] || '';

  const events = useMemo(() => {
    const all = toSpendingEvents(txns, { account });
    return scope === 'month' ? all.filter((e) => e.month === selected) : all;
  }, [txns, account, scope, selected]);

  const rows = useMemo(() => aggregateByCategory(events).filter((c) => c.count > 0), [events]);

  const detailTrend = useMemo(
    () => (open ? categoryMonthlyTrend(txns, open) : []),
    [open, txns],
  );

  // merchants within the open category
  const catMerchants = useMemo(() => {
    if (!open) return [];
    const map = new Map<string, { total: number; count: number }>();
    for (const t of txns) {
      if (t.direction !== 'out' || t.category !== open) continue;
      if (account !== 'all' && t.account !== account) continue;
      const m = map.get(t.merchant) ?? { total: 0, count: 0 };
      m.total += t.amount; m.count += 1; map.set(t.merchant, m);
    }
    return [...map.entries()].map(([merchant, v]) => ({ merchant, ...v }))
      .sort((a, b) => b.total - a.total).slice(0, 8);
  }, [open, txns, account]);

  const catTxns = useMemo(() => {
    if (!open) return [];
    return txns
      .filter((t) => t.category === open && (scope === 'all' || t.date.slice(0, 7) === selected))
      .filter((t) => account === 'all' || t.account === account)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);
  }, [open, txns, scope, selected, account]);

  if (!hydrated) return <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">หมวดหมู่</h1>
        <div className="flex items-center gap-2">
          <Segmented<Scope> value={scope} onChange={setScope}
            options={[{ v: 'month', label: 'รายเดือน' }, { v: 'all', label: 'ทั้งหมด' }]} />
          {scope === 'month' && <MonthSelect months={months} value={selected} onChange={setMonth} />}
        </div>
      </div>
      <AccountToggle value={account} onChange={setAccount} />

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(4,auto)] gap-x-4 px-4 py-2.5 text-xs text-ink-soft border-b border-line">
          <span>หมวด</span>
          <span className="hidden sm:block text-right">จำนวน</span>
          <span className="hidden sm:block text-right">เฉลี่ย</span>
          <span className="hidden sm:block text-right">%</span>
          <span className="text-right">ยอดรวม</span>
        </div>
        {rows.length === 0 && <div className="px-4 py-10 text-center text-sm text-ink-soft">ไม่มีข้อมูล</div>}
        {rows.map((c) => (
          <button
            key={c.category}
            onClick={() => setOpen(c.category)}
            style={{ backgroundImage: `linear-gradient(to right, ${categoryColor(c.category)}1f ${Math.max(2, Math.round(c.share * 100))}%, transparent ${Math.max(2, Math.round(c.share * 100))}%)` }}
            className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_repeat(4,auto)] gap-x-4 items-center px-4 py-3 border-b border-line/60 last:border-0 hover:brightness-[0.98] dark:hover:brightness-110 text-left transition"
          >
            <span className="min-w-0 flex items-center gap-2">
              <CategoryChip name={c.category} />
            </span>
            <span className="hidden sm:block text-right text-sm text-ink-soft tnum">{c.count}</span>
            <span className="hidden sm:block text-right text-sm text-ink-soft tnum"><Money value={c.avg} /></span>
            <span className="hidden sm:block text-right text-sm text-ink-soft tnum">{Math.round(c.share * 100)}%</span>
            <span className="text-right font-semibold tnum flex items-center justify-end gap-1">
              <Money value={c.total} /><ChevronRight size={15} className="text-ink-soft" />
            </span>
          </button>
        ))}
      </div>

      {/* drill-down drawer */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => setOpen(null)}>
          <div className="card w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-b-none sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-surface border-b border-line px-4 py-3 flex items-center justify-between">
              <CategoryChip name={open} size={18} />
              <button aria-label="ปิด" onClick={() => setOpen(null)} className="btn-ghost !px-2 !py-1.5"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-5">
              <div>
                <SectionTitle>แนวโน้มรายเดือน</SectionTitle>
                <TrendLineChart data={detailTrend} />
              </div>
              {catMerchants.length > 0 && (
                <div>
                  <SectionTitle>ร้านที่จ่ายบ่อย</SectionTitle>
                  <ul className="space-y-2">
                    {catMerchants.map((m) => (
                      <li key={m.merchant} className="flex items-center justify-between text-sm">
                        <span className="truncate">{m.merchant}</span>
                        <span className="text-ink-soft tnum ml-3 shrink-0">{m.count}× · <Money value={m.total} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <SectionTitle>รายการล่าสุด {scope === 'month' ? `(${formatMonth(selected)})` : ''}</SectionTitle>
                <ul className="divide-y divide-line/60">
                  {catTxns.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-2 text-sm gap-3">
                      <div className="min-w-0">
                        <div className="truncate">{t.merchant}</div>
                        <div className="text-xs text-ink-soft truncate">{formatDate(t.date, true)} · {t.account.startsWith('KBank') ? 'KBank' : 'UOB'}</div>
                      </div>
                      <span className="font-semibold tnum shrink-0">{t.direction === 'in' ? '+' : ''}<Money value={t.amount} /></span>
                    </li>
                  ))}
                  {catTxns.length === 0 && <li className="py-6 text-center text-ink-soft text-sm">ไม่มีรายการ</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
