import { createWorker, Worker } from 'tesseract.js';
import { Money, ShelfPriceOcrParser } from '../../domain/index.js';

let workerInstance: Worker | null = null;
let workerInitPromise: Promise<Worker | null> | null = null;

/**
 * Initializes and caches a singleton Tesseract.js Worker instance.
 * Restricts character whitelist to price characters for maximum performance and accuracy.
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

        // Configure strict whitelist for supermarket shelf price reading
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789,.-€EURpvpPVP /kgud',
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


export const OnDeviceOcrService = {
  recognizePriceFromCanvas,
  getOcrWorker,
  terminateOcrWorker,
  setOcrWorkerForTesting,
};
