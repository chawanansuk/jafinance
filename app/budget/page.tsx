'use client';

import { useMemo, useState } from 'react';
import { Wand2, PiggyBank, Target, TrendingUp, AlertTriangle, Info } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { StatCard, SectionTitle, ProgressBar, CategoryChip, Money, CountUp, Notice, Pending, Skeleton, IncompleteBadge } from '@/components/ui';
import { MonthSelect } from '@/components/Controls';
import {
  categoryBudgetRows, suggestBudgets, monthSummary, getIncome, getCeiling, cumulativeSavings,
} from '@/lib/budget';
import { projectMonth, aggregateByMonth, aggregateByGroup, toSpendingEvents } from '@/lib/analytics';
import { TrendLineChart, GroupSplitBar } from '@/components/charts';
import { formatTHB, formatMonth, formatPct } from '@/lib/format';

export default function BudgetPage() {
  const { txns, months, defaultMonth, budget, setBudget, hydrated } = useData();
  const [month, setMonth] = useState('');
  const selected = month || defaultMonth || months[months.length - 1] || '';

  const rows = useMemo(() => categoryBudgetRows(txns, budget, selected), [txns, budget, selected]);
  const summary = useMemo(() => monthSummary(txns, budget, selected), [txns, budget, selected]);
  const projection = useMemo(() => projectMonth(txns, selected), [txns, selected]);
  const overCount = useMemo(() => rows.filter((r) => r.tone === 'over' && r.budget).length, [rows]);
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
  const savings = useMemo(() => cumulativeSavings(txns, budget), [txns, budget]);

  // clearing a field deletes the key — storing 0 would block the "*" fallback
  // and make "เติมงบที่ว่าง" skip fields the user cleared.
  const setCatBudget = (category: string, value: number) =>
    setBudget((p) => {
      const cur = { ...(p.byMonth[selected] ?? {}) };
      if (value > 0) cur[category] = value;
      else delete cur[category];
      return { ...p, byMonth: { ...p.byMonth, [selected]: cur } };
    });

  const setIncome = (value: number) =>
    setBudget((p) => {
      const income = { ...p.income };
      if (value > 0) income[selected] = value;
      else delete income[selected];
      return { ...p, income };
    });
  const setSavingsGoal = (value: number) =>
    setBudget((p) => ({ ...p, savingsGoal: value || undefined }));
  const setCeiling = (value: number) =>
    setBudget((p) => {
      const ceiling = { ...p.ceiling };
      if (value > 0) ceiling[selected] = value;
      else delete ceiling[selected];
      return { ...p, ceiling };
    });

  const prevMonth = months[months.indexOf(selected) - 1] ?? null;
  const copyPrev = () => {
    if (!prevMonth) return;
    const src = budget.byMonth[prevMonth];
    if (!src || Object.keys(src).length === 0) return;
    setBudget((p) => ({ ...p, byMonth: { ...p.byMonth, [selected]: { ...src } } }));
  };
  const prevHasBudgets = !!prevMonth && Object.keys(budget.byMonth[prevMonth] ?? {}).length > 0;

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
          <h1 className="page-title">งบประมาณ</h1>
          {incomplete && <IncompleteBadge />}
        </div>
        <MonthSelect months={months} value={selected} onChange={setMonth} />
      </div>

      {/* income + savings */}
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="card card-pad space-y-3">
          <SectionTitle>รายได้ & เงินเก็บ</SectionTitle>
          <label className="block">
            <span className="field-label">รายได้จริงเดือนนี้ (กรอกเอง)</span>
            <input
              type="number" inputMode="numeric" className="input"
              placeholder="เช่น 50000"
              value={income || ''}
              onChange={(e) => setIncome(Number(e.target.value) || 0)}
            />
          </label>
          <p className="text-caption text-ink-soft flex gap-1.5 items-start">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
            ไฟล์ไม่มีเงินเดือนจริง (เงินเข้าเป็นการโอนเติมบัญชี) จึงต้องกรอกเอง
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <div className="text-label text-ink-soft">เงินเหลือเก็บ</div>
              <div className={`text-h2 font-bold tnum ${income ? (summary.savings >= 0 ? 'text-success' : 'text-error') : ''}`}>
                {income ? formatTHB(summary.savings) : <Pending>กรอกรายได้ก่อน</Pending>}
              </div>
            </div>
            <div>
              <div className="text-label text-ink-soft">อัตราการออม</div>
              <div className="text-h2 font-bold tnum">
                {income ? formatPct(summary.savingsRate) : <Pending>กรอกรายได้ก่อน</Pending>}
              </div>
            </div>
          </div>
        </div>

        <div className="card card-pad space-y-3">
          <SectionTitle>เพดานใช้จ่าย & คาดการณ์</SectionTitle>
          <label className="block">
            <span className="field-label">เพดานใช้จ่ายรวมเดือนนี้</span>
            <input
              type="number" inputMode="numeric" className="input"
              placeholder="เช่น 40000"
              value={ceiling || ''}
              onChange={(e) => setCeiling(Number(e.target.value) || 0)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-label text-ink-soft">ใช้ไปแล้ว</div>
              <div className="text-h2 font-bold tnum">{formatTHB(summary.totalActual)}</div>
            </div>
            <div>
              <div className="text-label text-ink-soft">{ceiling ? 'เหลือใช้ได้' : 'คาดการณ์สิ้นเดือน'}</div>
              <div className="text-h2 font-bold tnum">
                {ceiling
                  ? formatTHB(Math.max(0, ceiling - summary.totalActual))
                  : projection.reliable
                    ? formatTHB(projection.projected!)
                    : <Pending>ข้อมูลเดือนนี้ยังไม่พอพยากรณ์</Pending>}
              </div>
            </div>
          </div>
          {!!ceiling && summary.remainingPerDayLeft != null && (
            <p className="text-caption text-ink-soft">เหลือใช้ได้อีก ~{formatTHB(summary.remainingPerDayLeft)}/วัน</p>
          )}
          {!projection.reliable && !ceiling && (
            <p className="text-caption text-warning flex gap-1.5 items-start">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              ข้อมูลเดือนนี้ไม่พอพยากรณ์ (ครบ {projection.daysElapsed}/{projection.daysInMonth} วัน)
            </p>
          )}
        </div>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 animate-rise" style={{ animationDelay: '60ms' }}>
        <StatCard label="งบรวมทั้งเดือน" icon={Target} accent="rgb(var(--brand-2))"
          value={summary.totalBudget ? <CountUp value={summary.totalBudget} format={formatTHB} /> : <Pending>ยังไม่ได้ตั้งงบ</Pending>}
          sub={summary.totalBudget ? undefined : 'กด "เติมงบที่ว่าง" ด้านล่าง'} />
        <StatCard label="ใช้ไปแล้ว" value={<CountUp value={summary.totalActual} format={formatTHB} />}
          icon={TrendingUp} accent="rgb(var(--brand))" />
        <StatCard label="คงเหลือ" icon={PiggyBank} accent="rgb(var(--brand))"
          value={summary.totalBudget ? <CountUp value={summary.remaining} format={formatTHB} /> : <Pending>ตั้งงบก่อน</Pending>}
          tone={summary.totalBudget ? (summary.remaining < 0 ? 'bad' : 'good') : 'default'} />
        <StatCard label="หมวดที่เกินงบ" icon={AlertTriangle}
          accent={overCount > 0 ? 'rgb(var(--error))' : 'rgb(var(--ink-soft))'}
          value={summary.totalBudget ? String(overCount) : <Pending>ตั้งงบก่อน</Pending>}
          tone={overCount > 0 ? 'bad' : 'default'}
          sub={summary.totalBudget && overCount === 0 ? 'ทุกหมวดยังอยู่ในงบ' : undefined} />
      </div>

      {/* These two were consecutive full-width cards, but the split is short
          and the savings goal is tall — pairing them narrow + wide stops the
          page reading as one long column. */}
      <div className="grid gap-5 lg:grid-cols-3">
      {/* essential vs discretionary */}
      <div className="card card-pad space-y-3">
        <SectionTitle>จำเป็น vs ลดได้</SectionTitle>
        {/* The shared split bar, not a local copy: the copy drew จำเป็น in
            emerald-500 while the dashboard and share image use the group
            colour, so the same group was two greens a page apart. */}
        <GroupSplitBar essential={essential} discretionary={discretionary} transfer={0} />
        {discretionary > 0 && (
          <Notice>
            ถ้าลดรายจ่าย “ลดได้” ลง 20% เดือนนี้ จะเก็บเพิ่มได้ราว <b>{formatTHB(saveIfCut)}</b>
          </Notice>
        )}
      </div>

      {/* cross-month savings goal */}
      <div className="card card-pad space-y-3 lg:col-span-2">
        <SectionTitle action={<PiggyBank size={16} className="text-ink-soft" />}>เป้าหมายเงินเก็บสะสม (ข้ามเดือน)</SectionTitle>
        <div className="flex flex-wrap items-end gap-6">
          <label className="block">
            <span className="field-label">ตั้งเป้าเก็บรวม</span>
            <input type="number" inputMode="numeric" className="input !w-44"
              placeholder="เช่น 100000"
              value={budget.savingsGoal || ''}
              onChange={(e) => setSavingsGoal(Number(e.target.value) || 0)} />
          </label>
          <div>
            <div className="text-label text-ink-soft">เก็บได้แล้ว (เดือนที่กรอกรายได้)</div>
            <div className={`text-h2 font-bold tnum ${savings.totalSaved >= 0 ? 'text-success' : 'text-error'}`}>
              {formatTHB(savings.totalSaved)}
            </div>
          </div>
        </div>
        {budget.savingsGoal ? (
          <div className="flex items-center gap-2">
            <ProgressBar value={Math.max(0, savings.totalSaved)} max={budget.savingsGoal}
              tone={savings.totalSaved >= budget.savingsGoal ? 'safe' : 'warn'} />
            <span className="text-caption tnum w-12 text-right text-ink-soft">
              {Math.round((savings.totalSaved / budget.savingsGoal) * 100)}%
            </span>
          </div>
        ) : (
          <p className="text-caption text-ink-soft">ตั้งเป้าหมายเพื่อดูความคืบหน้า · กรอกรายได้ในแต่ละเดือนเพื่อให้คำนวณได้</p>
        )}
        {savings.points.length > 0 && (
          <TrendLineChart data={savings.points.map((p) => ({ month: p.month, total: p.cumulative }))} />
        )}
        {savings.points.length === 0 && (
          <p className="text-caption text-ink-soft">ยังไม่มีเดือนที่กรอกรายได้ — กรอกรายได้ด้านบนก่อน</p>
        )}
      </div>
      </div>

      {/* per-category budgets */}
      <div className="card card-pad">
        <SectionTitle action={
          <div className="flex gap-2">
            {prevHasBudgets && (
              <button onClick={copyPrev} className="btn-ghost btn-sm">คัดลอกจาก {prevMonth ? formatMonth(prevMonth) : ''}</button>
            )}
            <button onClick={autoFill} className="btn-ghost btn-sm"><Wand2 size={14} /> เติมงบที่ว่าง</button>
            <button onClick={autoFillAll} className="btn-ghost btn-sm">ตั้งใหม่ทั้งหมด</button>
          </div>
        }>
          งบต่อหมวด ({formatMonth(selected)})
        </SectionTitle>
        <p className="text-caption text-ink-soft mb-3">“ตั้งงบอัตโนมัติ” = ค่าเฉลี่ยรายจ่ายจริงย้อนหลังของหมวดนั้น (เฉพาะเดือนข้อมูลครบ)</p>
        <ul className="space-y-3.5">
          {rows.map((r) => (
            <li key={r.category} className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1"><CategoryChip name={r.category} /></span>
                <span className="text-body font-semibold tnum whitespace-nowrap shrink-0"><Money value={r.actual} /></span>
                <span className="text-ink-soft text-body">/</span>
                <input
                  type="number" inputMode="numeric"
                  className="input !w-24 !py-1 text-right"
                  placeholder="ตั้งงบ"
                  aria-label={`งบหมวด ${r.category}`}
                  value={r.budget ?? ''}
                  onChange={(e) => setCatBudget(r.category, Number(e.target.value) || 0)}
                />
              </div>
              {r.budget ? (
                <div className="flex items-center gap-2">
                  <ProgressBar value={r.actual} max={r.budget} tone={r.tone} />
                  <span className={`text-caption tnum w-12 text-right ${
                    r.tone === 'over' ? 'text-error' : r.tone === 'warn' ? 'text-warning' : 'text-ink-soft'
                  }`}>{Math.round(r.pct * 100)}%</span>
                </div>
              ) : (
                <div className="h-2 rounded-full bg-surface-2" />
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="text-center text-body-sm text-ink-soft py-6">ไม่มีข้อมูลในเดือนนี้</li>}
        </ul>
      </div>
    </div>
  );
}

