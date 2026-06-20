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
 * Local adaptive (per-pixel) binarization — the pure, testable core of the
 * preprocessor. For each pixel it compares the gray value against the MEAN of a
 * surrounding window and marks it black only when it is `c` darker than that
 * local mean. Unlike a single global threshold, this tracks shadows and uneven
 * lighting across a phone photo, so text in a dark corner and text in a bright
 * corner are both recovered. The window mean is computed in O(1) per pixel via
 * a summed-area (integral) table, so the whole pass is linear in pixel count.
 *
 * Returns a new array of 0 (ink) / 255 (paper).
 */
export function adaptiveThreshold(
  gray: Uint8Array | Uint8ClampedArray | number[],
  w: number,
  h: number,
  radius: number,
  c: number,
): Uint8Array {
  const stride = w + 1;
  // integral[(y)*stride + x] = sum of gray over [0..x-1] x [0..y-1]
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      integral[(y + 1) * stride + (x + 1)] =
        gray[y * w + x] +
        integral[y * stride + (x + 1)] +
        integral[(y + 1) * stride + x] -
        integral[y * stride + x];
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = y - radius < 0 ? 0 : y - radius;
    const y1 = y + radius >= h ? h - 1 : y + radius;
    for (let x = 0; x < w; x++) {
      const x0 = x - radius < 0 ? 0 : x - radius;
      const x1 = x + radius >= w ? w - 1 : x + radius;
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      const mean = sum / area;
      out[y * w + x] = gray[y * w + x] < mean - c ? 0 : 255;
    }
  }
  return out;
}

/**
 * Pre-process a photo to help OCR: upscale small images, convert to grayscale,
 * then binarize with a local adaptive threshold. Phone photos of statements are
 * often small, low-contrast, and unevenly lit; Tesseract reads clean black text
 * on white paper far better than a raw photo. Falls back to the original image
 * if anything goes wrong (e.g. canvas/createImageBitmap unavailable).
 */
async function preprocess(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const longSide = Math.max(bitmap.width, bitmap.height) || 1;
    // Upscale toward ~2000px on the long edge — gives thin Thai strokes enough
    // pixels to survive binarization, without ballooning the worker's work.
    const scale = Math.min(3, Math.max(1, 2000 / longSide));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    // 1. grayscale (luma)
    const gray = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    }
    // 2. adaptive threshold — window a bit larger than a character, small bias
    //    so flat paper stays white instead of dissolving into speckle.
    const radius = Math.max(10, Math.round(longSide * scale / 100));
    const bin = adaptiveThreshold(gray, w, h, radius, 12);
    // 3. write the binary image back
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      d[i] = d[i + 1] = d[i + 2] = bin[p];
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
