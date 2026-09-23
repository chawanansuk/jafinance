'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Info, CheckCircle2, ChevronDown, type LucideIcon } from 'lucide-react';
import { formatTHB, formatDelta } from '@/lib/format';
import { GROUP_LABEL, GROUP_COLOR, CATEGORIES, categoryMeta } from '@/lib/categories';
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
    // V2: one card treatment. The tinted gradient ground and the coloured top
    // rule are gone — `accent` now only tints the icon, where it still helps
    // you find a card by sight. The prop stays so callers don't change.
    <div className="card card-pad card-hover">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-ink-soft">{label}</span>
        {Icon && (
          <span className="grid place-items-center h-7 w-7 rounded-sm shrink-0"
            style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}>
            <Icon size={15} aria-hidden />
          </span>
        )}
      </div>
      <div className={`mt-2 text-h1 font-bold tnum ${
        tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-error' : ''
      }`}>{value}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-caption text-ink-soft min-w-0">
          {d && d.dir !== 'flat' && (
            <span className={`inline-flex items-center gap-0.5 font-semibold ${
              d.dir === 'up' ? 'text-error' : 'text-success'
            }`}>
              {d.dir === 'up' ? <TrendingUp size={13} aria-hidden /> : <TrendingDown size={13} aria-hidden />}
              {d.text}
            </span>
          )}
          {sub && <span className="truncate tnum">{sub}</span>}
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
  // V2: flat semantic fills. These were the last three gradients left after
  // the V2 pass removed the rest, and hard-coded hex, so dark mode never
  // got its own steps.
  const fill = tone === 'over' || over ? 'bg-error' : tone === 'warn' ? 'bg-warning' : 'bg-success';
  return (
    <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
      <div className={`h-full rounded-full transition-[width] duration-500 ${fill}`} style={{ width: `${pct}%` }} />
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
    <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
      <span className="grid place-items-center rounded-lg shrink-0"
        style={{ background: meta.color + '22', color: meta.color, width: size + 12, height: size + 12 }}>
        <Icon size={size} />
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

const CAT_NAMES = CATEGORIES.map((c) => c.name);

/**
 * A category picker that reads as a chip, not a form control. Still a native
 * <select> — same keyboard, same screen-reader behaviour, the OS picker on a
 * phone — laid invisibly over the chip. One component for the transactions
 * table and both import previews, which had carried copies of a plain 12px
 * select with the same options.
 *
 * The invisible select is text-body-lg (16px) on purpose: its size is never
 * seen, but iOS Safari reads it and zooms the page on focus below 16px.
 */
export function CategorySelect({ value, onChange, label = 'เปลี่ยนหมวด' }: {
  value: string; onChange: (v: string) => void; label?: string;
}) {
  const color = categoryMeta(value).color;
  return (
    <span className="relative inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 max-w-full"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-caption truncate">{value}</span>
      <ChevronDown size={12} className="text-ink-soft shrink-0" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-body-lg"
      >
        {!CAT_NAMES.includes(value) && <option value={value}>{value}</option>}
        {CAT_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    // V2: the decorative brand bar that preceded every card title is gone —
    // hierarchy comes from the type ramp, not from an ornament.
    <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
      <h2 className="card-title">{children}</h2>
      {action}
    </div>
  );
}

export function IncompleteBadge({ label = 'ข้อมูลไม่ครบ' }: { label?: string }) {
  return (
    <span className="pill bg-warning/12 text-warning">
      <AlertTriangle size={12} aria-hidden /> {label}
    </span>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'success' }) {
  // V2: the icon follows the tone. An informational note used to carry a
  // warning triangle, which reads as "something is wrong" when nothing is.
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info;
  const skin =
    tone === 'warn' ? 'bg-warning/10 text-warning'
    : tone === 'success' ? 'bg-success/10 text-success'
    : 'bg-brand/10 text-success';
  return (
    <div className={`rounded-md px-4 py-3 text-body-sm flex gap-2.5 items-start ${skin}`}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * A value the app cannot compute yet. V2 replaces the bare "—" that used to
 * fill these slots: a dash cannot tell you whether the number is zero, still
 * loading, or waiting on something you have to type. This says which.
 */
export function Pending({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-body font-normal text-ink-soft">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-soft/40" />
      {children}
    </span>
  );
}

/**
 * Animated numeral: eases from the previous value to the new one (~650ms,
 * cubic ease-out). First render is static (no zero-flash) and the whole thing
 * degrades to instant text under prefers-reduced-motion. tnum keeps the width
 * stable while digits roll.
 */
export function CountUp({
  value, format = (n: number) => String(Math.round(n)), className = '',
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const targetRef = useRef(value);

  useEffect(() => {
    if (targetRef.current === value) return;
    targetRef.current = value;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    const from = displayRef.current; // continue from wherever the digits are
    const t0 = performance.now();
    const dur = 650;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (value - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={`tnum ${className}`}>{format(display)}</span>;
}

export function Money({ value, className = '' }: { value: number; className?: string }) {
  const neg = value < 0;
  return (
    <span className={`tnum ${neg ? 'text-success' : ''} ${className}`}>
      {neg ? '−' : ''}{formatTHB(Math.abs(value))}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="card card-pad text-center text-body-sm text-ink-soft py-10">{children}</div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

/**
 * Shared modal: dialog semantics, Escape-to-close, a tab trap, body scroll
 * lock, and focus restore — the four hand-rolled overlays lacked all of it,
 * so keyboard users could tab into the page behind and Esc did nothing.
 * Backdrop click calls onClose; put any discard-confirm inside onClose.
 */
export function Modal({
  open, onClose, children, labelledBy, maxW = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  maxW?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // the keydown listener below is bound once per open — a plain closure would
  // freeze onClose (and everything it closes over) at open time
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // respect a child's autoFocus (QuickAdd's amount field) — only take focus
    // if nothing inside the panel already has it
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const focusables = nodes
        ? [...nodes].filter((el) => !el.hasAttribute('disabled') && !el.hidden && el.getClientRects().length > 0)
        : [];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    // close on backdrop only when the PRESS also started there — a text-drag
    // that starts inside the panel and releases over the dim fires a click on
    // the overlay and used to nuke the sheet (SmartImport paste, QuickAdd form)
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onMouseDown={(e) => {
        (e.currentTarget as HTMLElement).dataset.pressStart = e.target === e.currentTarget ? '1' : '0';
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && (e.currentTarget as HTMLElement).dataset.pressStart === '1') onClose();
      }}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`card w-full ${maxW} rounded-b-none sm:rounded-2xl max-h-[92dvh] overflow-y-auto outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
