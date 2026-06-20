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
  webpack: (config, { webpack }) => {
    // pdf.js optionally pulls in the Node-only `canvas` package; we only use it
    // in the browser, so stub it out to keep the bundle clean.
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    // The Claude SDK (used client-side for the Cloud AI reader) statically
    // imports a few `node:`-scheme built-ins it never exercises in the browser.
    // Strip the scheme and stub the modules so the static client bundle builds.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      }),
    );
    config.resolve.fallback = {
      ...config.resolve.fallback,
      path: false,
      fs: false,
      os: false,
      crypto: false,
      stream: false,
      url: false,
      buffer: false,
    };
    return config;
  },
};

export default nextConfig;
