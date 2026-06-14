'use client';

import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatTHB, formatMonth } from '@/lib/format';
import { categoryColor } from '@/lib/categories';

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
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.95} />
            <stop offset="100%" stopColor="rgb(var(--brand-2))" stopOpacity={0.8} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m)} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickFormatter={kFmt} tickLine={false} axisLine={false} fontSize={11} width={36} />
        <Tooltip content={<MoneyTooltip labelFmt={(m: string) => formatMonth(m, true)} />} cursor={{ fill: 'rgb(var(--surface-2))', radius: 8 }} />
        <Bar dataKey="total" name="รายจ่าย" radius={[7, 7, 0, 0]} onClick={(d: any) => onSelect?.(d.month)} cursor={onSelect ? 'pointer' : 'default'}>
          {data.map((d) => (
            <Cell
              key={d.month}
              fill={d.incomplete ? 'rgb(var(--ink-soft))' : 'url(#barGrad)'}
              fillOpacity={active && active !== d.month ? 0.32 : d.incomplete ? 0.5 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({
  data, onSelect, centerLabel, centerValue,
}: {
  data: { category: string; total: number }[];
  onSelect?: (c: string) => void;
  centerLabel?: string;
  centerValue?: string;
}) {
  const positive = data.filter((d) => d.total > 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={positive}
            dataKey="total"
            nameKey="category"
            innerRadius={62}
            outerRadius={94}
            paddingAngle={1.5}
            stroke="rgb(var(--surface))"
            strokeWidth={3}
            onClick={(d: any) => onSelect?.(d.category)}
            cursor={onSelect ? 'pointer' : 'default'}
          >
            {positive.map((d) => <Cell key={d.category} fill={categoryColor(d.category)} />)}
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
  );
}

export function TrendLineChart({ data }: { data: { month: string; total: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.28} />
            <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m)} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickFormatter={kFmt} tickLine={false} axisLine={false} fontSize={11} width={36} />
        <Tooltip content={<MoneyTooltip labelFmt={(m: string) => formatMonth(m, true)} />} />
        <Area type="monotone" dataKey="total" name="รายจ่าย" stroke="rgb(var(--brand))" strokeWidth={2.5}
          fill="url(#trendGrad)" dot={{ r: 3, fill: 'rgb(var(--brand))' }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GroupBars({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={64} fontSize={12} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgb(var(--surface-2))', radius: 8 }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
