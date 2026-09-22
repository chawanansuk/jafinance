'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, PieChart, Wallet, ListOrdered, Lightbulb, SlidersHorizontal, Moon, Sun, Wallet2, Plus,
} from 'lucide-react';
import { KEYS, STORAGE_ERROR_EVENT } from '@/lib/storage';
import { QuickAdd, QUICKADD_EVENT } from './QuickAdd';

const NAV = [
  { href: '/', label: 'ภาพรวม', icon: LayoutDashboard },
  { href: '/categories', label: 'หมวดหมู่', icon: PieChart },
  { href: '/budget', label: 'งบ', icon: Wallet },
  { href: '/transactions', label: 'รายการ', icon: ListOrdered },
  { href: '/insights', label: 'อินไซต์', icon: Lightbulb },
  { href: '/manage', label: 'จัดการ', icon: SlidersHorizontal },
];

function ThemeToggle() {
  // icon follows the <html>.dark class via CSS — no state, so dark-mode users
  // don't see the wrong icon on first paint
  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem(KEYS.theme, next ? 'dark' : 'light'); } catch {}
  };
  return (
    <button onClick={toggle} aria-label="สลับธีม" className="btn-ghost !px-2.5 !py-2">
      <Sun size={18} className="hidden dark:block" />
      <Moon size={18} className="dark:hidden" />
    </button>
  );
}

/** Persistent warning once any localStorage write has failed (quota full /
 *  private mode) — otherwise the user keeps "saving" into memory that
 *  evaporates on reload. */
function StorageAlert() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const on = () => setFailed(true);
    window.addEventListener(STORAGE_ERROR_EVENT, on);
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, on);
  }, []);
  if (!failed) return null;
  return (
    <div role="alert" className="bg-error text-white text-caption text-center px-3 py-2">
      ⚠ บันทึกลงเครื่องไม่สำเร็จ (พื้นที่เต็มหรือโหมดส่วนตัว) — การเปลี่ยนแปลงล่าสุดอาจหายเมื่อรีโหลด
      แนะนำให้ไปหน้า จัดการ → สำรองข้อมูล เก็บไฟล์ไว้ก่อน
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  // V2 grid: the transactions table earns the extra width; reading pages don't
  const wide = pathname.startsWith('/transactions');
  const container = wide ? 'max-w-wide' : 'max-w-content';

  return (
    <div className="min-h-dvh flex flex-col">
      <StorageAlert />
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className={`mx-auto ${container} px-4 sm:px-6 h-15 flex items-center justify-between`}>
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <span className="grid place-items-center h-7 w-7 rounded-sm bg-brand text-white">
              <Wallet2 size={16} />
            </span>
            <span className="text-h3 tracking-tight">วางแผนค่าใช้จ่าย</span>
          </Link>
          <div className="flex items-center gap-5">
            {/* desktop nav — underline marks the active route instead of a raised box */}
            <nav className="hidden sm:flex items-end gap-1">
              {NAV.map(({ href, label, icon: Icon }) => {
                const on = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={on ? 'page' : undefined}
                    className={`flex flex-col items-center gap-1.5 px-2.5 pt-2.5 text-label font-medium transition-colors ${
                      on ? 'text-ink' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    <span className="flex items-center gap-1.5"><Icon size={15} aria-hidden /> {label}</span>
                    <span className={`h-0.5 w-full rounded-full ${on ? 'bg-brand' : 'bg-transparent'}`} />
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.dispatchEvent(new Event(QUICKADD_EVENT))}
                className="hidden lg:inline-flex btn-primary !py-2 !px-4"
              >
                <Plus size={16} aria-hidden /> เพิ่มรายการ
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* content */}
      <main className={`flex-1 mx-auto w-full ${container} px-4 sm:px-6 py-6 sm:py-8 pb-28 sm:pb-10`}>
        {children}
      </main>

      <QuickAdd />


      {/* mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto max-w-content grid grid-cols-6">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-caption transition-colors ${
                  on ? 'text-ink font-medium' : 'text-ink-soft'
                }`}
              >
                <span className={`grid place-items-center h-7 w-12 rounded-full transition-colors ${on ? 'bg-brand/15 text-brand' : ''}`}>
                  <Icon size={20} strokeWidth={on ? 2.4 : 2} aria-hidden />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
