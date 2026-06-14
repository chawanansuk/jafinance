'use client';

import { useMemo, useState } from 'react';
import { Wand2, PiggyBank, Target, TrendingUp, AlertTriangle } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { StatCard, SectionTitle, ProgressBar, CategoryChip, Money, Notice, Skeleton, IncompleteBadge } from '@/components/ui';
import { MonthSelect } from '@/components/Controls';
import {
  categoryBudgetRows, suggestBudgets, monthSummary, getIncome, getCeiling,
} from '@/lib/budget';
import { projectMonth, aggregateByMonth, aggregateByGroup, toSpendingEvents } from '@/lib/analytics';
import { formatTHB, formatMonth, formatPct } from '@/lib/format';

export default function BudgetPage() {
  const { txns, months, defaultMonth, budget, setBudget, hydrated } = useData();
  const [month, setMonth] = useState('');
  const selected = month || defaultMonth || months[months.length - 1] || '';

  const rows = useMemo(() => categoryBudgetRows(txns, budget, selected), [txns, budget, selected]);
  const summary = useMemo(() => monthSummary(txns, budget, selected), [txns, budget, selected]);
  const projection = useMemo(() => projectMonth(txns, selected), [txns, selected]);
  const incomplete = useMemo(
    () => aggregateByMonth(txns).find((m) => m.month === selected)?.incomplete ?? false,
    [txns, selected],
  );

  const groups = useMemo(() => {
    const ev = toSpendingEvents(txns).filter((e) => e.month === selected);
    return aggregateByGroup(ev);
  }, [txns, selected]);

  const income = getIncome(budget, selected);
  const ceiling = getCeiling(budget, selected);

  const setCatBudget = (category: string, value: number) =>
    setBudget((p) => ({
      ...p,
      byMonth: { ...p.byMonth, [selected]: { ...(p.byMonth[selected] ?? {}), [category]: value } },
    }));

  const setIncome = (value: number) =>
    setBudget((p) => ({ ...p, income: { ...p.income, [selected]: value } }));
  const setCeiling = (value: number) =>
    setBudget((p) => ({ ...p, ceiling: { ...p.ceiling, [selected]: value } }));

  const autoFill = () => {
    const sug = suggestBudgets(txns);
    setBudget((p) => ({ ...p, byMonth: { ...p.byMonth, [selected]: { ...sug, ...(p.byMonth[selected] ?? {}) } } }));
  };
  const autoFillAll = () => {
    const sug = suggestBudgets(txns);
    setBudget((p) => ({ ...p, byMonth: { ...p.byMonth, [selected]: sug } }));
  };

  if (!hydrated) return <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;

  const discretionary = groups.discretionary;
  const essential = groups.essential;
  const saveIfCut = discretionary * 0.2;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">งบประมาณ</h1>
          {incomplete && <IncompleteBadge />}
        </div>
        <MonthSelect months={months} value={selected} onChange={setMonth} />
      </div>

      {/* income + savings */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card card-pad space-y-3">
          <SectionTitle>รายได้ & เงินเก็บ</SectionTitle>
          <label className="block text-sm">
            <span className="text-ink-soft">รายได้จริงเดือนนี้ (กรอกเอง)</span>
            <input
              type="number" inputMode="numeric" className="input mt-1"
              placeholder="เช่น 50000"
              value={income || ''}
              onChange={(e) => setIncome(Number(e.target.value) || 0)}
            />
          </label>
          <p className="text-xs text-ink-soft flex gap-1.5 items-start">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            ไฟล์ไม่มีเงินเดือนจริง (เงินเข้าเป็นการโอนเติมบัญชี) จึงต้องกรอกเอง
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <div className="text-xs text-ink-soft">เงินเหลือเก็บ</div>
              <div className={`text-lg font-bold tnum ${summary.savings >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {income ? formatTHB(summary.savings) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-soft">อัตราการออม</div>
              <div className="text-lg font-bold tnum">{income ? formatPct(summary.savingsRate) : '—'}</div>
            </div>
          </div>
        </div>

        <div className="card card-pad space-y-3">
          <SectionTitle>เพดานใช้จ่าย & คาดการณ์</SectionTitle>
          <label className="block text-sm">
            <span className="text-ink-soft">เพดานใช้จ่ายรวมเดือนนี้</span>
            <input
              type="number" inputMode="numeric" className="input mt-1"
              placeholder="เช่น 40000"
              value={ceiling || ''}
              onChange={(e) => setCeiling(Number(e.target.value) || 0)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-ink-soft">ใช้ไปแล้ว</div>
              <div className="text-lg font-bold tnum">{formatTHB(summary.totalActual)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-soft">{ceiling ? 'เหลือใช้ได้' : 'คาดการณ์สิ้นเดือน'}</div>
              <div className="text-lg font-bold tnum">
                {ceiling
                  ? formatTHB(Math.max(0, ceiling - summary.totalActual))
                  : projection.reliable
                    ? formatTHB(projection.projected!)
                    : '—'}
              </div>
            </div>
          </div>
          {ceiling && summary.remainingPerDayLeft != null && (
            <p className="text-xs text-ink-soft">เหลือใช้ได้อีก ~{formatTHB(summary.remainingPerDayLeft)}/วัน</p>
          )}
          {!projection.reliable && !ceiling && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5 items-start">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              ข้อมูลเดือนนี้ไม่พอพยากรณ์ (ครบ {projection.daysElapsed}/{projection.daysInMonth} วัน)
            </p>
          )}
        </div>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="งบรวมทั้งเดือน" value={<Money value={summary.totalBudget} />} icon={Target} />
        <StatCard label="ใช้ไปแล้ว" value={<Money value={summary.totalActual} />} icon={TrendingUp} />
        <StatCard label="คงเหลือ" value={<Money value={summary.remaining} />} icon={PiggyBank}
          tone={summary.remaining < 0 ? 'bad' : 'good'} />
        <StatCard label="หมวดที่เกินงบ" value={String(rows.filter((r) => r.tone === 'over' && r.budget).length)} icon={AlertTriangle} />
      </div>

      {/* essential vs discretionary */}
      <div className="card card-pad space-y-3">
        <SectionTitle>จำเป็น vs ลดได้</SectionTitle>
        <div className="flex h-3 rounded-full overflow-hidden bg-surface-2">
          <div className="bg-emerald-500" style={{ width: `${pct(essential, essential + discretionary)}%` }} />
          <div className="bg-orange-500" style={{ width: `${pct(discretionary, essential + discretionary)}%` }} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> จำเป็น <b className="tnum">{formatTHB(essential)}</b></span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-orange-500 inline-block" /> ลดได้ <b className="tnum">{formatTHB(discretionary)}</b></span>
        </div>
        {discretionary > 0 && (
          <Notice>
            ถ้าลดรายจ่าย “ลดได้” ลง 20% เดือนนี้ จะเก็บเพิ่มได้ราว <b>{formatTHB(saveIfCut)}</b>
          </Notice>
        )}
      </div>

      {/* per-category budgets */}
      <div className="card card-pad">
        <SectionTitle action={
          <div className="flex gap-2">
            <button onClick={autoFill} className="btn-ghost !py-1.5 !px-3 text-xs"><Wand2 size={14} /> เติมงบที่ว่าง</button>
            <button onClick={autoFillAll} className="btn-ghost !py-1.5 !px-3 text-xs">ตั้งใหม่ทั้งหมด</button>
          </div>
        }>
          งบต่อหมวด ({formatMonth(selected)})
        </SectionTitle>
        <p className="text-xs text-ink-soft mb-3">“ตั้งงบอัตโนมัติ” = ค่าเฉลี่ยรายจ่ายจริงย้อนหลังของหมวดนั้น (เฉพาะเดือนข้อมูลครบ)</p>
        <ul className="space-y-3.5">
          {rows.map((r) => (
            <li key={r.category} className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1"><CategoryChip name={r.category} /></span>
                <span className="text-sm font-semibold tnum"><Money value={r.actual} /></span>
                <span className="text-ink-soft text-sm">/</span>
                <input
                  type="number" inputMode="numeric"
                  className="input !w-24 !py-1 text-right text-sm"
                  placeholder="ตั้งงบ"
                  value={r.budget ?? ''}
                  onChange={(e) => setCatBudget(r.category, Number(e.target.value) || 0)}
                />
              </div>
              {r.budget ? (
                <div className="flex items-center gap-2">
                  <ProgressBar value={r.actual} max={r.budget} tone={r.tone} />
                  <span className={`text-xs tnum w-12 text-right ${
                    r.tone === 'over' ? 'text-rose-500' : r.tone === 'warn' ? 'text-amber-500' : 'text-ink-soft'
                  }`}>{Math.round(r.pct * 100)}%</span>
                </div>
              ) : (
                <div className="h-2 rounded-full bg-surface-2" />
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="text-center text-sm text-ink-soft py-6">ไม่มีข้อมูลในเดือนนี้</li>}
        </ul>
      </div>
    </div>
  );
}

function pct(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}
