/**
 * End-to-end logic tests over the exact code paths the UI calls
 * (data.materialize -> analytics -> budget -> io). Run: `npm test`.
 * Complements reconcile.ts (which is an independent oracle on the raw data).
 */
import { baseTransactions, materialize, makeId } from '@/lib/data';
import {
  toSpendingEvents, grandTotal, aggregateByGroup, aggregateByCategory,
  aggregateByMonth, defaultMonth, projectMonth, topMerchants,
  detectRecurring, detectOutliers, fixedVsVariable,
} from '@/lib/analytics';
import {
  suggestBudgets, categoryBudgetRows, monthSummary, cumulativeSavings, EMPTY_BUDGET,
} from '@/lib/budget';
import {
  parseImport, toCSV, splitPasted, parseDateLoose, parseAmountLoose, rowsFromMapping, dedupe,
} from '@/lib/io';
import { autoCategorize } from '@/lib/autocat';
import { categoryGroup } from '@/lib/categories';
import type { Transaction, BudgetState } from '@/lib/types';

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; fails.push(name); console.log(`  ✗ ${name}`); }
}
function eq(name: string, a: number, b: number, tol = 0.01) {
  ok(`${name} (got ${a.toFixed(2)}, want ${b.toFixed(2)})`, Math.abs(a - b) <= tol);
}

const base = baseTransactions();
const txns = materialize(base);

console.log('\n── data / materialize ──');
ok('635 base rows', base.length === 635);
ok('all ids unique', new Set(base.map((t) => t.id)).size === 635);
{
  const id = base.find((t) => t.merchant === 'Grab')!.id;
  const m = materialize(base, [], { categoryById: { [id]: 'คาเฟ่/ขนม' }, realIncomeById: {} }, {});
  const row = m.find((t) => t.id === id)!;
  ok('id override changes category', row.category === 'คาเฟ่/ขนม');
  ok('id override re-derives group', row.group === categoryGroup('คาเฟ่/ขนม'));
}
{
  // merchant rule recategorizes ALL rows of that merchant
  const m = materialize(base, [], { categoryById: {}, realIncomeById: {} }, { '7-Eleven': { merchant: '7-Eleven', category: 'คาเฟ่/ขนม' } });
  const sevens = m.filter((t) => t.merchant === '7-Eleven');
  ok('merchant rule hits all rows', sevens.length > 0 && sevens.every((t) => t.category === 'คาเฟ่/ขนม'));
}
{
  // per-id override beats merchant rule
  const id = base.find((t) => t.merchant === '7-Eleven')!.id;
  const m = materialize(base, [], { categoryById: { [id]: 'น้ำมัน/ปั๊ม' }, realIncomeById: {} }, { '7-Eleven': { merchant: '7-Eleven', category: 'คาเฟ่/ขนม' } });
  ok('id override beats merchant rule', m.find((t) => t.id === id)!.category === 'น้ำมัน/ปั๊ม');
}
{
  // transferKind attached from rule
  const m = materialize(base, [], { categoryById: {}, realIncomeById: {} }, { 'ปรารถนา': { merchant: 'ปรารถนา', transferKind: 'moving' } });
  ok('transferKind attached', m.some((t) => t.merchant === 'ปรารถนา' && t.transferKind === 'moving'));
}

console.log('\n── analytics ──');
eq('net total (incl transfer)', grandTotal(toSpendingEvents(txns)), 170575.98, 0.5);
{
  const g = aggregateByGroup(toSpendingEvents(txns));
  eq('essential', g.essential, 53663.27);
  eq('discretionary net', g.discretionary, 83651.45);
  eq('transfer', g.transfer, 33261.26);
}
{
  const travel = toSpendingEvents(txns).filter((e) => e.category === 'ที่พัก/ท่องเที่ยว').reduce((s, e) => s + e.signed, 0);
  eq('travel net (refund-routed)', travel, 9894.27, 0.5);
}
{
  const months = aggregateByMonth(txns);
  ok('defaultMonth = 2026-05', defaultMonth(months) === '2026-05');
  ok('Feb flagged incomplete', months.find((m) => m.month === '2026-02')!.incomplete);
  ok('June flagged incomplete', months.find((m) => m.month === '2026-06')!.incomplete);
}
ok('projection June unreliable', projectMonth(txns, '2026-06').reliable === false);
ok('projection June projected=null', projectMonth(txns, '2026-06').projected === null);
ok('projection May reliable', projectMonth(txns, '2026-05').reliable === true);
{
  const top = topMerchants(txns, { limit: 5 });
  ok('top merchant = Grab', top[0].merchant === 'Grab');
  ok('top excludes transfer (no ปรารถนา)', !top.some((m) => m.merchant === 'ปรารถนา'));
}
{
  const tagged = txns.map((t) => (t.merchant === 'ปรารถนา' && t.group === 'transfer' ? { ...t, transferKind: 'moving' as const } : t));
  const before = grandTotal(toSpendingEvents(tagged));
  const after = grandTotal(toSpendingEvents(tagged, { excludeMovingTransfers: true }));
  eq('excludeMoving removes ปรารถนา', before - after, 5813.25, 0.5);
}
{
  const before = grandTotal(toSpendingEvents(txns));
  const after = grandTotal(toSpendingEvents(txns, { excludeOneOff: true }));
  ok('excludeOneOff removes travel+hospital', before - after > 20000);
}
ok('recurring detects AUD/Grab', detectRecurring(txns).some((r) => r.category.includes('AUD') || r.merchant === 'Grab'));
ok('outliers found', detectOutliers(txns).length > 0);
{
  const fv = fixedVsVariable(txns);
  ok('fixedVsVariable positive', fv.fixed > 0 && fv.variable > 0);
}

