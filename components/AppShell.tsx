'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, PieChart, Wallet, ListOrdered, Lightbulb, SlidersHorizontal, Moon, Sun, Wallet2,
} from 'lucide-react';
import { KEYS } from '@/lib/storage';

const NAV = [
  { href: '/', label: 'ภาพรวม', icon: LayoutDashboard },
  { href: '/categories', label: 'หมวดหมู่', icon: PieChart },
  { href: '/budget', label: 'งบ', icon: Wallet },
  { href: '/transactions', label: 'รายการ', icon: ListOrdered },
  { href: '/insights', label: 'อินไซต์', icon: Lightbulb },
  { href: '/manage', label: 'จัดการ', icon: SlidersHorizontal },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem(KEYS.theme, next ? 'dark' : 'light'); } catch {}
  };
  return (
    <button onClick={toggle} aria-label="สลับธีม" className="btn-ghost !px-2.5 !py-2">
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="min-h-dvh flex flex-col">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid place-items-center h-8 w-8 rounded-xl bg-brand text-white">
              <Wallet2 size={18} />
            </span>
            <span>วางแผนค่าใช้จ่าย</span>
          </Link>
          <div className="flex items-center gap-2">
            {/* desktop nav */}
            <nav className="hidden sm:flex items-center gap-1">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`seg flex items-center gap-1.5 ${isActive(href) ? 'seg-on' : 'seg-off'}`}
                >
                  <Icon size={15} /> {label}
                </Link>
              ))}
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* content */}
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-5 pb-24 sm:pb-8">
        {children}
      </main>

      {/* mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-5xl grid grid-cols-6">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                isActive(href) ? 'text-brand' : 'text-ink-soft'
              }`}
            >
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
