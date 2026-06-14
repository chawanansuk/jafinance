'use client';

import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { formatTHB, formatMonth } from '@/lib/format';
import { categoryColor } from '@/lib/categories';

const moneyTip = (v: number) => formatTHB(v);

function MoneyTooltip({ active, payload, label, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card card-pad !p-3 text-sm">
      {label != null && <div className="font-medium mb-1">{labelFmt ? labelFmt(label) : label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-ink-soft">{p.name}</span>
          <span className="ml-auto font-semibold tnum">{formatTHB(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

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
        <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m)} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} tickLine={false} axisLine={false} fontSize={11} width={36} />
        <Tooltip content={<MoneyTooltip labelFmt={(m: string) => formatMonth(m, true)} />} cursor={{ fill: 'rgb(var(--surface-2))' }} />
        <Bar dataKey="total" name="รายจ่าย" radius={[6, 6, 0, 0]} onClick={(d: any) => onSelect?.(d.month)} cursor={onSelect ? 'pointer' : 'default'}>
          {data.map((d) => (
            <Cell
              key={d.month}
              fill={d.incomplete ? 'rgb(var(--ink-soft))' : 'rgb(var(--brand))'}
              fillOpacity={active && active !== d.month ? 0.35 : d.incomplete ? 0.55 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({
  data, onSelect,
}: {
  data: { category: string; total: number }[];
  onSelect?: (c: string) => void;
}) {
  const positive = data.filter((d) => d.total > 0);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={positive}
          dataKey="total"
          nameKey="category"
          innerRadius={58}
          outerRadius={92}
          paddingAngle={1.5}
          onClick={(d: any) => onSelect?.(d.category)}
          cursor={onSelect ? 'pointer' : 'default'}
        >
          {positive.map((d) => (
            <Cell key={d.category} fill={categoryColor(d.category)} stroke="rgb(var(--surface))" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip content={<MoneyTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({ data }: { data: { month: string; total: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m)} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} tickLine={false} axisLine={false} fontSize={11} width={36} />
        <Tooltip content={<MoneyTooltip labelFmt={(m: string) => formatMonth(m, true)} />} />
        <Line type="monotone" dataKey="total" name="รายจ่าย" stroke="rgb(var(--brand))" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GroupBars({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={64} fontSize={12} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgb(var(--surface-2))' }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
