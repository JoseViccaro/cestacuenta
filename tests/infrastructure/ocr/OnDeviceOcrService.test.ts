import { describe, it, expect, afterEach } from 'vitest';
import {
  recognizePriceFromCanvas,
  setOcrWorkerForTesting,
  terminateOcrWorker,
} from '../../../src/infrastructure/ocr/OnDeviceOcrService.js';
import { Worker } from 'tesseract.js';

describe('OnDeviceOcrService', () => {
  afterEach(async () => {
    await terminateOcrWorker();
  });

  it('safely returns empty text and null price when canvas is null/undefined', async () => {
    // @ts-expect-error testing invalid canvas input
    const result = await recognizePriceFromCanvas(null);
    expect(result).toEqual({ text: '', price: null });
  });

  it('safely returns fallback in Node/test environment without Worker', async () => {
    // In Node test environment, Worker is undefined
    const mockCanvas = {
      getContext: () => null,
    } as unknown as HTMLCanvasElement;

    const result = await recognizePriceFromCanvas(mockCanvas);
    expect(result).toEqual({ text: '', price: null });
  });

  it('extracts price correctly when worker recognizes shelf tag text', async () => {
    // Provide a mocked Worker instance
    const mockWorker = {
      recognize: async () => ({
        data: {
          text: 'LECHE SEMIDESNATADA 1,19 €',
        },
      }),
      terminate: async () => {},
    } as unknown as Worker;

    // Simulate browser canvas environment
    const mockCanvas = {
      getContext: () => ({}),
    } as unknown as HTMLCanvasElement;

    try {
      setOcrWorkerForTesting(mockWorker);

      const result = await recognizePriceFromCanvas(mockCanvas);
      expect(result.text).toBe('LECHE SEMIDESNATADA 1,19 €');
      expect(result.price).not.toBeNull();
      expect(result.price?.cents).toBe(119);
    } finally {
      setOcrWorkerForTesting(null);
    }
  });

  it('handles OCR errors gracefully and returns fallback', async () => {
    const mockWorker = {
      recognize: async () => {
        throw new Error('WASM crash simulation');
      },
      terminate: async () => {},
    } as unknown as Worker;

    const mockCanvas = {
      getContext: () => ({}),
    } as unknown as HTMLCanvasElement;

    try {
      setOcrWorkerForTesting(mockWorker);

      const result = await recognizePriceFromCanvas(mockCanvas);
      expect(result).toEqual({ text: '', price: null });
    } finally {
      setOcrWorkerForTesting(null);
    }

  });
});
