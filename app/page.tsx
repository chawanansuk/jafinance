'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Receipt, CalendarDays, TrendingUp, Wallet } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { StatCard, SectionTitle, IncompleteBadge, Notice, Money, CategoryChip, Skeleton } from '@/components/ui';
import { MonthSelect, AccountToggle, Segmented, type AccountFilter } from '@/components/Controls';

type RangeMode = 'month' | '3m' | 'custom';
import { MonthlyBarChart, CategoryDonut } from '@/components/charts';
import {
  aggregateByMonth, aggregateByCategory, toSpendingEvents,
} from '@/lib/analytics';
import { formatMonth } from '@/lib/format';

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

  const selected = month || defaultMonth || months[months.length - 1] || '';
  const exFlags = { excludeMovingTransfers: settings.excludeMovingTransfers, excludeOneOff: settings.excludeOneOff };

  const monthAggs = useMemo(
    () => aggregateByMonth(txns, { account, ...exFlags }),
    [txns, account, settings.excludeMovingTransfers, settings.excludeOneOff],
  );

  // which calendar months fall inside the active range
  const rangeMonths = useMemo(() => {
    if (range === 'month') return [selected];
    if (range === '3m') {
      const i = months.indexOf(selected);
      return months.slice(Math.max(0, i - 2), i + 1);
    }
    return months.filter((m) => (!from || m >= from.slice(0, 7)) && (!to || m <= to.slice(0, 7)));
  }, [range, selected, months, from, to]);

  const inRange = (date: string) => {
    if (range === 'month') return date.slice(0, 7) === selected;
    if (range === '3m') return rangeMonths.includes(date.slice(0, 7));
    return (!from || date >= from) && (!to || date <= to);
  };

  const events = useMemo(
    () => toSpendingEvents(txns, { account, ...exFlags }).filter((e) => inRange(e.date)),
    [txns, account, selected, range, from, to, rangeMonths, settings.excludeMovingTransfers, settings.excludeOneOff],
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

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">ภาพรวม</h1>
          {incomplete && <IncompleteBadge />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<RangeMode> value={range} onChange={setRange}
            options={[{ v: 'month', label: 'เดือน' }, { v: '3m', label: '3 เดือน' }, { v: 'custom', label: 'กำหนดเอง' }]} />
          {range !== 'custom' && <MonthSelect months={months} value={selected} onChange={setMonth} />}
          {range === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" className="input !w-auto !py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-ink-soft text-sm">–</span>
              <input type="date" className="input !w-auto !py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
        <AccountToggle value={account} onChange={setAccount} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.excludeMovingTransfers}
              onChange={(e) => setSettings((s) => ({ ...s, excludeMovingTransfers: e.target.checked }))} />
            <span className="text-ink-soft">ตัด “ย้ายเงิน” ออก</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.excludeOneOff}
              onChange={(e) => setSettings((s) => ({ ...s, excludeOneOff: e.target.checked }))} />
            <span className="text-ink-soft">ตัดก้อนใหญ่/ไม่ประจำ</span>
          </label>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={`รายจ่าย ${rangeLabel}`}
          value={<Money value={total} />}
          icon={Wallet}
          delta={delta}
          sub={range === 'month' ? (prev ? `เทียบ ${formatMonth(prevM!)}` : 'ไม่มีเดือนก่อนหน้า') : `${rangeMonths.length} เดือน`}
        />
        <StatCard label="เฉลี่ยต่อวัน" value={<Money value={avgPerDay} />} icon={CalendarDays}
          sub={`${daysWithData} วันที่มีข้อมูล`} />
        <StatCard label="จำนวนรายการ" value={String(count)} icon={Receipt} />
        <StatCard label="ลดได้ (discretionary)" value={<Money value={discretionary} />} icon={TrendingUp}
          sub={total ? `${Math.round((discretionary / total) * 100)}% ของยอด` : undefined} />
      </div>

      {incomplete && (
        <Notice tone="warn">
          ช่วงนี้ข้อมูลไม่ครบทุกวัน (โดยเฉพาะฝั่ง KBank ที่มีเป็นช่วงๆ) ยอดจริงอาจสูงกว่านี้ —
          ใช้เปรียบเทียบเฉพาะช่วงที่ข้อมูลครบ
        </Notice>
      )}

      {/* monthly bar */}
      <div className="card card-pad">
        <SectionTitle action={<span className="text-xs text-ink-soft">คลิกแท่งเพื่อเลือกเดือน · แท่งจางคือเดือนข้อมูลไม่ครบ</span>}>
          รายจ่ายรายเดือน
        </SectionTitle>
        <MonthlyBarChart
          data={monthAggs.map((m) => ({ month: m.month, total: m.total, incomplete: m.incomplete }))}
          onSelect={(m) => { setMonth(m); setRange('month'); }}
          active={range === 'month' ? selected : undefined}
        />
      </div>

      {/* donut + top categories */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card card-pad">
          <SectionTitle>แยกตามหมวด</SectionTitle>
          {catAggs.length ? (
            <CategoryDonut data={catAggs.map((c) => ({ category: c.category, total: c.total }))} />
          ) : (
            <p className="text-sm text-ink-soft py-10 text-center">ไม่มีข้อมูลในเดือนนี้</p>
          )}
        </div>
        <div className="card card-pad">
          <SectionTitle action={<Link href="/categories" className="text-xs text-brand">ดูทั้งหมด →</Link>}>
            หมวดที่จ่ายมากสุด
          </SectionTitle>
          <ul className="space-y-2.5">
            {catAggs.slice(0, 6).map((c) => (
              <li key={c.category} className="flex items-center gap-3">
                <CategoryChip name={c.category} />
                <div className="ml-auto text-right">
                  <div className="font-semibold tnum"><Money value={c.total} /></div>
                  <div className="text-xs text-ink-soft">{Math.round(c.share * 100)}% · {c.count} รายการ</div>
                </div>
              </li>
            ))}
            {catAggs.length === 0 && <p className="text-sm text-ink-soft text-center py-6">ไม่มีข้อมูล</p>}
          </ul>
        </div>
      </div>

      <p className="text-xs text-ink-soft text-center px-4">
        ข้อมูลทั้งหมดเก็บในเครื่องของคุณเท่านั้น (localStorage) ไม่มีการส่งออกไปเซิร์ฟเวอร์ภายนอก
      </p>
    </div>
  );
}
