'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Receipt, CalendarDays, Tags, TrendingUp, TrendingDown, ImageDown } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { StatCard, SectionTitle, IncompleteBadge, Notice, Money, CountUp, CategoryChip, Skeleton } from '@/components/ui';
import { MonthSelect, AccountToggle, Segmented, type AccountFilter } from '@/components/Controls';
import { MonthlyBarChart, CategoryDonut, GroupSplitBar } from '@/components/charts';
import { Sparkline } from '@/components/Sparkline';
import {
  aggregateByMonth, aggregateByCategory, toSpendingEvents,
} from '@/lib/analytics';
import { formatMonth, formatTHB } from '@/lib/format';
import { categoryColor } from '@/lib/categories';
import { downloadMonthSummaryImage } from '@/lib/share';

type RangeMode = 'month' | '3m' | 'custom';
type CatView = 'rank' | 'donut';

function prevMonthOf(months: string[], m: string): string | null {
  const i = months.indexOf(m);
  return i > 0 ? months[i - 1] : null;
}

export default function Dashboard() {
  const { txns, months, defaultMonth, hydrated, settings, setSettings } = useData();
  const [account, setAccount] = useState<AccountFilter>('all');
  const [month, setMonth] = useState<string>('');
  const [range, setRange] = useState<RangeMode>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // V2 folds the donut and the ranked list into one card; this picks the view
  const [catView, setCatView] = useState<CatView>('rank');

  const selected = month || defaultMonth || months[months.length - 1] || '';
  const exFlags = useMemo(
    () => ({ excludeMovingTransfers: settings.excludeMovingTransfers, excludeOneOff: settings.excludeOneOff }),
    [settings.excludeMovingTransfers, settings.excludeOneOff],
  );

  const monthAggs = useMemo(() => aggregateByMonth(txns, { account, ...exFlags }), [txns, account, exFlags]);

  // which calendar months fall inside the active range
  const rangeMonths = useMemo(() => {
    if (range === 'month') return [selected];
    if (range === '3m') {
      const i = months.indexOf(selected);
      return months.slice(Math.max(0, i - 2), i + 1);
    }
    return months.filter((m) => (!from || m >= from.slice(0, 7)) && (!to || m <= to.slice(0, 7)));
  }, [range, selected, months, from, to]);

  const inRange = useCallback(
    (date: string) => {
      if (range === 'month') return date.slice(0, 7) === selected;
      if (range === '3m') return rangeMonths.includes(date.slice(0, 7));
      return (!from || date >= from) && (!to || date <= to);
    },
    [range, selected, rangeMonths, from, to],
  );

  const events = useMemo(
    () => toSpendingEvents(txns, { account, ...exFlags }).filter((e) => inRange(e.date)),
    [txns, account, exFlags, inRange],
  );

  const total = events.reduce((s, e) => s + e.signed, 0);
  const count = events.filter((e) => !e.isRefundAdjustment).length;
  const discretionary = events.filter((e) => e.group === 'discretionary').reduce((s, e) => s + e.signed, 0);
  const incomplete = rangeMonths.some((m) => monthAggs.find((a) => a.month === m)?.incomplete);

  // month-vs-previous delta only makes sense in single-month mode
  const prevM = prevMonthOf(months, selected);
  const prev = prevM ? monthAggs.find((m) => m.month === prevM) : undefined;
  const delta = range === 'month' && prev && prev.total ? (total - prev.total) / prev.total : undefined;

  const daysWithData = useMemo(() => new Set(events.map((e) => e.date)).size, [events]);
  const avgPerDay = daysWithData ? total / daysWithData : 0;

  const catAggs = useMemo(() => aggregateByCategory(events).filter((c) => c.total > 0), [events]);

  const rangeLabel =
    range === 'month' ? formatMonth(selected)
    : range === '3m' ? `${rangeMonths.length} เดือน`
    : 'ช่วงที่เลือก';

  const monthlySeries = monthAggs.map((m) => m.total);

  const shareImage = () =>
    downloadMonthSummaryImage(
      {
        title: range === 'month' ? formatMonth(selected, true) : rangeLabel,
        total,
        deltaPct: range === 'month' ? delta ?? null : null,
        count,
        avgPerDay,
        incomplete,
        split: [
          { label: 'จำเป็น', value: events.filter((e) => e.group === 'essential').reduce((s2, e) => s2 + e.signed, 0), color: '#16a34a' },
          { label: 'ลดได้', value: discretionary, color: '#f97316' },
          { label: 'โอน/ถอน', value: events.filter((e) => e.group === 'transfer').reduce((s2, e) => s2 + e.signed, 0), color: '#2a78d6' },
        ],
        cats: catAggs.slice(0, 6).map((c) => ({ name: c.category, total: c.total, share: c.share, color: categoryColor(c.category) })),
      },
      `jafinance-${range === 'month' ? selected : 'range'}.png`,
    );

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const essential = events.filter((e) => e.group === 'essential').reduce((s2, e) => s2 + e.signed, 0);
  const transfer = events.filter((e) => e.group === 'transfer').reduce((s2, e) => s2 + e.signed, 0);

  return (
    <div className="space-y-6">
      {/* V2: two toolbar rows replace the four stacked control rows */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-h1 font-bold">ภาพรวม</h1>
          {incomplete && <IncompleteBadge />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<RangeMode> value={range} onChange={setRange}
            options={[{ v: 'month', label: 'เดือน' }, { v: '3m', label: '3 เดือน' }, { v: 'custom', label: 'กำหนดเอง' }]} />
          {range !== 'custom' && <MonthSelect months={months} value={selected} onChange={setMonth} />}
          {range === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" aria-label="ตั้งแต่วันที่" className="input !w-auto !py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-ink-soft">–</span>
              <input type="date" aria-label="ถึงวันที่" className="input !w-auto !py-2" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 justify-between">
        <AccountToggle value={account} onChange={setAccount} />
        <div className="flex flex-wrap items-center gap-2">
          <FilterToggle checked={settings.excludeMovingTransfers}
            onChange={(v) => setSettings((st) => ({ ...st, excludeMovingTransfers: v }))}>
            ตัด “ย้ายเงิน” ออก
          </FilterToggle>
          <FilterToggle checked={settings.excludeOneOff}
            onChange={(v) => setSettings((st) => ({ ...st, excludeOneOff: v }))}>
            ตัดก้อนใหญ่/ไม่ประจำ
          </FilterToggle>
          <button onClick={shareImage} className="btn-secondary !py-2 !px-3" aria-label="บันทึกรูปสรุป">
            <ImageDown size={15} aria-hidden /> <span className="hidden sm:inline">บันทึกเป็นรูป</span>
          </button>
        </div>
      </div>

      {/* V2 summary card — same figures the gradient hero carried, on the one
          card style, with the จำเป็น/ลดได้ split folded in so it stops being
          a separate card that repeats the period total. */}
      <section className="card card-pad animate-rise space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-label text-ink-soft">รายจ่าย{range === 'month' ? 'เดือนนี้' : 'รวม'} · {rangeLabel}</p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
              <span className="text-display font-bold tnum tracking-tight">
                <CountUp value={total} format={formatTHB} />
              </span>
              {delta != null && Math.round(Math.abs(delta) * 100) >= 1 && (
                <span className={`pill tnum ${delta > 0 ? 'bg-error/12 text-error' : 'bg-success/12 text-success'}`}>
                  {delta > 0 ? <TrendingUp size={13} aria-hidden /> : <TrendingDown size={13} aria-hidden />}
                  {delta > 0 ? '+' : ''}{Math.round(delta * 100)}% เทียบ {prevM ? formatMonth(prevM) : 'ก่อนหน้า'}
                </span>
              )}
            </div>
            <p className="mt-2 text-body-sm text-ink-soft tnum">
              {count} รายการ · เฉลี่ย {formatTHB(avgPerDay)}/วัน · ข้อมูล {daysWithData} วัน
            </p>
          </div>
          <div className="hidden xs:block shrink-0">
            <Sparkline data={monthlySeries.length ? monthlySeries : [0, 0]} width={168} height={56} strokeWidth={2}
              stroke="rgb(var(--brand))" fill="rgb(var(--brand) / 0.12)" />
          </div>
        </div>
        <div className="border-t border-line pt-4">
          <p className="text-label text-ink-soft mb-2">แบ่งตามลักษณะรายจ่าย</p>
          <GroupSplitBar essential={essential} discretionary={discretionary} transfer={transfer} />
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="เฉลี่ยต่อวัน" value={<CountUp value={avgPerDay} format={formatTHB} />} icon={CalendarDays}
          accent="rgb(var(--brand-2))" sub={`จาก ${daysWithData} วันที่มีข้อมูล`} />
        <StatCard label="จำนวนรายการ" value={<CountUp value={count} />} icon={Receipt}
          accent="rgb(var(--brand))" sub={daysWithData ? `~${Math.round(count / daysWithData)} รายการ/วัน` : undefined} />
        <StatCard label="หมวดที่ใช้" value={<CountUp value={catAggs.length} />} icon={Tags}
          accent="#8b5cf6" sub="ในช่วงที่เลือก" />
      </div>

      {incomplete && (
        <Notice tone="warn">
          ช่วงนี้ข้อมูลไม่ครบทุกวัน (โดยเฉพาะฝั่ง KBank ที่มีเป็นช่วงๆ) ยอดจริงอาจสูงกว่านี้ —
          ใช้เปรียบเทียบเฉพาะช่วงที่ข้อมูลครบ
        </Notice>
      )}

      <section className="card card-pad">
        <SectionTitle action={<span className="text-caption text-ink-soft">คลิกแท่งเพื่อเลือกเดือน · แท่งลายเส้น = เดือนข้อมูลไม่ครบ</span>}>
          รายจ่ายรายเดือน
        </SectionTitle>
        <MonthlyBarChart
          data={monthAggs.map((m) => ({ month: m.month, total: m.total, incomplete: m.incomplete }))}
          onSelect={(m) => { setMonth(m); setRange('month'); }}
          active={range === 'month' ? selected : undefined}
        />
      </section>

      {/* V2: the donut and the ranked list were two cards showing the same
          numbers side by side. One card, one heading, a view toggle — both
          views kept. */}
      <section className="card card-pad">
        <SectionTitle
          action={
            <Segmented<CatView> value={catView} onChange={setCatView}
              options={[{ v: 'rank', label: 'อันดับ' }, { v: 'donut', label: 'โดนัท' }]} />
          }
        >
          แยกตามหมวด
        </SectionTitle>

        {catAggs.length === 0 ? (
          <p className="text-body-sm text-ink-soft py-10 text-center">ไม่มีข้อมูลในช่วงที่เลือก</p>
        ) : catView === 'donut' ? (
          <CategoryDonut data={catAggs.map((c) => ({ category: c.category, total: c.total }))}
            centerLabel="รวม" centerValue={formatTHB(total)} />
        ) : (
          <ul className="space-y-4">
            {catAggs.slice(0, 6).map((c) => (
              <li key={c.category}>
                <div className="flex items-center gap-3">
                  <CategoryChip name={c.category} />
                  <span className="text-caption text-ink-soft hidden sm:inline">{c.count} รายการ</span>
                  <div className="ml-auto flex items-baseline gap-3">
                    <span className="text-body-sm text-ink-soft tnum">{Math.round(c.share * 100)}%</span>
                    <span className="text-h3 font-semibold tnum"><Money value={c.total} /></span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(3, Math.round(c.share * 100))}%`, background: categoryColor(c.category) }} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <Link href="/categories" className="mt-4 -mx-1 inline-flex items-center gap-1.5 rounded-sm px-1 py-1.5 text-label font-medium text-brand hover:underline">
          ดูทั้งหมด {catAggs.length} หมวด →
        </Link>
      </section>

      <p className="text-caption text-ink-soft text-center px-4">
        ข้อมูลทั้งหมดเก็บในเครื่องของคุณเท่านั้น (localStorage) ไม่มีการส่งออกไปเซิร์ฟเวอร์ภายนอก
      </p>
    </div>
  );
}

/** Checkbox that reads as a toggle chip. Still a real checkbox underneath, so
 *  keyboard and screen-reader behaviour is unchanged. */
function FilterToggle({ checked, onChange, children }: {
  checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <label className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-label cursor-pointer transition-colors ${
      checked ? 'border-brand bg-brand/10 text-ink' : 'border-line-strong bg-surface text-ink-soft hover:bg-surface-2'
    }`}>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={`grid place-items-center h-4 w-4 rounded-[4px] border ${
        checked ? 'border-brand bg-brand text-white' : 'border-line-strong'
      }`}>{checked ? '✓' : ''}</span>
      {children}
    </label>
  );
}
