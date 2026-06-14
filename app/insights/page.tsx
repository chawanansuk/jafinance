'use client';

import { useMemo } from 'react';
import { TrendingUp, Repeat, AlertCircle, Store, Plane, Calendar } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { SectionTitle, CategoryChip, Money, Skeleton } from '@/components/ui';
import {
  detectRecurring, detectOutliers, topMerchants, toSpendingEvents, fixedVsVariable,
} from '@/lib/analytics';
import { formatDate, formatMonth, formatTHB } from '@/lib/format';

const BIG_CATEGORIES = ['ที่พัก/ท่องเที่ยว', 'โรงพยาบาล/สุขภาพ'];

function InsightCard({ icon: Icon, title, children, accent = '#635bff' }: any) {
  return (
    <div className="card card-pad card-hover relative overflow-hidden"
      style={{ background: `linear-gradient(165deg, color-mix(in srgb, ${accent} 8%, rgb(var(--surface))), rgb(var(--surface)) 65%)` }}>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="grid place-items-center h-9 w-9 rounded-xl text-white shadow-sm shrink-0" style={{ background: accent }}><Icon size={18} /></span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function InsightsPage() {
  const { txns, months, defaultMonth, hydrated } = useData();
  const cur = defaultMonth || months[months.length - 1] || '';
  const prev = months[months.indexOf(cur) - 1];

  const growth = useMemo(() => {
    if (!prev) return [];
    const ev = toSpendingEvents(txns);
    const sum = (m: string) => {
      const map = new Map<string, number>();
      for (const e of ev) if (e.month === m) map.set(e.category, (map.get(e.category) ?? 0) + e.signed);
      return map;
    };
    const a = sum(prev), b = sum(cur);
    const out: { category: string; from: number; to: number; pct: number }[] = [];
    for (const [category, to] of b) {
      const fromV = a.get(category) ?? 0;
      if (to < 300) continue;
      const pct = fromV > 0 ? (to - fromV) / fromV : to > 0 ? 1 : 0;
      out.push({ category, from: fromV, to, pct });
    }
    return out.sort((x, y) => y.pct - x.pct).slice(0, 4);
  }, [txns, cur, prev]);

  const merchants = useMemo(() => topMerchants(txns, { limit: 5 }), [txns]);
  const recurring = useMemo(() => detectRecurring(txns).filter((r) => r.cadence !== 'ไม่แน่นอน').slice(0, 6), [txns]);
  const outliers = useMemo(() => detectOutliers(txns).slice(0, 5), [txns]);
  const fv = useMemo(() => fixedVsVariable(txns), [txns]);
  const fvTotal = fv.fixed + fv.variable;

  const bigItems = useMemo(() => {
    const list = txns
      .filter((t) => t.direction === 'out' && BIG_CATEGORIES.includes(t.category))
      .sort((a, b) => b.amount - a.amount);
    const total = list.reduce((s, t) => s + t.amount, 0);
    return { list: list.slice(0, 6), total };
  }, [txns]);

  if (!hydrated) return <div className="grid sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">อินไซต์อัตโนมัติ</h1>

      <div className="grid lg:grid-cols-2 gap-4">
        <InsightCard accent="#f43f5e" icon={TrendingUp} title={`หมวดที่โตเร็วสุด (เทียบ ${prev ? formatMonth(prev) : '—'})`}>
          {growth.length ? (
            <ul className="space-y-2.5">
              {growth.map((g) => (
                <li key={g.category} className="flex items-center gap-3">
                  <CategoryChip name={g.category} />
                  <span className="ml-auto text-right">
                    <span className={`font-semibold ${g.pct >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {g.pct >= 0 ? '+' : ''}{Math.round(g.pct * 100)}%
                    </span>
                    <div className="text-xs text-ink-soft tnum">{formatTHB(g.from)} → {formatTHB(g.to)}</div>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft">ต้องมีอย่างน้อย 2 เดือนเพื่อเทียบ</p>}
        </InsightCard>

        <InsightCard accent="#0ea5e9" icon={Store} title="ร้านที่จ่ายบ่อย/เยอะสุด">
          <ul className="space-y-2.5">
            {merchants.map((m, i) => (
              <li key={m.merchant} className="flex items-center gap-3">
                <span className="text-ink-soft w-5 tnum">{i + 1}.</span>
                <span className="truncate">{m.merchant}</span>
                <span className="ml-auto text-right shrink-0">
                  <div className="font-semibold tnum"><Money value={m.total} /></div>
                  <div className="text-xs text-ink-soft">{m.count} ครั้ง</div>
                </span>
              </li>
            ))}
          </ul>
        </InsightCard>

        <InsightCard accent="#8b5cf6" icon={Repeat} title="ค่าใช้จ่ายที่เกิดซ้ำ (recurring)">
          {recurring.length ? (
            <ul className="space-y-2.5">
              {recurring.map((r) => (
                <li key={r.merchant + r.category} className="flex items-center gap-3 text-sm">
                  <span className="truncate">
                    <b>{r.merchant}</b>
                    <span className="text-ink-soft"> · {r.cadence}</span>
                  </span>
                  <span className="ml-auto text-right shrink-0">
                    <div className="font-semibold tnum"><Money value={r.total} /></div>
                    <div className="text-xs text-ink-soft">{r.count}× · เฉลี่ย {formatTHB(r.avgAmount)}</div>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft">ยังตรวจไม่พบรายการที่เกิดซ้ำสม่ำเสมอ</p>}
        </InsightCard>

        <InsightCard accent="#f59e0b" icon={AlertCircle} title="วันที่ใช้จ่ายผิดปกติ (outliers)">
          {outliers.length ? (
            <ul className="space-y-2.5">
              {outliers.map((o) => (
                <li key={o.date} className="flex items-center gap-3 text-sm">
                  <Calendar size={15} className="text-ink-soft" />
                  <span>{formatDate(o.date, true)}</span>
                  <span className="text-ink-soft truncate">· {o.topMerchant}</span>
                  <span className="ml-auto font-semibold tnum shrink-0"><Money value={o.total} /></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-soft">ไม่มีวันที่ผิดปกติชัดเจน</p>}
        </InsightCard>
      </div>

      <InsightCard accent="#10b981" icon={Repeat} title="ค่าใช้จ่ายคงที่ vs แปรผัน (ต่อเดือน)">
        <p className="text-sm text-ink-soft mb-3">ประเมินจากเดือนข้อมูลครบ — “คงที่” = รายการที่เกิดซ้ำสม่ำเสมอ</p>
        <div className="flex h-3 rounded-full overflow-hidden bg-surface-2 mb-2">
          <div className="bg-indigo-500" style={{ width: `${fvTotal > 0 ? (fv.fixed / fvTotal) * 100 : 0}%` }} />
          <div className="bg-sky-400" style={{ width: `${fvTotal > 0 ? (fv.variable / fvTotal) * 100 : 0}%` }} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-indigo-500 inline-block" /> คงที่ <b className="tnum">{formatTHB(fv.fixed)}</b>/เดือน</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-sky-400 inline-block" /> แปรผัน <b className="tnum">{formatTHB(fv.variable)}</b>/เดือน</span>
        </div>
      </InsightCard>

      <InsightCard accent="#ec4899" icon={Plane} title="รายจ่ายก้อนใหญ่/ไม่ประจำ">
        <p className="text-sm text-ink-soft mb-3">
          ที่พัก/ท่องเที่ยว + โรงพยาบาล รวม <b className="text-ink tnum">{formatTHB(bigItems.total)}</b> —
          แยกออกจากค่าใช้จ่ายประจำเพื่อให้วางแผน burn-rate ปกติได้แม่นขึ้น
        </p>
        <ul className="divide-y divide-line/60">
          {bigItems.list.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2 text-sm gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{t.merchant || t.desc}</div>
                <div className="text-xs text-ink-soft">{formatDate(t.date, true)} · {t.category}</div>
              </div>
              <span className="font-semibold tnum shrink-0"><Money value={t.amount} /></span>
            </li>
          ))}
        </ul>
      </InsightCard>
    </div>
  );
}
