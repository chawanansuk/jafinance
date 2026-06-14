'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Receipt, CalendarDays, TrendingUp, Wallet } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { StatCard, SectionTitle, IncompleteBadge, Notice, Money, CategoryChip, Skeleton } from '@/components/ui';
import { MonthSelect, AccountToggle, type AccountFilter } from '@/components/Controls';
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

  const selected = month || defaultMonth || months[months.length - 1] || '';

  const evOpts = {
    account,
    excludeMovingTransfers: settings.excludeMovingTransfers,
    excludeOneOff: settings.excludeOneOff,
  };

  const monthAggs = useMemo(
    () => aggregateByMonth(txns, evOpts),
    [txns, account, settings.excludeMovingTransfers, settings.excludeOneOff],
  );

  const monthEvents = useMemo(
    () => toSpendingEvents(txns, evOpts).filter((e) => e.month === selected),
    [txns, account, selected, settings.excludeMovingTransfers, settings.excludeOneOff],
  );

  const cur = monthAggs.find((m) => m.month === selected);
  const prevM = prevMonthOf(months, selected);
  const prev = prevM ? monthAggs.find((m) => m.month === prevM) : undefined;

  const total = cur?.total ?? 0;
  const delta = prev && prev.total ? (total - prev.total) / prev.total : undefined;

  const daysWithData = useMemo(
    () => new Set(monthEvents.map((e) => e.date)).size,
    [monthEvents],
  );
  const avgPerDay = daysWithData ? total / daysWithData : 0;

  const catAggs = useMemo(() => aggregateByCategory(monthEvents).filter((c) => c.total > 0), [monthEvents]);

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
          {cur?.incomplete && <IncompleteBadge />}
        </div>
        <div className="flex items-center gap-2">
          <MonthSelect months={months} value={selected} onChange={setMonth} />
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
          label={`รายจ่าย ${formatMonth(selected)}`}
          value={<Money value={total} />}
          icon={Wallet}
          delta={delta}
          sub={prev ? `เทียบ ${formatMonth(prevM!)}` : 'ไม่มีเดือนก่อนหน้า'}
        />
        <StatCard label="เฉลี่ยต่อวัน" value={<Money value={avgPerDay} />} icon={CalendarDays}
          sub={`${daysWithData} วันที่มีข้อมูล`} />
        <StatCard label="จำนวนรายการ" value={String(cur?.count ?? 0)} icon={Receipt} />
        <StatCard label="ลดได้ (discretionary)" value={<Money value={cur?.discretionary ?? 0} />} icon={TrendingUp}
          sub={total ? `${Math.round(((cur?.discretionary ?? 0) / total) * 100)}% ของเดือน` : undefined} />
      </div>

      {cur?.incomplete && (
        <Notice tone="warn">
          เดือนนี้ข้อมูลไม่ครบทุกวัน (โดยเฉพาะฝั่ง KBank ที่มีเป็นช่วงๆ) ยอดจริงอาจสูงกว่านี้ —
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
          onSelect={setMonth}
          active={selected}
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
