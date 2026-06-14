'use client';

import { useMemo } from 'react';
import { formatTHB, formatDate } from '@/lib/format';

const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/**
 * GitHub-style calendar heatmap of daily spending. Columns = weeks,
 * rows = weekday. Cell opacity scales with spend (capped at the 90th
 * percentile so a single huge day doesn't flatten everything).
 */
export function CalendarHeatmap({ data }: { data: { date: string; total: number }[] }) {
  const { weeks, cap, monthLabels } = useMemo(() => {
    if (data.length === 0) return { weeks: [] as { date: string; total: number }[][], cap: 1, monthLabels: [] as { col: number; label: string }[] };
    const byDate = new Map(data.map((d) => [d.date, d.total]));
    const totals = data.map((d) => d.total).filter((t) => t > 0).sort((a, b) => a - b);
    const cap = totals.length ? totals[Math.floor(totals.length * 0.9)] || totals[totals.length - 1] : 1;

    const parse = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
    const start = parse(data[0].date);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
    const end = parse(data[data.length - 1].date);

    const weeks: { date: string; total: number }[][] = [];
    const monthLabels: { col: number; label: string }[] = [];
    let cur = new Date(start);
    let col = 0;
    let lastMonth = -1;
    while (cur <= end) {
      const week: { date: string; total: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        week.push({ date: iso, total: byDate.get(iso) ?? -1 }); // -1 = no data
        if (cur.getDate() <= 7 && cur.getMonth() !== lastMonth) {
          lastMonth = cur.getMonth();
          monthLabels.push({ col, label: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][cur.getMonth()] });
        }
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
      col++;
    }
    return { weeks, cap, monthLabels };
  }, [data]);

  if (weeks.length === 0) return <p className="text-sm text-ink-soft">ไม่มีข้อมูล</p>;

  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="inline-flex flex-col gap-1 min-w-full">
        {/* month labels */}
        <div className="flex gap-1 pl-7 text-[10px] text-ink-soft h-3">
          {weeks.map((_, ci) => {
            const lbl = monthLabels.find((m) => m.col === ci);
            return <div key={ci} className="w-3.5 shrink-0">{lbl?.label ?? ''}</div>;
          })}
        </div>
        <div className="flex gap-1">
          {/* weekday labels */}
          <div className="flex flex-col gap-1 pr-1 text-[9px] text-ink-soft w-6">
            {DOW.map((d, i) => <div key={i} className="h-3.5 leading-[14px]">{i % 2 ? d : ''}</div>)}
          </div>
          {weeks.map((week, ci) => (
            <div key={ci} className="flex flex-col gap-1">
              {week.map((cell) => {
                const none = cell.total < 0;
                const intensity = none ? 0 : Math.min(1, cell.total / cap);
                return (
                  <div
                    key={cell.date}
                    title={none ? `${formatDate(cell.date)} — ไม่มีข้อมูล` : `${formatDate(cell.date)} · ${formatTHB(cell.total)}`}
                    className="h-3.5 w-3.5 rounded-[3px] shrink-0"
                    style={{
                      background: none
                        ? 'rgb(var(--surface-2))'
                        : `color-mix(in srgb, rgb(var(--brand)) ${12 + intensity * 88}%, rgb(var(--surface-2)))`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-ink-soft pl-7 pt-1">
          น้อย
          {[0.12, 0.4, 0.7, 1].map((v, i) => (
            <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: `color-mix(in srgb, rgb(var(--brand)) ${v * 100}%, rgb(var(--surface-2)))` }} />
          ))}
          มาก
        </div>
      </div>
    </div>
  );
}
