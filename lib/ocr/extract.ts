// On-device OCR via tesseract.js. The image is processed entirely in the
// browser (a WebAssembly worker) — the photo itself is NEVER uploaded. Only the
// generic OCR engine + language model load from a CDN on first use (cached),
// which contain no personal data. Lazy-loaded so nothing ships in the main bundle.

export interface OcrProgress {
  status: string;
  progress: number; // 0..1
}

const LANGS = 'tha+eng';

/** Recognize text from an image Blob/File on-device. */
export async function ocrImage(file: Blob, onProgress?: (p: OcrProgress) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(LANGS, 1, {
    logger: (m: any) => onProgress?.({ status: m.status ?? '', progress: typeof m.progress === 'number' ? m.progress : 0 }),
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text ?? '';
  } finally {
    await worker.terminate();
  }
}
