import { createWorker, Worker } from 'tesseract.js';
import { Money, ShelfPriceOcrParser, ShelfTagOcrParser, ShelfTagResult } from '../../domain/index.js';

let workerInstance: Worker | null = null;
let workerInitPromise: Promise<Worker | null> | null = null;

/**
 * Character whitelist supporting full Spanish & English product names, accents, numbers, and currency.
 */
export const SHELF_TAG_CHAR_WHITELIST =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZáéíóúÁÉÍÓÚüÜñÑ0123456789,.-:;()/%€EURpvpPVP ';

/**
 * Initializes and caches a singleton Tesseract.js Worker instance.
 * Configured with alphanumeric character set for shelf tags and price reading.
 */
export async function getOcrWorker(): Promise<Worker | null> {
  if (workerInstance) {
    return workerInstance;
  }

  // Check if Worker environment is available (browser context)
  if (typeof globalThis.Worker === 'undefined') {
    return null;
  }

  if (!workerInitPromise) {
    workerInitPromise = (async () => {
      try {
        let worker: Worker;
        try {
          // Try Spanish language trained model
          worker = await createWorker('spa', 1);
        } catch {
          // Fallback to English language model
          worker = await createWorker('eng', 1);
        }

        // Configure alphanumeric whitelist for supermarket shelf tag & price reading
        await worker.setParameters({
          tessedit_char_whitelist: SHELF_TAG_CHAR_WHITELIST,
        });

        workerInstance = worker;
        return worker;
      } catch (err) {
        console.warn('Failed to initialize Tesseract worker:', err);
        return null;
      }
    })();
  }

  return workerInitPromise;
}

/**
 * Terminates the OCR worker to free memory when idle.
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerInstance) {
    try {
      await workerInstance.terminate();
    } catch {
      // Ignore termination errors during teardown
    } finally {
      workerInstance = null;
      workerInitPromise = null;
    }
  }
}

/**
 * Allows injecting or clearing worker instance for testing environments.
 */
export function setOcrWorkerForTesting(worker: Worker | null): void {
  workerInstance = worker;
  workerInitPromise = worker ? Promise.resolve(worker) : null;
}

/**
 * Preprocesses a shelf tag camera crop for optimal OCR accuracy across all supermarket chains.
 * - Upscales small cropped regions so Tesseract text height is optimal (minimum 30-40px per line).
 * - Applies dynamic contrast stretching and adaptive luminance normalisation across colored backgrounds
 *   (white, yellow, red, orange, blue).
 * - Automatically handles both dark-on-light and light-on-dark tags (inverting if background is dark).
 */
