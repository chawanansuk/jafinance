/**
 * Component smoke test: mount every page in a real DOM (jsdom) inside the real
 * DataProvider, run effects, and assert it renders expected content without
 * throwing. Catches client-side wiring bugs the lib tests can't. Run: `npm run smoke`.
 */
import { JSDOM } from 'jsdom';

// ── set up a browser-like global environment ────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const g = globalThis as any;
g.window = dom.window;
g.self = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
g.ResizeObserver = RO; dom.window.ResizeObserver = RO;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as any;
// Recharts measures via getBoundingClientRect — give it a non-zero box
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { width: 600, height: 300, top: 0, left: 0, right: 600, bottom: 300, x: 0, y: 0, toJSON() {} } as any;
};

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { DataProvider } from '@/components/DataProvider';
import Dashboard from '@/app/page';
import CategoriesPage from '@/app/categories/page';
import BudgetPage from '@/app/budget/page';
import TransactionsPage from '@/app/transactions/page';
import InsightsPage from '@/app/insights/page';
import ManagePage from '@/app/manage/page';

const router: any = {
  push: () => {}, replace: () => {}, prefetch: () => Promise.resolve(), back: () => {},
  forward: () => {}, refresh: () => {},
};

const pages: [string, React.ComponentType, string][] = [
  ['Dashboard', Dashboard, 'ภาพรวม'],
  ['Categories', CategoriesPage, 'หมวดหมู่'],
  ['Budget', BudgetPage, 'งบประมาณ'],
  ['Transactions', TransactionsPage, 'รายการธุรกรรม'],
  ['Insights', InsightsPage, 'อินไซต์'],
  ['Manage', ManagePage, 'จัดการ'],
];

let fail = 0;
const errors: string[] = [];
const origError = console.error;

async function run() {
  for (const [name, Page, expect] of pages) {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container as any);
    let caught: any = null;
    const seen: string[] = [];
    console.error = (...a: any[]) => { seen.push(a.map(String).join(' ')); };
    try {
      await act(async () => {
        root.render(
          React.createElement(AppRouterContext.Provider, { value: router },
            React.createElement(DataProvider, null, React.createElement(Page))),
        );
      });
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    } catch (e) {
      caught = e;
    } finally {
      console.error = origError;
    }

    const text = container.textContent || '';
    const realErrors = seen.filter((s) => !/not wrapped in act|defaultProps|width\(0\)|height\(0\)/.test(s));
    if (caught) { fail++; errors.push(`${name}: threw ${caught?.message || caught}`); console.log(`  ✗ ${name} — threw`); }
    else if (!text.includes(expect)) { fail++; errors.push(`${name}: missing "${expect}"`); console.log(`  ✗ ${name} — missing "${expect}"`); }
    else if (realErrors.length) { fail++; errors.push(`${name}: console.error ${realErrors[0]}`); console.log(`  ✗ ${name} — console.error: ${realErrors[0].slice(0, 120)}`); }
    else { console.log(`  ✓ ${name} (${text.length} chars rendered)`); }

    await act(async () => { root.unmount(); });
    container.remove();
  }

  console.log(`\n${fail === 0 ? '✓' : '✗'} smoke: ${pages.length - fail}/${pages.length} pages OK`);
  if (fail) { console.error('FAILED:\n  ' + errors.join('\n  ')); process.exit(1); }
}

run();