console.log('\n── budget ──');
{
  const sug = suggestBudgets(txns);
  ok('suggestBudgets non-empty', Object.keys(sug).length > 0);
  ok('suggestBudgets rounded to 100', Object.values(sug).every((v) => v % 100 === 0));
}
{
  const state: BudgetState = { byMonth: { '2026-05': { 'อาหาร/ร้านอาหาร': 5000 } }, income: { '2026-05': 50000 }, ceiling: {} };
  const rows = categoryBudgetRows(txns, state, '2026-05');
  const food = rows.find((r) => r.category === 'อาหาร/ร้านอาหาร');
  ok('budget row has actual', !!food && food.actual > 0);
  const sum = monthSummary(txns, state, '2026-05');
  eq('savings = income - actual', sum.savings, 50000 - sum.totalActual, 0.5);
  ok('savingsRate sensible', sum.savingsRate < 1 && sum.savingsRate !== 0);
}
{
  const state: BudgetState = { byMonth: {}, income: { '2026-04': 60000, '2026-05': 50000 }, ceiling: {}, savingsGoal: 30000 };
  const cs = cumulativeSavings(txns, state);
  ok('savings counts only income months', cs.points.length === 2);
  const expected = cs.points.reduce((s, p) => s + p.net, 0);
  eq('totalSaved = sum of nets', cs.totalSaved, expected, 0.5);
  ok('last cumulative = totalSaved', Math.abs(cs.points[cs.points.length - 1].cumulative - cs.totalSaved) < 0.5);
}

console.log('\n── import / export (io) ──');
{
  const jsonText = JSON.stringify(base.map(({ id, ...r }) => r));
  const res = parseImport(jsonText, txns);
  ok('re-import all -> 0 added', res.added.length === 0);
  ok('re-import all -> all duplicates', res.duplicates === 635);
  ok('overlap warned on re-import', res.overlaps.length > 0);
}
{
  const novel = [{ date: '2026-07-01', time: '', account: 'UOB บัตรเครดิต', direction: 'out', amount: 99, category: 'คาเฟ่/ขนม', group: 'discretionary', merchant: 'NEWCAFE', desc: 'NEW ROW' }];
  const res = parseImport(JSON.stringify(novel), txns);
  ok('novel row imported', res.added.length === 1 && res.duplicates === 0);
}
{
  // two identical NEW rows must BOTH be kept (genuine same-key repeat)
  const r = { date: '2026-07-02', time: '', account: 'UOB บัตรเครดิต', direction: 'out', amount: 50, category: 'อาหาร/ร้านอาหาร', group: 'discretionary', merchant: 'X', desc: 'DUP' };
  const res = parseImport(JSON.stringify([r, r]), txns);
  ok('genuine same-key repeats both kept', res.added.length === 2);
  ok('repeats get distinct ids', new Set(res.added.map((t) => t.id)).size === 2);
}
{
  const csv = toCSV(base.slice(0, 10) as Transaction[]);
  const back = parseImport(csv, []);
  ok('CSV roundtrip parses 10 rows', back.added.length === 10);
}

console.log('\n── autocat & pasted import ──');
ok('autocat: Grab', autoCategorize('Grab', 'WWW.GRAB.COM') === 'Grab/เดลิเวอรี่/แท็กซี่');
ok('autocat: 7-Eleven', autoCategorize('7-Eleven', 'TMN 7-11') === 'ร้านสะดวกซื้อ');
ok('autocat: Shell -> fuel', autoCategorize('Shell', '') === 'น้ำมัน/ปั๊ม');
ok('autocat: unknown -> fallback', autoCategorize('ZZZ', 'qqq') === 'ค่าใช้จ่ายอื่น');
ok('autocat: rule beats keyword', autoCategorize('Grab', '', { Grab: { merchant: 'Grab', category: 'คาเฟ่/ขนม' } }) === 'คาเฟ่/ขนม');
ok('parseDateLoose ISO', parseDateLoose('2026-06-10') === '2026-06-10');
ok('parseDateLoose DD/MM/YYYY', parseDateLoose('10/06/2026') === '2026-06-10');
ok('parseDateLoose Buddhist year', parseDateLoose('10/06/2569') === '2026-06-10');
ok('parseAmountLoose strips ฿/commas', parseAmountLoose('฿1,234.50').value === 1234.5);
ok('parseAmountLoose detects negative', parseAmountLoose('-120').negative === true);
{
  const grid = splitPasted('2026-06-10, 120, Grab, ค่าเดินทาง\n2026-06-11, 89, 7-Eleven, ของใช้');
  ok('splitPasted rows/cols', grid.length === 2 && grid[0].length === 4);
  const raws = rowsFromMapping(grid, { date: 0, amount: 1, merchant: 2, desc: 3, account: 'KBank ออมทรัพย์', directionMode: 'out' },
    (m, d) => autoCategorize(m, d));
  ok('rowsFromMapping builds 2 rows', raws.length === 2);
  ok('rowsFromMapping auto-categorizes', raws[0].category === 'Grab/เดลิเวอรี่/แท็กซี่');
  const res = dedupe(raws, []);
  ok('dedupe adds new pasted rows', res.added.length === 2);
}
{
  // sign mode: negative -> out, positive -> in
  const grid = splitPasted('2026-06-10\t-50\tA\n2026-06-10\t50\tB');
  const raws = rowsFromMapping(grid, { date: 0, amount: 1, merchant: 2, desc: null, account: 'x', directionMode: 'sign' }, () => 'ค่าใช้จ่ายอื่น');
  ok('sign mode: negative=out', raws[0].direction === 'out');
  ok('sign mode: positive=in', raws[1].direction === 'in');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
if (fail) { console.error('FAILED:', fails.join(' | ')); process.exit(1); }
