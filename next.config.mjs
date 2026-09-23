/** @type {import('next').NextConfig} */

// basePath/assetPrefix are env-driven so the same build works on:
//   - Vercel / root domain  -> NEXT_PUBLIC_BASE_PATH unset  -> basePath ""
//   - GitHub Pages subpath   -> NEXT_PUBLIC_BASE_PATH="/jafinance"
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

// No bundler config. Under webpack this file stubbed pdf.js's optional
// `canvas` import and the Claude SDK's `node:` built-ins for the browser
// bundle. Turbopack (the default since Next 16) resolves both without help:
// PDF import, Cloud AI and OCR were each driven in a real browser on both
// bundlers and behaved identically.
const nextConfig = {
  output: 'export',
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
