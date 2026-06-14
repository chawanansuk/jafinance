'use client';

import { type ReactNode } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, type LucideIcon } from 'lucide-react';
import { formatTHB, formatDelta } from '@/lib/format';
import { GROUP_LABEL, GROUP_COLOR, categoryMeta } from '@/lib/categories';
import { Sparkline } from './Sparkline';
import type { Group } from '@/lib/types';

export function StatCard({
  label, value, sub, delta, icon: Icon, tone = 'default', accent = 'rgb(var(--brand))', spark,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number; // fraction
  icon?: LucideIcon;
  tone?: 'default' | 'good' | 'bad';
  accent?: string;
  spark?: number[];
}) {
  const d = delta != null ? formatDelta(delta) : null;
  return (
    <div className="card card-pad card-hover relative overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-soft font-medium">{label}</span>
        {Icon && (
          <span className="grid place-items-center h-7 w-7 rounded-lg shrink-0"
            style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}>
            <Icon size={15} />
          </span>
        )}
      </div>
      <div className={`mt-2 text-[1.6rem] leading-tight font-bold tnum ${
        tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-rose-500' : ''
      }`}>{value}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-ink-soft min-w-0">
          {d && d.dir !== 'flat' && (
            <span className={`inline-flex items-center gap-0.5 font-semibold ${
              d.dir === 'up' ? 'text-rose-500' : 'text-emerald-500'
            }`}>
              {d.dir === 'up' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {d.text}
            </span>
          )}
          {sub && <span className="truncate">{sub}</span>}
        </div>
        {spark && spark.length > 1 && (
          <Sparkline data={spark} width={64} height={24} stroke={accent}
            fill={`color-mix(in srgb, ${accent} 16%, transparent)`} />
        )}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, tone }: { value: number; max: number; tone?: 'safe' | 'warn' | 'over' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  const grad =
    tone === 'over' || over ? 'linear-gradient(90deg, #f43f5e, #fb7185)'
    : tone === 'warn' ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
    : 'linear-gradient(90deg, #10b981, #34d399)';
  return (
    <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundImage: grad }} />
    </div>
  );
}

export function GroupBadge({ group }: { group: Group }) {
  return (
    <span
      className="pill"
      style={{ background: GROUP_COLOR[group] + '22', color: GROUP_COLOR[group] }}
    >
      {GROUP_LABEL[group]}
    </span>
  );
}

export function CategoryChip({ name, size = 16 }: { name: string; size?: number }) {
  const meta = categoryMeta(name);
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span className="grid place-items-center rounded-lg shrink-0"
        style={{ background: meta.color + '22', color: meta.color, width: size + 12, height: size + 12 }}>
        <Icon size={size} />
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function IncompleteBadge({ label = 'ข้อมูลไม่ครบ' }: { label?: string }) {
  return (
    <span className="pill bg-amber-500/15 text-amber-600 dark:text-amber-400">
      <AlertTriangle size={12} /> {label}
    </span>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={`rounded-xl px-3.5 py-2.5 text-sm flex gap-2.5 items-start ${
      tone === 'warn'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'bg-brand/10 text-brand'
    }`}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Money({ value, className = '' }: { value: number; className?: string }) {
  const neg = value < 0;
  return (
    <span className={`tnum ${neg ? 'text-emerald-500' : ''} ${className}`}>
      {neg ? '−' : ''}{formatTHB(Math.abs(value))}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="card card-pad text-center text-sm text-ink-soft py-10">{children}</div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}
