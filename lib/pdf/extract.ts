// Client-side PDF text extraction via pdf.js. Lazy-loaded so the ~1MB library
// is only fetched when the user actually imports a PDF. The worker is
// self-hosted from /public (copied at build time) — nothing leaves the device.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export class PdfPasswordError extends Error {
  constructor() { super('password required'); this.name = 'PdfPasswordError'; }
}

/**
 * Extract text as reconstructed lines (grouped by y-position, ordered by x),
 * which preserves the tabular row layout statements rely on.
 */
export async function extractPdfLines(file: File, password?: string): Promise<string[]> {
  const pdfjs: any = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, password }).promise;
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new PdfPasswordError();
    throw e;
  }

  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as any[]) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x: it.transform[4], s: it.str });
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const line = rows.get(y)!.sort((a, b) => a.x - b.x).map((o) => o.s).join(' ').replace(/\s+/g, ' ').trim();
      if (line) lines.push(line);
    }
  }
  return lines;
}
