import { describe, it, expect, afterEach } from 'vitest';
import {
  recognizePriceFromCanvas,
  recognizeShelfTagFromCanvas,
  preprocessShelfTagCanvas,
  setOcrWorkerForTesting,
  terminateOcrWorker,
} from '../../../src/infrastructure/ocr/OnDeviceOcrService.js';
import { Worker } from 'tesseract.js';

describe('OnDeviceOcrService', () => {
  afterEach(async () => {
    await terminateOcrWorker();
  });

  describe('recognizePriceFromCanvas', () => {
    it('safely returns empty text and null price when canvas is null/undefined', async () => {
      // @ts-expect-error testing invalid canvas input
      const result = await recognizePriceFromCanvas(null);
      expect(result).toEqual({ text: '', price: null });
    });

    it('safely returns fallback in Node/test environment without Worker', async () => {
      const mockCanvas = {
        getContext: () => null,
      } as unknown as HTMLCanvasElement;

      const result = await recognizePriceFromCanvas(mockCanvas);
      expect(result).toEqual({ text: '', price: null });
    });

    it('extracts price correctly when worker recognizes shelf tag text', async () => {
      const mockWorker = {
        recognize: async () => ({
          data: {
            text: 'LECHE SEMIDESNATADA 1,19 €',
          },
        }),
        terminate: async () => {},
      } as unknown as Worker;

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

  describe('recognizeShelfTagFromCanvas', () => {
    it('safely returns empty text and null tag when canvas is null/undefined', async () => {
      // @ts-expect-error testing invalid canvas input
      const result = await recognizeShelfTagFromCanvas(null);
      expect(result).toEqual({ text: '', tag: null });
    });

    it('extracts shelf tag (name & price) correctly when worker recognizes text', async () => {
      const mockWorker = {
        recognize: async () => ({
          data: {
            text: 'STICK DENTAL\nCOMPY 208 g\n1,75 €\n1 KILO: 8,414 €\n238120',
          },
        }),
        terminate: async () => {},
      } as unknown as Worker;

      const mockCanvas = {
        getContext: () => null,
      } as unknown as HTMLCanvasElement;

      try {
        setOcrWorkerForTesting(mockWorker);

        const result = await recognizeShelfTagFromCanvas(mockCanvas);
        expect(result.tag).not.toBeNull();
        expect(result.tag?.name).toBe('STICK DENTAL COMPY 208 g');
        expect(result.tag?.price.cents).toBe(175);
        expect(result.tag?.unitRate).toBe('1 KILO: 8,414 €');
        expect(result.tag?.internalCode).toBe('238120');
      } finally {
        setOcrWorkerForTesting(null);
      }
    });

    it('handles OCR errors in shelf tag recognition gracefully', async () => {
      const mockWorker = {
        recognize: async () => {
          throw new Error('Worker crash');
        },
        terminate: async () => {},
      } as unknown as Worker;

      const mockCanvas = {
        getContext: () => null,
      } as unknown as HTMLCanvasElement;

      try {
        setOcrWorkerForTesting(mockWorker);

        const result = await recognizeShelfTagFromCanvas(mockCanvas);
        expect(result).toEqual({ text: '', tag: null });
      } finally {
        setOcrWorkerForTesting(null);
      }
    });
  });

  describe('preprocessShelfTagCanvas', () => {
    it('returns canvas safely if null or undefined', () => {
      // @ts-expect-error testing invalid input
      expect(preprocessShelfTagCanvas(null)).toBeNull();
    });

    it('handles canvas without 2D context safely', () => {
      const mockCanvas = {
        width: 100,
        height: 50,
        getContext: () => null,
      } as unknown as HTMLCanvasElement;

      const result = preprocessShelfTagCanvas(mockCanvas);
      expect(result).toBe(mockCanvas);
    });
  });
});
