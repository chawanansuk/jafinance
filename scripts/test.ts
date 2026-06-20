/**
 * End-to-end logic tests over the exact code paths the UI calls
 * (data.materialize -> analytics -> budget -> io). Run: `npm test`.
 * Complements reconcile.ts (which is an independent oracle on the raw data).
 */
import { baseTransactions, materialize, makeId, dropBaseDuplicates } from '@/lib/data';
import {
  toSpendingEvents, grandTotal, aggregateByGroup, aggregateByCategory,
  aggregateByMonth, defaultMonth, projectMonth, topMerchants,
  detectRecurring, detectOutliers, fixedVsVariable, dailySpending, avgMonthlyByCategory,
} from '@/lib/analytics';
import {
  suggestBudgets, categoryBudgetRows, monthSummary, cumulativeSavings, EMPTY_BUDGET,
} from '@/lib/budget';
import {
  parseImport, toCSV, splitPasted, parseDateLoose, parseAmountLoose, rowsFromMapping, dedupe,
} from '@/lib/io';
import { autoCategorize, refineCategory } from '@/lib/autocat';
import { parseUobStatement, summarizeBill } from '@/lib/pdf/uob';
import { parseKbankStatement } from '@/lib/pdf/kbank';
import { detectBank, parseStatement } from '@/lib/pdf/statement';
import { parseReceiptText } from '@/lib/ocr/receipt';
import { adaptiveThreshold } from '@/lib/ocr/extract';
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
ok('656 base rows', base.length === 656);
ok('all ids unique', new Set(base.map((t) => t.id)).size === 656);
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
{
  // regression: a manually-added essential row must keep its essential group
  // (Quick-add must set group from category; materialize trusts it when the
  // category is unchanged, so a wrong group would silently persist).
  ok('categoryGroup essential mapping', categoryGroup('ร้านสะดวกซื้อ') === 'essential' && categoryGroup('น้ำมัน/ปั๊ม') === 'essential');
  const added = { date: '2026-07-01', time: '', account: 'KBank ออมทรัพย์', direction: 'out' as const,
    amount: 50, category: 'ร้านสะดวกซื้อ', group: categoryGroup('ร้านสะดวกซื้อ'), merchant: '7-Eleven', desc: '', id: 'qa1' };
  const m = materialize(base, [added as any]);
  ok('manual essential row stays essential', m.find((t) => t.id === 'qa1')!.group === 'essential');
}

