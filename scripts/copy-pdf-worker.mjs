// Copy the pdf.js worker into /public so it is self-hosted (no external CDN).
// Runs in predev/prebuild; the file is git-ignored and regenerated from the
// pinned pdfjs-dist version.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const destDir = resolve(root, 'public');
const dest = resolve(destDir, 'pdf.worker.min.mjs');

if (!existsSync(src)) {
  console.warn('[copy-pdf-worker] pdfjs worker not found at', src, '- skipping');
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[copy-pdf-worker] copied pdf.worker.min.mjs -> public/');
