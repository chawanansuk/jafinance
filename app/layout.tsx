import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai, Anuphan } from 'next/font/google';
import './globals.css';
import { DataProvider } from '@/components/DataProvider';
import { AppShell } from '@/components/AppShell';

// next/font self-hosts the font files at build time — no runtime request to
// Google, satisfying the "no external server / no tracker" requirement.
const notoThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-thai',
  display: 'swap',
});

// Figures only (see .tnum in globals.css). Noto's Arabic numerals are flat;
// Anuphan's are rounder and more confident, which is most of what the app
// actually shows. The `latin` subset is deliberate: Google ships ฿ (U+0E3F)
// inside it — verified by measuring the glyph — so amounts stay in one face,
// while the subset carries no Thai letters, leaving Thai text on Noto.
const anuphan = Anuphan({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-num',
  display: 'swap',
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'วางแผนค่าใช้จ่าย',
  description: 'แอพวางแผนและวิเคราะห์ค่าใช้จ่ายส่วนตัว — ข้อมูลเก็บในเครื่องเท่านั้น',
  manifest: `${basePath}/manifest.webmanifest`,
  icons: { icon: `${basePath}/icon.svg`, apple: `${basePath}/icon.svg` },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ค่าใช้จ่าย' },
};

export const viewport: Viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
};

// Avoid theme flash: set the class before React hydrates.
const noFlash = `(function(){try{var t=localStorage.getItem('jafinance:v1:theme');var m=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(!t&&m))document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${notoThai.variable} ${anuphan.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body className="font-sans antialiased">
        <DataProvider>
          <AppShell>{children}</AppShell>
        </DataProvider>
      </body>
    </html>
  );
}
