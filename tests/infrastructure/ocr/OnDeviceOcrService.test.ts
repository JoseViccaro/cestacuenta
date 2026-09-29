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

    it('does not invert image when borders are dark (anti-theft casing) but label is white paper', () => {
      const w = 600;
      const h = 600;
      const numPixels = w * h;
      const mockData = new Uint8ClampedArray(numPixels * 4);

      // Borders (first/last 30 rows/cols) are dark casing (r=30, g=30, b=30)
      // Interior (>60% of pixels) is white label paper (r=240, g=240, b=240)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const isBorder = x < 30 || x >= w - 30 || y < 30 || y >= h - 30;
          const val = isBorder ? 30 : 240;
          mockData[idx] = val;
          mockData[idx + 1] = val;
          mockData[idx + 2] = val;
          mockData[idx + 3] = 255;
        }
      }

      let putDataResult: Uint8ClampedArray | null = null;
      const mockOutputCtx = {
        drawImage: () => {},
        getImageData: () => ({ data: mockData }),
        putImageData: (imgData: { data: Uint8ClampedArray }) => {
          putDataResult = imgData.data;
        },
      };

      const mockOutputCanvas = {
        width: w,
        height: h,
        getContext: () => mockOutputCtx,
      };

      const originalDoc = globalThis.document;
      // @ts-expect-error mocking document for node test
      globalThis.document = {
        createElement: (tag: string) => (tag === 'canvas' ? mockOutputCanvas : null),
      };

      try {
        const sourceCanvas = {
          width: w,
          height: h,
          getContext: () => mockOutputCtx,
        } as unknown as HTMLCanvasElement;

        const result = preprocessShelfTagCanvas(sourceCanvas);
        expect(result).toBe(mockOutputCanvas);
        expect(putDataResult).not.toBeNull();

        // Center pixel should remain bright (>200), NOT inverted into black (<50)!
        const centerIdx = (300 * w + 300) * 4;
        expect(putDataResult![centerIdx]).toBeGreaterThan(200);
      } finally {
        globalThis.document = originalDoc;
      }
    });

    it('inverts image when label background is genuinely dark (light text on dark tag)', () => {
      const w = 600;
      const h = 600;
      const numPixels = w * h;
      const mockData = new Uint8ClampedArray(numPixels * 4);

      // Background (80% of pixels) is dark tag (r=25, g=25, b=25)
      // Text (20% of pixels) is white (r=240, g=240, b=240)
      for (let i = 0; i < numPixels; i++) {
        const idx = i * 4;
        const isText = i % 5 === 0;
        const val = isText ? 240 : 25;
        mockData[idx] = val;
        mockData[idx + 1] = val;
        mockData[idx + 2] = val;
        mockData[idx + 3] = 255;
      }

      let putDataResult: Uint8ClampedArray | null = null;
      const mockOutputCtx = {
        drawImage: () => {},
        getImageData: () => ({ data: mockData }),
        putImageData: (imgData: { data: Uint8ClampedArray }) => {
          putDataResult = imgData.data;
        },
      };

      const mockOutputCanvas = {
        width: w,
        height: h,
        getContext: () => mockOutputCtx,
      };

      const originalDoc = globalThis.document;
      // @ts-expect-error mocking document for node test
      globalThis.document = {
        createElement: (tag: string) => (tag === 'canvas' ? mockOutputCanvas : null),
      };

      try {
        const sourceCanvas = {
          width: w,
          height: h,
          getContext: () => mockOutputCtx,
        } as unknown as HTMLCanvasElement;

        const result = preprocessShelfTagCanvas(sourceCanvas);
        expect(result).toBe(mockOutputCanvas);
        expect(putDataResult).not.toBeNull();

        // Background pixels (started at 25) should now be inverted into bright (>180)
        const bgIdx = 1 * 4;
        expect(putDataResult![bgIdx]).toBeGreaterThan(180);
      } finally {
        globalThis.document = originalDoc;
      }
    });

    it('clamps large canvas crops (e.g. 1200x800) to max dimension 720px (720x480)', () => {
      const w = 1200;
      const h = 800;
      let outputW = 0;
      let outputH = 0;

      const mockOutputCtx = {
        drawImage: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(720 * 480 * 4) }),
        putImageData: () => {},
      };

      const mockOutputCanvas = {
        set width(val: number) {
          outputW = val;
        },
        get width() {
          return outputW;
        },
        set height(val: number) {
          outputH = val;
        },
        get height() {
          return outputH;
        },
        getContext: () => mockOutputCtx,
      };

      const originalDoc = globalThis.document;
      // @ts-expect-error mocking document for node test
      globalThis.document = {
        createElement: (tag: string) => (tag === 'canvas' ? mockOutputCanvas : null),
      };

      try {
        const sourceCanvas = {
          width: w,
          height: h,
          getContext: () => mockOutputCtx,
        } as unknown as HTMLCanvasElement;

        const result = preprocessShelfTagCanvas(sourceCanvas);
        expect(result).toBe(mockOutputCanvas);
        expect(outputW).toBe(720);
        expect(outputH).toBe(480);
      } finally {
        globalThis.document = originalDoc;
      }
    });
  });
});

