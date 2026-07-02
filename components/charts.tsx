'use client';

import { useEffect, useId, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatTHB, formatMonth } from '@/lib/format';
import { chartCategoryColor } from '@/lib/categories';

/** Follows the <html>.dark class so charts can use dark-mode color steps. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains('dark'));
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

function MoneyTooltip({ active, payload, label, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card !rounded-xl p-3 text-sm shadow-lg">
      {label != null && <div className="font-semibold mb-1">{labelFmt ? labelFmt(label) : label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color || p.fill || p.payload?.fill }} />
          <span className="text-ink-soft">{p.name}</span>
          <span className="ml-auto font-semibold tnum">{formatTHB(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

const kFmt = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`);

export function MonthlyBarChart({
  data, onSelect, active,
}: {
  data: { month: string; total: number; incomplete: boolean }[];
  onSelect?: (m: string) => void;
  active?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const gradId = `barGrad-${uid}`;
  const hatchId = `barHatch-${uid}`;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={1} />
            <stop offset="100%" stopColor="rgb(var(--brand-2))" stopOpacity={0.88} />
          </linearGradient>
          {/* diagonal hatch = "ข้อมูลไม่ครบ" — texture so the state survives
              CVD/print and can't be confused with the faded unselected months */}
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="rgb(var(--surface-2))" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="rgb(var(--ink-soft))" strokeWidth="2.5" strokeOpacity="0.55" />
          </pattern>
        </defs>
        <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m)} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickFormatter={kFmt} tickLine={false} axisLine={false} fontSize={11} width={36} />
        <Tooltip content={<MoneyTooltip labelFmt={(m: string) => formatMonth(m, true)} />} cursor={{ fill: 'rgb(var(--surface-2))', radius: 8 }} />
        <Bar dataKey="total" name="รายจ่าย" radius={[7, 7, 0, 0]} onClick={(d: any) => onSelect?.(d.month)} cursor={onSelect ? 'pointer' : 'default'}>
          {data.map((d) => (
            <Cell
              key={d.month}
              fill={d.incomplete ? `url(#${hatchId})` : `url(#${gradId})`}
              fillOpacity={active && active !== d.month ? 0.4 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const DONUT_TOP_N = 7;
const OTHERS = 'อื่นๆ';

/**
 * Donut with the readability rules applied: only the top slices keep their
 * own identity, the tail folds into a textured "อื่นๆ" slice, and a legend
 * carries name + share so identity never relies on hover or hue alone.
 */
export function CategoryDonut({
  data, onSelect, centerLabel, centerValue,
}: {
  data: { category: string; total: number }[];
  onSelect?: (c: string) => void;
  centerLabel?: string;
  centerValue?: string;
}) {
  const dark = useIsDark();
  const uid = useId().replace(/:/g, '');
  const hatchId = `donutHatch-${uid}`;

  const positive = data.filter((d) => d.total > 0);
  const grand = positive.reduce((s, d) => s + d.total, 0);
  const top = positive.slice(0, DONUT_TOP_N);
  const rest = positive.slice(DONUT_TOP_N);
  const restTotal = rest.reduce((s, d) => s + d.total, 0);
  const slices: { category: string; total: number; isOther?: boolean }[] = restTotal > 0
    ? [...top, { category: `${OTHERS} (${rest.length} หมวด)`, total: restTotal, isOther: true }]
    : [...top];

  const fillOf = (s: { category: string; isOther?: boolean }) =>
    s.isOther ? `url(#${hatchId})` : chartCategoryColor(s.category, dark);

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <defs>
              <pattern id={hatchId} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
                <rect width="7" height="7" fill="rgb(var(--surface-2))" />
                <line x1="0" y1="0" x2="0" y2="7" stroke="rgb(var(--ink-soft))" strokeWidth="2.5" strokeOpacity="0.55" />
              </pattern>
            </defs>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="category"
              innerRadius={60}
              outerRadius={92}
              paddingAngle={2}
              stroke="rgb(var(--surface))"
              strokeWidth={3}
              onClick={(d: any) => !d.isOther && onSelect?.(d.category)}
              cursor={onSelect ? 'pointer' : 'default'}
            >
              {slices.map((s) => <Cell key={s.category} fill={fillOf(s)} />)}
            </Pie>
            <Tooltip content={<MoneyTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {(centerValue || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {centerLabel && <span className="text-xs text-ink-soft">{centerLabel}</span>}
            {centerValue && <span className="text-lg font-bold tnum">{centerValue}</span>}
          </div>
        )}
      </div>
      {/* legend: identity + share without needing hover (mobile has none) */}
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.category}>
            <button
              type="button"
              onClick={() => !s.isOther && onSelect?.(s.category)}
              className={`flex w-full items-center gap-1.5 min-w-0 text-left ${onSelect && !s.isOther ? 'hover:opacity-75' : 'cursor-default'}`}
            >
              <span
                className="h-2.5 w-2.5 rounded-[3px] shrink-0"
                style={
                  s.isOther
                    ? { background: 'repeating-linear-gradient(45deg, rgb(var(--surface-2)) 0 2px, rgb(var(--ink-soft)) 2px 4px)' }
                    : { background: chartCategoryColor(s.category, dark) }
                }
              />
              <span className="truncate text-ink-soft">{s.category}</span>
              <span className="ml-auto shrink-0 tnum font-medium">
                {grand ? Math.round((s.total / grand) * 100) : 0}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendLineChart({ data }: { data: { month: string; total: number }[] }) {
  const uid = useId().replace(/:/g, '');
  const gradId = `trendGrad-${uid}`;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.28} />
            <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m)} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickFormatter={kFmt} tickLine={false} axisLine={false} fontSize={11} width={36} />
        <Tooltip content={<MoneyTooltip labelFmt={(m: string) => formatMonth(m, true)} />} />
        <Area type="monotone" dataKey="total" name="รายจ่าย" stroke="rgb(var(--brand))" strokeWidth={2.5}
          fill={`url(#${gradId})`} dot={{ r: 3, fill: 'rgb(var(--brand))' }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Single stacked bar splitting spending into จำเป็น/ลดได้/โอน-ถอน — replaces
 * two stat cards that showed rounded percentages ("37% / 37%") with no hint
 * that a third group existed. 2px surface gaps between segments; legend below
 * carries names + amounts so color is never the only encoding.
 */
export function GroupSplitBar({
  essential, discretionary, transfer,
}: {
  essential: number;
  discretionary: number;
  transfer: number;
}) {
  const dark = useIsDark();
  const total = essential + discretionary + transfer;
  const parts = [
    { key: 'จำเป็น', value: essential, color: '#16a34a' },
    { key: 'ลดได้', value: discretionary, color: dark ? '#d95926' : '#f97316' },
    { key: 'โอน/ถอน', value: transfer, color: '#2a78d6' },
  ].filter((p) => p.value > 0);
  if (total <= 0) return <p className="text-sm text-ink-soft py-3">ไม่มีข้อมูลในช่วงนี้</p>;
  return (
    <div className="space-y-2.5">
      <div className="flex h-3.5 rounded-full overflow-hidden bg-surface-2 gap-[2px]">
        {parts.map((p) => (
          <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5 min-w-0">
            <i className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: p.color }} />
            <span className="text-ink-soft">{p.key}</span>
            <b className="tnum">{formatTHB(p.value)}</b>
            <span className="text-ink-soft tnum">({Math.round((p.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
