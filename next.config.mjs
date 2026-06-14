/** @type {import('next').NextConfig} */

// basePath/assetPrefix are env-driven so the same build works on:
//   - Vercel / root domain  -> NEXT_PUBLIC_BASE_PATH unset  -> basePath ""
//   - GitHub Pages subpath   -> NEXT_PUBLIC_BASE_PATH="/jafinance"
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: 'export',
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  webpack: (config) => {
    // pdf.js optionally pulls in the Node-only `canvas` package; we only use it
    // in the browser, so stub it out to keep the bundle clean.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
