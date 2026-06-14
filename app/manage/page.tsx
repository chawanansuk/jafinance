'use client';

import { useMemo, useRef, useState } from 'react';
import { Trash2, Plus, ArrowRightLeft, Wand2, Info, Download, Upload, RotateCcw, Eraser } from 'lucide-react';
import { useData } from '@/components/DataProvider';
import { SectionTitle, CategoryChip, Money, Skeleton, Notice } from '@/components/ui';
import { Segmented } from '@/components/Controls';
import { CATEGORIES } from '@/lib/categories';
import { downloadFile } from '@/lib/io';
import { formatTHB } from '@/lib/format';
import type { TransferKind } from '@/lib/types';

const BACKUP_VERSION = 1;

const CAT_NAMES = CATEGORIES.map((c) => c.name);

const KIND_LABEL: Record<TransferKind, string> = {
  unknown: 'ยังไม่ตรวจ',
  spending: 'รายจ่ายจริง',
  moving: 'ย้ายเงิน',
  supplier: 'ซัพพลายเออร์',
};

export default function ManagePage() {
  const {
    txns, rules, setRule, hydrated,
    overrides, setOverrides, budget, setBudget, setRulesAll, settings, setSettings, imported, setImported, resetAll, dedupeImported,
  } = useData();
  const [addMerchant, setAddMerchant] = useState('');
  const [addCat, setAddCat] = useState(CAT_NAMES[0]);
  const [backupMsg, setBackupMsg] = useState('');
  const backupRef = useRef<HTMLInputElement>(null);

  const exportBackup = () => {
    const payload = { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), overrides, budget, rules, settings, imported };
    downloadFile('jafinance-backup.json', JSON.stringify(payload, null, 2), 'application/json');
  };

  const restoreBackup = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (data.overrides) setOverrides(data.overrides);
      if (data.budget) setBudget(data.budget);
      if (data.rules) setRulesAll(data.rules);
      if (data.settings) setSettings(data.settings);
      if (Array.isArray(data.imported)) setImported(data.imported);
      setBackupMsg('กู้คืนข้อมูลสำเร็จ');
    } catch {
      setBackupMsg('กู้คืนไม่สำเร็จ: ไฟล์ต้องเป็น backup JSON ของแอพนี้');
    }
  };

  // transfer-group merchants, biggest first
  const transferMerchants = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const t of txns) {
      if (t.direction !== 'out' || t.group !== 'transfer') continue;
      const m = map.get(t.merchant) ?? { total: 0, count: 0 };
      m.total += t.amount; m.count += 1; map.set(t.merchant, m);
    }
    return [...map.entries()].map(([merchant, v]) => ({ merchant, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [txns]);

  const kindTotals = useMemo(() => {
    const out: Record<TransferKind, number> = { unknown: 0, spending: 0, moving: 0, supplier: 0 };
    for (const m of transferMerchants) {
      const kind = (rules[m.merchant]?.transferKind ?? 'unknown') as TransferKind;
      out[kind] += m.total;
    }
    return out;
  }, [transferMerchants, rules]);

  const activeRules = useMemo(() => Object.values(rules), [rules]);

  const merchantOptions = useMemo(
    () => [...new Set(txns.map((t) => t.merchant).filter(Boolean))].sort(),
    [txns],
  );

  if (!hydrated) return <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">จัดการ & กฎ</h1>

      {/* backup / restore / reset */}
      <div className="card card-pad">
        <SectionTitle>สำรอง & กู้คืนข้อมูล</SectionTitle>
        <p className="text-xs text-ink-soft mb-3">สำรองงบ + กฎ + การแก้หมวด + รายการที่ import ทั้งหมดเป็นไฟล์เดียว (เก็บในเครื่อง)</p>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={exportBackup} className="btn-ghost !py-1.5 !px-3 text-sm"><Download size={14} /> ส่งออกสำรอง</button>
          <input ref={backupRef} type="file" accept=".json,application/json" hidden
            onChange={(e) => e.target.files?.[0] && restoreBackup(e.target.files[0])} />
          <button onClick={() => backupRef.current?.click()} className="btn-ghost !py-1.5 !px-3 text-sm"><Upload size={14} /> กู้คืน</button>
          <button
            onClick={() => { const n = dedupeImported(); setBackupMsg(n > 0 ? `ลบรายการซ้ำ ${n} รายการแล้ว` : 'ไม่พบรายการซ้ำกับข้อมูลเดิม'); }}
            className="btn-ghost !py-1.5 !px-3 text-sm"><Eraser size={14} /> ลบรายการซ้ำที่นำเข้า</button>
          <button
            onClick={() => { if (confirm('ล้างงบ/กฎ/การแก้หมวด/รายการที่ import ทั้งหมด? (ข้อมูลธุรกรรมต้นฉบับไม่หาย)')) { resetAll(); setBackupMsg('ล้างการตั้งค่าทั้งหมดแล้ว'); } }}
            className="btn-ghost !py-1.5 !px-3 text-sm text-rose-500"><RotateCcw size={14} /> รีเซ็ตทั้งหมด</button>
          {backupMsg && <span className="text-xs text-ink-soft">{backupMsg}</span>}
        </div>
      </div>

      {/* transfer review */}
      <div className="card card-pad">
        <SectionTitle action={<ArrowRightLeft size={16} className="text-ink-soft" />}>
          ตรวจสอบการโอน/ถอน (transfer)
        </SectionTitle>
        <Notice>
          รายการกลุ่มนี้ยังไม่รู้ว่าเป็นรายจ่ายจริงหรือย้ายเงิน ติ๊กจัดประเภทแล้วระบบจะ<b>จำตามร้าน</b>
          และนำไปใช้กับรายการ/ข้อมูลที่ import ในอนาคตอัตโนมัติ
        </Notice>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-4">
          {(['unknown', 'spending', 'moving', 'supplier'] as TransferKind[]).map((k) => (
            <div key={k} className="rounded-xl bg-surface-2 px-3 py-2">
              <div className="text-xs text-ink-soft">{KIND_LABEL[k]}</div>
              <div className="font-bold tnum">{formatTHB(kindTotals[k])}</div>
            </div>
          ))}
        </div>
        {kindTotals.moving > 0 && (
          <p className="text-xs text-ink-soft mb-3 flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" />
            “ย้ายเงิน” {formatTHB(kindTotals.moving)} จะถูกตัดออกจากรายจ่ายเมื่อเปิดสวิตช์ในหน้าภาพรวม/งบประมาณ
          </p>
        )}

        <ul className="divide-y divide-line/60">
          {transferMerchants.map((m) => {
            const kind = (rules[m.merchant]?.transferKind ?? 'unknown') as TransferKind;
            return (
              <li key={m.merchant} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{m.merchant || '—'}</div>
                  <div className="text-xs text-ink-soft tnum">{m.count}× · <Money value={m.total} /></div>
                </div>
                <Segmented<TransferKind>
                  value={kind}
                  onChange={(v) => setRule(m.merchant, { transferKind: v })}
                  options={[
                    { v: 'unknown', label: '?' },
                    { v: 'spending', label: 'จ่ายจริง' },
                    { v: 'moving', label: 'ย้ายเงิน' },
                    { v: 'supplier', label: 'ซัพพ.' },
                  ]}
                />
              </li>
            );
          })}
          {transferMerchants.length === 0 && <li className="py-6 text-center text-sm text-ink-soft">ไม่มีรายการกลุ่มโอน</li>}
        </ul>
      </div>

      {/* merchant rules */}
      <div className="card card-pad">
        <SectionTitle action={<Wand2 size={16} className="text-ink-soft" />}>กฎจัดหมวดตามร้าน</SectionTitle>
        <p className="text-xs text-ink-soft mb-3">ตั้งกฎ “ร้าน → หมวด” ใช้กับทุกรายการของร้านนั้น (รวมข้อมูลที่ import เข้ามาใหม่)</p>

        <div className="flex flex-wrap gap-2 items-center mb-4">
          <input list="merchant-list" className="input !w-48 !py-1.5 text-sm" placeholder="ชื่อร้าน"
            value={addMerchant} onChange={(e) => setAddMerchant(e.target.value)} />
          <datalist id="merchant-list">
            {merchantOptions.slice(0, 200).map((m) => <option key={m} value={m} />)}
          </datalist>
          <span className="text-sm text-ink-soft">→</span>
          <select className="input !w-auto !py-1.5 text-sm" value={addCat} onChange={(e) => setAddCat(e.target.value)}>
            {CAT_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            className="btn-primary !py-1.5 !px-3 text-sm"
            disabled={!addMerchant.trim()}
            onClick={() => { setRule(addMerchant.trim(), { category: addCat }); setAddMerchant(''); }}
          ><Plus size={14} /> เพิ่มกฎ</button>
        </div>

        <ul className="divide-y divide-line/60">
          {activeRules.map((r) => (
            <li key={r.merchant} className="py-2.5 flex items-center gap-3 text-sm">
              <span className="font-medium truncate max-w-[40%]">{r.merchant}</span>
              <span className="text-ink-soft">→</span>
              <span className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                {r.category && <CategoryChip name={r.category} size={14} />}
                {r.transferKind && r.transferKind !== 'unknown' && (
                  <span className="pill bg-surface-2 text-ink-soft">{KIND_LABEL[r.transferKind]}</span>
                )}
              </span>
              <button onClick={() => setRule(r.merchant, null)} className="btn-ghost !px-2 !py-1.5" aria-label="ลบกฎ">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
          {activeRules.length === 0 && <li className="py-6 text-center text-sm text-ink-soft">ยังไม่มีกฎ</li>}
        </ul>
      </div>
    </div>
  );
}
