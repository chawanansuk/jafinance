'use client';

import { useState } from 'react';
import { FileText, ChevronDown, Trash2, Check, AlertTriangle } from 'lucide-react';
import { useData } from './DataProvider';
import { categoryColor } from '@/lib/categories';
import { formatTHB, formatDate, formatMonth } from '@/lib/format';
import type { Statement } from '@/lib/types';

function BillRow({ s, onRemove }: { s: Statement; onRemove: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line/60 last:border-0">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
        <span className="grid place-items-center h-9 w-9 rounded-xl text-white shrink-0" style={{ background: '#0d9488' }}><FileText size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">
            บิล {s.statementDate ? formatMonth(s.statementDate.slice(0, 7)) : '—'}
            <span className="text-ink-soft font-normal"> · {s.account.startsWith('5271') || s.account.includes('XX') ? 'UOB' : s.account}</span>
          </div>
          <div className="text-xs text-ink-soft">
            {s.count} รายการ · {s.dateFrom ? `${formatDate(s.dateFrom)}–${formatDate(s.dateTo)}` : ''}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold tnum text-rose-500">{s.totalBalance != null ? formatTHB(s.totalBalance) : formatTHB(s.purchases)}</div>
          <div className={`text-[11px] inline-flex items-center gap-0.5 ${s.reconciled ? 'text-emerald-500' : 'text-amber-500'}`}>
            {s.reconciled ? <><Check size={11} /> ตรงสลิป</> : <><AlertTriangle size={11} /> ต่าง {s.totalBalance != null ? formatTHB(Math.abs(s.parsedNet - (s.totalBalance ?? 0))) : ''}</>}
          </div>
        </div>
        <ChevronDown size={16} className={`text-ink-soft transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1.5">
          {s.byCategory.map((c) => (
            <div key={c.category}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 min-w-0"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: categoryColor(c.category) }} /><span className="truncate">{c.category}</span></span>
                <span className="tnum font-medium shrink-0">{formatTHB(c.total)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1">
                <div className="h-full rounded-full" style={{ width: `${s.purchases ? Math.max(2, (c.total / s.purchases) * 100) : 0}%`, background: categoryColor(c.category) }} />
              </div>
            </div>
          ))}
          {s.refunds > 0 && <p className="text-xs text-emerald-600 pt-1">เงินคืนในบิล {formatTHB(s.refunds)}</p>}
          <div className="flex items-center justify-between pt-1.5 text-xs text-ink-soft">
            <span>ขั้นต่ำ {s.minPayment != null ? formatTHB(s.minPayment) : '—'}</span>
            <button onClick={() => onRemove(s.id)} className="inline-flex items-center gap-1 text-rose-500 hover:underline"><Trash2 size={12} /> ลบสรุป</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BillsPanel() {
  const { statements, removeStatement, hydrated } = useData();
  const [show, setShow] = useState(false);
  if (!hydrated || statements.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setShow((v) => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-surface-2">
        <FileText size={16} /> บิลที่นำเข้า ({statements.length})
        <ChevronDown size={16} className={`ml-auto text-ink-soft transition-transform ${show ? 'rotate-180' : ''}`} />
      </button>
      {show && <div className="border-t border-line">{statements.map((s) => <BillRow key={s.id} s={s} onRemove={removeStatement} />)}</div>}
    </div>
  );
}
