/**
 * Independent reconciliation oracle.
 *
 * Recomputes the control totals straight from data/transactions.json (NOT via
 * the app's lib, so it can catch lib bugs) and asserts them against the
 * statement-verified baseline. Run with `npm run reconcile`; also runs in
 * prebuild so a drift fails the build.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

type Row = {
  date: string; account: string; direction: 'in' | 'out';
  amount: number; category: string; group: string; merchant: string; desc: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, '../data/transactions.json');
const rows: Row[] = JSON.parse(readFileSync(file, 'utf8'));

let failures = 0;
function check(name: string, actual: number, expected: number, tol = 0.05) {
  const ok = Math.abs(actual - expected) <= tol;
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${name.padEnd(34)} got ${actual.toFixed(2).padStart(12)}  expect ${expected.toFixed(2)}`);
  if (!ok) failures++;
}
function checkInt(name: string, actual: number, expected: number) {
  const ok = actual === expected;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(34)} got ${String(actual).padStart(12)}  expect ${expected}`);
  if (!ok) failures++;
}

const sum = (f: (r: Row) => boolean) =>
  rows.filter(f).reduce((s, r) => s + r.amount, 0);

// ── totals by account / direction ──────────────────────────────────────────
const uobGross = sum((r) => r.account.startsWith('UOB') && r.direction === 'out');
const uobRefund = sum((r) => r.account.startsWith('UOB') && r.direction === 'in');
const kbankOut = sum((r) => r.account.startsWith('KBank') && r.direction === 'out');

// ── groups (out) ───────────────────────────────────────────────────────────
const essential = sum((r) => r.direction === 'out' && r.group === 'essential');
const discGross = sum((r) => r.direction === 'out' && r.group === 'discretionary');
const transfer = sum((r) => r.direction === 'out' && r.group === 'transfer');
const refundTotal = sum((r) => r.group === 'refund'); // all `in`

// refunds net into discretionary (travel) -> discretionary net
const discNet = discGross - refundTotal;
const netTotal = essential + discNet + transfer;

// ── top merchant (out, excluding non-spend groups) ─────────────────────────
const merch = new Map<string, { amt: number; n: number }>();
for (const r of rows) {
  if (r.direction !== 'out') continue;
  if (['transfer', 'income', 'refund'].includes(r.group)) continue;
  const m = merch.get(r.merchant) ?? { amt: 0, n: 0 };
  m.amt += r.amount; m.n += 1; merch.set(r.merchant, m);
}
const top = [...merch.entries()].sort((a, b) => b[1].amt - a[1].amt);
const grab = merch.get('Grab')!;
const seven = merch.get('7-Eleven')!;

console.log('\n── Reconcile against statement baseline ──────────────────────');
checkInt('record count', rows.length, 687);
check('UOB gross out', uobGross, 143902.08);
check('UOB refund (in)', uobRefund, 10682.02);
check('UOB net (gross - refund)', uobGross - uobRefund, 133220.06);
check('KBank out', kbankOut, 43443.17);
check('essential (out)', essential, 53824.27);
check('discretionary NET (refund-netted)', discNet, 85705.45);
check('transfer (out)', transfer, 37133.51);
check('NET TOTAL spending', netTotal, 176663.23, 1);
check('top merchant Grab total', grab.amt, 17815, 1);
checkInt('top merchant Grab count', grab.n, 118);
check('7-Eleven total', seven.amt, 12906, 1);
checkInt('7-Eleven count', seven.n, 123);

console.log('\n  Top 5 merchants (spend only):');
for (const [name, m] of top.slice(0, 5)) {
  console.log(`    ${name.padEnd(28)} ${m.amt.toFixed(0).padStart(8)} / ${m.n}x`);
}

if (failures > 0) {
  console.error(`\n✗ Reconcile FAILED: ${failures} mismatch(es). Fix before continuing.\n`);
  process.exit(1);
}
console.log('\n✓ All control totals match the baseline.\n');
