// On-device OCR via tesseract.js. The image is processed entirely in the
// browser (a WebAssembly worker) — the photo itself is NEVER uploaded. Only the
// generic OCR engine + language model load from a CDN on first use (cached),
// which contain no personal data. Lazy-loaded so nothing ships in the main bundle.

export interface OcrProgress {
  status: string;
  progress: number; // 0..1
}

const LANGS = 'tha+eng';

/**
 * Pre-process a photo to help OCR: upscale small images, convert to grayscale,
 * and stretch contrast. Phone photos of receipts are often small/low-contrast,
 * which Tesseract reads poorly; this typically improves the result. Falls back
 * to the original image if anything goes wrong (e.g. API unavailable).
 */
async function preprocess(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const longSide = Math.max(bitmap.width, bitmap.height) || 1;
    const scale = Math.min(3, Math.max(1, 1800 / longSide));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g = (g - 128) * 1.45 + 128; // contrast stretch
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Recognize text from an image Blob/File on-device. */
export async function ocrImage(file: Blob, onProgress?: (p: OcrProgress) => void): Promise<string> {
  onProgress?.({ status: 'เตรียมรูป', progress: 0 });
  const prepped = await preprocess(file);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(LANGS, 1, {
    logger: (m: any) => onProgress?.({ status: m.status ?? '', progress: typeof m.progress === 'number' ? m.progress : 0 }),
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(prepped);
    return data.text ?? '';
  } finally {
    await worker.terminate();
  }
}
