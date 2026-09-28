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
 * Preprocesses a shelf tag camera crop for optimal OCR accuracy.
 * Enhances contrast and converts to grayscale / thresholded binarization
 * so that dark text on colored supermarket tags (orange, red, yellow) is easily readable.
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
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;

    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) {
      return sourceCanvas;
    }

    const imageData = sourceCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const len = data.length;

    // First pass: Calculate luminance and dynamic range
    let minL = 255;
    let maxL = 0;
    const grays = new Uint8Array(len / 4);

    for (let i = 0, j = 0; i < len; i += 4, j++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Perceptual luminance Rec. 601
      const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      grays[j] = l;
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }

    // Dynamic contrast thresholding:
    // If contrast range is decent, use dynamic split, otherwise default mid-level
    const range = maxL - minL;
    const threshold = range > 30 ? minL + range * 0.52 : 128;

    for (let i = 0, j = 0; i < len; i += 4, j++) {
      const gray = grays[j];
      // Dark printed text on light background -> black (0), background -> white (255)
      const val = gray < threshold ? 0 : 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
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