console.log('\n── analytics ──');
eq('net total (incl transfer)', grandTotal(toSpendingEvents(txns)), 173498.23, 0.5);
{
  // after the Grab-ride rule, 53 Grab rows < ฿120 (3,766) move essential<-discretionary
  const g = aggregateByGroup(toSpendingEvents(txns));
  eq('essential (+ Grab rides)', g.essential, 57474.27);
  eq('discretionary net (- Grab rides)', g.discretionary, 81376.45);
  eq('transfer', g.transfer, 34647.51);
  eq('net unchanged by reclassification', g.essential + g.discretionary + g.transfer, 173498.23, 1);
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
{
  const ds = dailySpending(txns);
  ok('dailySpending sorted & non-empty', ds.length > 30 && ds[0].date <= ds[ds.length - 1].date);
  const sum = ds.reduce((s, d) => s + d.total, 0);
  eq('dailySpending sums to net total', sum, 173498.23, 1);
  const avg = avgMonthlyByCategory(txns);
  ok('avgMonthlyByCategory has Grab', (avg['Grab/เดลิเวอรี่/แท็กซี่'] ?? 0) > 0);
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
  ok('re-import all -> all duplicates', res.duplicates === 656);
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
{
  // regression: PDF importer normalizes merchant differently than the base data
  // (base "Shell" vs PDF "SHELL 1078F CO UDOMPOR") — dedup must still match via
  // the raw desc so re-importing an already-present statement adds nothing.
  const raw = {
    date: '2026-05-18', time: '', account: 'UOB บัตรเครดิต', direction: 'out' as const,
    amount: 1130, category: 'น้ำมัน/ปั๊ม', group: 'essential' as const,
    merchant: 'SHELL 1078F CO UDOMPOR', desc: 'SHELL 1078F CO UDOMPOR BANGKOK',
  };
  const res = dedupe([raw], materialize(base));
  ok('dedup ignores merchant normalization (Shell case)', res.added.length === 0 && res.duplicates === 1);
}
{
  // cleanup: imported rows that restate base transactions are dropped even when
  // merchant AND desc differ, as long as date+account+amount match a base row.
  const bm = base.find((t) => t.account.startsWith('UOB') && t.amount === 652 && t.date === '2026-05-20')!;
  const importedDup = { ...bm, merchant: 'DIFFERENT', desc: 'DIFFERENT TEXT', category: 'ค่าใช้จ่ายอื่น', id: 'dup1' };
  const importedNew = { ...bm, date: '2026-07-09', amount: 99, merchant: 'NEWJUNE', desc: 'NEW', id: 'new1' };
  const kept = dropBaseDuplicates([importedDup as any, importedNew as any], base);
  ok('dropBaseDuplicates removes base-overlap row', !kept.some((t) => t.id === 'dup1'));
  ok('dropBaseDuplicates keeps genuinely new row', kept.some((t) => t.id === 'new1'));
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
ok('parseDateLoose ISO Buddhist year', parseDateLoose('2569-06-10') === '2026-06-10');
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

console.log('\n── UOB PDF parser ──');
{
  // synthetic fixture in the real statement's line format (no real data)
  const lines = [
    '24 MAY 2026',
    'CARD NUMBER (S) TOTAL BALANCE MINIMUM PAYMENT',
    '5271 73XX XXXX 4020 1,300.00 200.00',
    'TOTAL 1,300.00 200.00',
    'PREVIOUS BALANCE 1,000.00',
    '15 MAY 15 MAY PAYMENT THANK YOU - UOBT TMRW APP 1,000.00 CR',
    '23 APR 22 APR WWW.GRAB.COM BANGKOK 138.00',
    '24 APR 23 APR TMN 7-11 BANGKOK 62.00',
    '05 MAY 03 MAY SUSHIRO GH BANGKOK 1,200.00',
    '06 MAY 05 MAY SOME REFUND 100.00 CR',
  ];
  const r = parseUobStatement(lines);
  ok('uob: excludes payment, parses 4 txns', r.transactions.length === 4);
  ok('uob: statement date', r.summary.statementDate === '2026-05-24');
  ok('uob: previous/total/min balances', r.summary.previousBalance === 1000 && r.summary.totalBalance === 1300 && r.summary.minPayment === 200);
  ok('uob: payments summed', r.summary.payments === 1000);
  eq('uob: parsedNet (debit-credit)', r.summary.parsedNet, 1300);
  eq('uob: expectedNet', r.summary.expectedNet ?? -1, 1300);
  ok('uob: reconciled', r.summary.reconciled === true);
  ok('uob: account from card no.', r.account === '5271 73XX XXXX 4020');
  const grab = r.transactions.find((t) => t.desc.includes('GRAB'))!;
  ok('uob: Grab normalized + categorized', grab.merchant === 'Grab' && grab.category === 'Grab/เดลิเวอรี่/แท็กซี่');
  ok('uob: 7-11 normalized', r.transactions.find((t) => t.desc.includes('7-11'))!.merchant === '7-Eleven');
  const ref = r.transactions.find((t) => t.direction === 'in')!;
  ok('uob: refund -> refund group/category', ref.group === 'refund' && ref.category === 'คืนเงิน (refund)');
  ok('uob: trans-date used, APR=2026-04', grab.date === '2026-04-22');
}
{
  // year rollback: a DEC transaction on a MAY-2026 statement is 2025
  const r = parseUobStatement(['24 MAY 2026', '10 JAN 28 DEC OLD THING BANGKOK 50.00']);
  ok('uob: year rolls back across Dec', r.transactions[0].date === '2025-12-28');
}
{
  // bill summary groups purchases by category, nets in-bill refunds aside
  const r = parseUobStatement([
    '24 MAY 2026', 'TOTAL 300.00 50.00', 'PREVIOUS BALANCE 0.00',
    '23 APR 22 APR WWW.GRAB.COM BANGKOK 200.00',
    '24 APR 23 APR TMN 7-11 BANGKOK 100.00',
    '25 APR 24 APR REFUND 50.00 CR',
  ]);
  const sm = summarizeBill(r.transactions);
  ok('summarizeBill purchases = 300', sm.purchases === 300);
  ok('summarizeBill refunds = 50', sm.refunds === 50);
  ok('summarizeBill sorted desc + grouped', sm.byCategory[0].total === 200 && sm.byCategory.length === 2);
  ok('summarizeBill date range', sm.dateFrom === '2026-04-22' && sm.dateTo === '2026-04-24');
}

console.log('\n── Grab ride rule (< ฿120 = transport) ──');
ok('grab < 120 -> transport', autoCategorize('Grab', 'WWW.GRAB.COM', {}, 100) === 'เดินทาง/ขนส่ง');
ok('grab >= 120 -> delivery', autoCategorize('Grab', 'WWW.GRAB.COM', {}, 150) === 'Grab/เดลิเวอรี่/แท็กซี่');
ok('grab no amount -> delivery (default)', autoCategorize('Grab', 'WWW.GRAB.COM') === 'Grab/เดลิเวอรี่/แท็กซี่');
ok('refineCategory leaves non-grab alone', refineCategory('7-Eleven', '', 'ร้านสะดวกซื้อ', 50) === 'ร้านสะดวกซื้อ');
ok('explicit Grab rule beats ride heuristic', autoCategorize('Grab', '', { Grab: { merchant: 'Grab', category: 'คาเฟ่/ขนม' } }, 50) === 'คาเฟ่/ขนม');
{
  // existing data: a Grab base row under ฿120 is reclassified to transport
  const m = materialize(base);
  const small = m.find((t) => t.merchant === 'Grab' && t.direction === 'out' && t.amount < 120)!;
  ok('existing Grab < 120 reclassified', small.category === 'เดินทาง/ขนส่ง' && small.group === 'essential');
  const big = m.find((t) => t.merchant === 'Grab' && t.direction === 'out' && t.amount >= 120)!;
  ok('existing Grab >= 120 unchanged', big.category === 'Grab/เดลิเวอรี่/แท็กซี่');
}

console.log('\n── card-bill settlement (no double-count) ──');
ok('autocat: KBank card payment', autoCategorize('', 'ชำระค่าบัตรเครดิต UOB') === 'ชำระบัตรเครดิต');
ok('autocat: UOB Premier -> settlement', autoCategorize('UOB PREMIER', '') === 'ชำระบัตรเครดิต');
ok('settlement is transfer group', categoryGroup('ชำระบัตรเครดิต') === 'transfer');
{
  const settle = { date: '2026-07-05', time: '', account: 'KBank ออมทรัพย์', direction: 'out' as const,
    amount: 40000, category: 'ชำระบัตรเครดิต', group: 'transfer' as const, merchant: 'UOB', desc: 'ชำระบัตร', id: 'settle1' };
  const m = materialize(base, [settle as any]);
  eq('card-bill payment excluded from net (no double count)', grandTotal(toSpendingEvents(m)), 173498.23, 1);
  ok('settlement still appears in txn list', m.some((t) => t.id === 'settle1'));
}

console.log('\n── KBank statement parser ──');
{
  // transcribed from a real K-DEPOSIT statement (12–18 Jun 2026)
  const L = [
    'รอบระหว่างวันที่ 12/06/2026 - 18/06/2026',
    'ยอดยกไป 192.97',
    'รวมถอนเงิน 20 รายการ 2,922.25',
    'รวมฝากเงิน 1 รายการ 3,000.00',
    '12-06-26 ยอดยกมา 115.22',
    '12-06-26 17:36 รับโอนเงิน 3,000.00 3,115.22 Internet/Mobile SCB จาก SCB X5730 นาย ชวมันท์ สุขพรช++',
    '12-06-26 17:37 ชำระเงิน 507.00 2,608.22 MAKE by KBank เพื่อชำระ Ref X3115 อร่อยแซงคิว',
    '13-06-26 15:51 ชำระเงิน 50.00 2,558.22 MAKE by KBank เพื่อชำระ Ref X3473 TrueMoney Shop',
    '13-06-26 18:36 ชำระเงิน 150.00 2,408.22 MAKE by KBank บริษัท อัครอส ร้อย จำกัด',
    '14-06-26 17:19 ชำระเงิน 20.00 2,388.22 MAKE by KBank โลตัส อีเทอรี่',
    '14-06-26 17:42 ชำระเงิน 96.00 2,292.22 MAKE by KBank GOLDEN DONUTS',
    '15-06-26 15:59 ชำระเงิน 65.00 2,227.22 MAKE by KBank ร้านเวเนตี้',
    '15-06-26 16:04 ชำระเงิน 36.00 2,191.22 MAKE by KBank แพนเค้กหน้าออส',
    '16-06-26 06:54 โอนเงิน 50.00 2,141.22 MAKE by KBank โอนไป พร้อมเพย์ X9709 น.ส. สุราดร์ แซ่เด่++',
    '16-06-26 07:39 ชำระเงิน 105.00 2,036.22 MAKE by KBank SCB มณี SHOP',
    '16-06-26 10:03 โอนเงิน 300.00 1,736.22 MAKE by KBank โอนไป X9576 นาง ธัญญาภรณ์ ปราณ++',
    '16-06-26 11:18 ชำระเงิน 45.00 1,691.22 MAKE by KBank ร้านกันต์เอง',
    '16-06-26 11:21 ชำระเงิน 94.00 1,597.22 MAKE by KBank พรมาเรีย เบเกอรี่',
    '16-06-26 15:25 ชำระเงิน 180.00 1,417.22 MAKE by KBank ทุกอย่าง 20 by Apple',
    '16-06-26 18:02 ชำระเงิน 385.00 1,032.22 MAKE by KBank อร่อยแซงคิว',
    '17-06-26 06:14 ชำระเงิน 200.00 832.22 MAKE by KBank บจก. ทรู มันนี่',
    '17-06-26 08:13 โอนเงิน 50.00 782.22 MAKE by KBank โอนไป X2102 น.ส. ณัฐวดี++',
    '18-06-26 11:11 โอนเงิน 60.00 722.22 MAKE by KBank โอนไป X8535 นาย สงวน++',
    '18-06-26 14:50 โอนเงิน 481.25 240.97 MAKE by KBank โอนไป X3473 น.ส. ชลิตตรณ์ ปราณ++',
    '18-06-26 15:56 ชำระเงิน 18.00 222.97 MAKE by KBank บริษัท ซันเวนติ้ง',
    '18-06-26 16:06 โอนเงิน 30.00 192.97 MAKE by KBank โอนไป X1770 นาย ประสิทธิ์ โยตา++',
  ];
  const r = parseKbankStatement(L);
  ok('kbank: parses 21 rows', r.transactions.length === 21);
  ok('kbank: 1 in / 20 out', r.transactions.filter((t) => t.direction === 'in').length === 1 && r.transactions.filter((t) => t.direction === 'out').length === 20);
  eq('kbank: parsedOut = control', r.summary.parsedOut, 2922.25);
  eq('kbank: parsedIn = control', r.summary.parsedIn, 3000);
  ok('kbank: reconciled', r.summary.reconciled === true);
  ok('kbank: first row deposit -> income', r.transactions[0].direction === 'in' && r.transactions[0].category === 'รายรับ (เงินเข้า)');
  ok('kbank: โอนไป -> transfer category', r.transactions.find((t) => t.desc.includes('โอนไป'))!.category === 'โอนเงิน/บุคคล');
  ok('kbank: date 20yy-mm-dd', r.transactions[0].date === '2026-06-12');
  ok('kbank: account KBank', r.transactions[0].account === 'KBank ออมทรัพย์');
  // unified dispatch detects KBank and parses
  ok('detectBank -> KBank', detectBank(L) === 'KBank');
  const u = parseStatement(L);
  ok('parseStatement KBank', u != null && u.bank === 'KBank' && u.transactions.length === 21 && u.reconciled);
}
{
  const L = ['24 MAY 2026', 'UOB PREMIER', 'TOTAL 1,300.00 200.00', 'PREVIOUS BALANCE 1,000.00',
    '15 MAY 15 MAY PAYMENT THANK YOU 1,000.00 CR', '23 APR 22 APR WWW.GRAB.COM BANGKOK 200.00'];
  ok('detectBank -> UOB', detectBank(L) === 'UOB');
  const u = parseStatement(L);
  ok('parseStatement UOB', u != null && u.bank === 'UOB' && u.transactions.length === 1);
  ok('detectBank unknown -> null', detectBank(['random text 123']) === null);
}

console.log('\n── OCR preprocess (adaptive binarization) ──');
{
  // Synthetic 40x10 image: a left->right brightness gradient (50..200, like an
  // unevenly-lit photo) with two ink strokes — one in the dark region (x=5),
  // one in the bright region (x=35), each 45 darker than its local background.
  const w = 40, h = 10;
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bg = Math.round(50 + (150 * x) / (w - 1));
      gray[y * w + x] = x === 5 || x === 35 ? bg - 45 : bg;
    }
  }
  // A single global threshold cannot separate ink from paper across the gradient:
  // dark-region PAPER (x=4) reads darker than bright-region INK (x=35).
  ok('global threshold (128) would misclassify both ends', gray[4] < 128 && !(gray[35] < 128));

  const bin = adaptiveThreshold(gray, w, h, 4, 20);
  ok('adaptive: ink in dark region -> black', bin[5] === 0);
  ok('adaptive: ink in bright region -> black', bin[35] === 0);
  ok('adaptive: paper stays white (both ends)', bin[4] === 255 && bin[20] === 255 && bin[36] === 255);
  ok('adaptive: output is strictly binary', bin.every((v) => v === 0 || v === 255));
}

console.log('\n── KBank row parser: OCR separator tolerance ──');
{
  // OCR often renders the date/time cell with / and . instead of - and :.
  // The clean PDF-text shape must still parse, and so must the noisy one.
  const r = parseKbankStatement([
    '12/06/26 17.37 ชำระเงิน 507.00 2,608.22 MAKE by KBank เพื่อชำระ Ref X3115 ร้านอร่อย',
  ]);
  ok('kbank: parses / and . separators', r.transactions.length === 1);
  ok('kbank: date normalized', r.transactions[0].date === '2026-06-12');
  ok('kbank: time normalized to HH:MM', r.transactions[0].time === '17:37');
  ok('kbank: amount intact', r.transactions[0].amount === 507);
}

console.log('\n── receipt OCR parser ──');
{
  const r = parseReceiptText('7-Eleven สาขาสุขุมวิท\nใบเสร็จรับเงิน\nนม 25.00\nขนม 15.00\nรวมทั้งสิ้น 40.00 บาท\n14/05/2026');
  ok('receipt: amount from total line', r.amount === 40);
  ok('receipt: merchant top line', r.merchant.startsWith('7-Eleven'));
  ok('receipt: category from merchant', r.category === 'ร้านสะดวกซื้อ');
  ok('receipt: date parsed', r.date === '2026-05-14');
}
{
  // net keyword beats a larger subtotal
  const r = parseReceiptText('ร้านอาหารอร่อย\nอาหาร 1,200.00\nส่วนลด 200.00\nยอดสุทธิ 1,000.00');
  ok('receipt: net total beats subtotal', r.amount === 1000);
}
{
  // no keyword -> largest 2-decimal; Grab < 120 -> transport via autocat
  const r = parseReceiptText('Grab\nWWW.GRAB.COM\n89.00');
  ok('receipt: fallback to decimal amount', r.amount === 89);
  ok('receipt: Grab ride category', r.category === 'เดินทาง/ขนส่ง');
}
{
  // ignores phone/tax-id long digit runs and years
  const r = parseReceiptText('Shell\nTAX ID 0123456789012\nโทร 021234567\nยอดชำระ 1,130.00\n2026');
  ok('receipt: ignores long digit runs', r.amount === 1130);
  ok('receipt: fuel category', r.category === 'น้ำมัน/ปั๊ม');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
if (fail) { console.error('FAILED:', fails.join(' | ')); process.exit(1); }
