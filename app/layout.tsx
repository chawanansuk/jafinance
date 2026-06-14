import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
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

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'วางแผนค่าใช้จ่าย',
  description: 'แอพวางแผนและวิเคราะห์ค่าใช้จ่ายส่วนตัว — ข้อมูลเก็บในเครื่องเท่านั้น',
  manifest: `${basePath}/manifest.webmanifest`,
  icons: { icon: `${basePath}/icon.svg`, apple: `${basePath}/icon.svg` },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ค่าใช้จ่าย' },
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
};

// Avoid theme flash: set the class before React hydrates.
const noFlash = `(function(){try{var t=localStorage.getItem('jafinance:v1:theme');var m=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(!t&&m))document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoThai.variable} suppressHydrationWarning>
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
