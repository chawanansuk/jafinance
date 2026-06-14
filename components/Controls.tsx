'use client';

import { formatMonth } from '@/lib/format';

export function MonthSelect({
  months, value, onChange,
}: { months: string[]; value: string; onChange: (m: string) => void }) {
  return (
    <select className="input !w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      {months.map((m) => (
        <option key={m} value={m}>{formatMonth(m, true)}</option>
      ))}
    </select>
  );
}

export type AccountFilter = 'all' | 'KBank ออมทรัพย์' | 'UOB บัตรเครดิต';

export function AccountToggle({
  value, onChange,
}: { value: AccountFilter; onChange: (v: AccountFilter) => void }) {
  const opts: { v: AccountFilter; label: string }[] = [
    { v: 'all', label: 'ทุกบัญชี' },
    { v: 'KBank ออมทรัพย์', label: 'KBank' },
    { v: 'UOB บัตรเครดิต', label: 'UOB' },
  ];
  return (
    <div className="inline-flex rounded-xl bg-surface-2 p-1">
      {opts.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`seg ${value === o.v ? 'seg-on' : 'seg-off'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`seg ${value === o.v ? 'seg-on' : 'seg-off'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