export function preprocessShelfTagCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  if (
    !sourceCanvas ||
    typeof document === 'undefined' ||
    typeof sourceCanvas.getContext !== 'function'
  ) {
    return sourceCanvas;
  }

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (width <= 0 || height <= 0) {
    return sourceCanvas;
  }

  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) {
    return sourceCanvas;
  }

  try {
    // 1. Calculate upscale factor for small crops (ensure text line height is at least 30-40px)
    // Shelf tags typically have 3-5 lines of text. If canvas height < 500, upscale up to 3x.
    const scale = height < 500 ? Math.max(1, Math.min(3, 600 / height)) : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = targetW;
    outputCanvas.height = targetH;

    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) {
      return sourceCanvas;
    }

    outputCtx.imageSmoothingEnabled = true;
    outputCtx.imageSmoothingQuality = 'high';
    outputCtx.drawImage(sourceCanvas, 0, 0, targetW, targetH);

    const imageData = outputCtx.getImageData(0, 0, targetW, targetH);
    const data = imageData.data;
    const len = data.length;
    const numPixels = targetW * targetH;

    // 2. Perceptual luminance calculation (Rec. 601) and histogram computation
    const grays = new Uint8Array(numPixels);
    const hist = new Uint32Array(256);

    for (let i = 0, j = 0; i < len; i += 4, j++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      grays[j] = l;
      hist[l]++;
    }

    // Determine polarity using the histogram median and dominant peak.
    // In product labels/shelf tags, the label paper background occupies >60% of pixels.
    // If the label is housed in an anti-theft plastic casing or framed by shelf shadows,
    // the borders are dark even though the label itself is white paper.
    // Measuring the median and dominant mode of the entire region reflects the true label background.
    let cumulative = 0;
    let medianLum = 128;
    for (let i = 0; i < 256; i++) {
      cumulative += hist[i];
      if (cumulative >= numPixels * 0.5) {
        medianLum = i;
        break;
      }
    }

    // Find dominant histogram peak using a smoothed 5-bucket window
    let maxPeakWeight = 0;
    let dominantPeakLum = medianLum;
    for (let i = 2; i < 254; i++) {
      const windowSum = hist[i - 2] + hist[i - 1] + hist[i] + hist[i + 1] + hist[i + 2];
      if (windowSum > maxPeakWeight) {
        maxPeakWeight = windowSum;
        dominantPeakLum = i;
      }
    }

    // If the dominant background / median is light (> 110), keep dark-on-light!
    // Only invert if the true background of the label is genuinely dark (< 110).
    const isDarkBackground = medianLum < 110 && dominantPeakLum < 110;

    // 3. Dynamic contrast stretching (2nd to 98th percentile)
    let pCumulative = 0;
    let p2 = 0;
    let p98 = 255;
    const p2Target = numPixels * 0.02;
    const p98Target = numPixels * 0.98;

    for (let i = 0; i < 256; i++) {
      pCumulative += hist[i];
      if (pCumulative >= p2Target && p2 === 0) {
        p2 = i;
      }
      if (pCumulative >= p98Target) {
        p98 = i;
        break;
      }
    }

    const pRange = p98 - p2;

    // 4. Smooth grayscale contrast enhancement (preserves text glyphs and prevents
    // aggressive thresholding artifacts under plastic reflections, glare, and shadows)
    for (let i = 0, j = 0; i < len; i += 4, j++) {
      const orig = grays[j];
      let stretched = pRange > 20
        ? Math.min(255, Math.max(0, Math.round(((orig - p2) / pRange) * 255)))
        : orig;

      // Invert only if the background was genuinely dark, so Tesseract gets dark text on light background
      if (isDarkBackground) {
        stretched = 255 - stretched;
      }

      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
      data[i + 3] = 255;
    }

    outputCtx.putImageData(imageData, 0, 0);
    return outputCanvas;
  } catch (err) {
    // If canvas is tainted or throws in non-DOM/sandboxed environments, return source safely
    return sourceCanvas;
  }
}

/**
 * Performs on-device OCR on the provided HTMLCanvasElement and extracts the shelf price.
 * Safely handles environments without Web Workers, unmounted elements or recognition errors.
 */
export async function recognizePriceFromCanvas(
  canvas: HTMLCanvasElement
): Promise<{ text: string; price: Money | null }> {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return { text: '', price: null };
  }

  try {
    const worker = await getOcrWorker();
    if (!worker) {
      return { text: '', price: null };
    }

    const result = await worker.recognize(canvas);
    const text = result?.data?.text || '';
    const price = ShelfPriceOcrParser.extractBestPrice(text);

    return { text, price };
  } catch (err) {
    console.warn('OnDeviceOcrService: OCR processing failed:', err);
    return { text: '', price: null };
  }
}

/**
 * Performs on-device OCR on the provided HTMLCanvasElement and extracts supermarket shelf tag data (name & price).
 * Preprocesses the canvas image for optimal contrast and text recognition.
 */
export async function recognizeShelfTagFromCanvas(
  canvas: HTMLCanvasElement
): Promise<{ text: string; tag: ShelfTagResult | null }> {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return { text: '', tag: null };
  }

  try {
    const worker = await getOcrWorker();
    if (!worker) {
      return { text: '', tag: null };
    }

    const preprocessedCanvas = preprocessShelfTagCanvas(canvas);
    const result = await worker.recognize(preprocessedCanvas);
    const text = result?.data?.text || '';
    const tag = ShelfTagOcrParser.parse(text);

    return { text, tag };
  } catch (err) {
    console.warn('OnDeviceOcrService: Shelf tag OCR processing failed:', err);
    return { text: '', tag: null };
  }
}

export const OnDeviceOcrService = {
  recognizePriceFromCanvas,
  recognizeShelfTagFromCanvas,
  preprocessShelfTagCanvas,
  getOcrWorker,
  terminateOcrWorker,
  setOcrWorkerForTesting,
  SHELF_TAG_CHAR_WHITELIST,
};
