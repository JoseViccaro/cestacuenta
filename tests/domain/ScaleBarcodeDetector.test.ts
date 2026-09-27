import { describe, it, expect } from 'vitest';
import {
  isScaleBarcode,
  extractScalePriceCents,
} from '../../src/domain/services/ScaleBarcodeDetector.js';

describe('ScaleBarcodeDetector', () => {
  describe('isScaleBarcode', () => {
    it('returns true for 13-digit EAN barcodes starting with 2 (prefixes 20 to 29)', () => {
      expect(isScaleBarcode('2012345678901')).toBe(true);
      expect(isScaleBarcode('2100123004507')).toBe(true);
      expect(isScaleBarcode('2234567890123')).toBe(true);
      expect(isScaleBarcode('2899999018751')).toBe(true);
      expect(isScaleBarcode('2900000000001')).toBe(true);
    });

    it('returns false for standard non-scale EAN-13 barcodes', () => {
      expect(isScaleBarcode('8410123456789')).toBe(false); // Spain GS1 standard (84)
      expect(isScaleBarcode('5000123456789')).toBe(false); // UK GS1
      expect(isScaleBarcode('3000123456789')).toBe(false); // France GS1
      expect(isScaleBarcode('0123456789012')).toBe(false);
    });

    it('returns false for barcodes with length other than 13 digits', () => {
      expect(isScaleBarcode('21234567')).toBe(false); // 8 digits (EAN-8)
      expect(isScaleBarcode('212345678901')).toBe(false); // 12 digits
      expect(isScaleBarcode('21234567890123')).toBe(false); // 14 digits
      expect(isScaleBarcode('2')).toBe(false);
    });

    it('returns false for null, undefined, empty, or non-numeric strings', () => {
      expect(isScaleBarcode('')).toBe(false);
      expect(isScaleBarcode('   ')).toBe(false);
      expect(isScaleBarcode(null as unknown as string)).toBe(false);
      expect(isScaleBarcode(undefined as unknown as string)).toBe(false);
      expect(isScaleBarcode('2100123A04507')).toBe(false); // contains letter
    });

    it('handles leading and trailing whitespace safely', () => {
      expect(isScaleBarcode('  2100123004507  ')).toBe(true);
    });
  });

  describe('extractScalePriceCents', () => {
    it('extracts price cents correctly from 13-digit scale barcode with 21 prefix', () => {
      // 21 (prefix) + 00123 (product) + 00450 (450 cents = 4.50 €) + 7 (checksum)
      const cents = extractScalePriceCents('2100123004507');
      expect(cents).toBe(450);
    });

    it('extracts higher price correctly from 13-digit scale barcode', () => {
      // 21 (prefix) + 99999 (product) + 01299 (1299 cents = 12.99 €) + 3 (checksum)
      const cents = extractScalePriceCents('2199999012993');
      expect(cents).toBe(1299);
    });

    it('extracts low price correctly (e.g. 85 cents = 0.85 €)', () => {
      // 21 (prefix) + 12345 (product) + 00085 (85 cents) + 1 (checksum)
      const cents = extractScalePriceCents('2112345000851');
      expect(cents).toBe(85);
    });

    it('extracts price from 12-digit format with 21 prefix and 4 price digits', () => {
      // 21 (prefix) + 12345 (product) + 0350 (350 cents = 3.50 €) + 1 (checksum) = 12 digits
      const cents = extractScalePriceCents('211234503501');
      expect(cents).toBe(350);
    });

    it('returns null if barcode does not start with 21', () => {
      expect(extractScalePriceCents('8410123456789')).toBeNull();
      expect(extractScalePriceCents('2012345004507')).toBeNull();
      expect(extractScalePriceCents('2212345004507')).toBeNull();
    });

    it('returns null if price cents are zero or invalid', () => {
      // Price is 00000
      expect(extractScalePriceCents('2100123000007')).toBeNull();
    });

    it('returns null for malformed or empty inputs', () => {
      expect(extractScalePriceCents('')).toBeNull();
      expect(extractScalePriceCents('   ')).toBeNull();
      expect(extractScalePriceCents(null as unknown as string)).toBeNull();
      expect(extractScalePriceCents(undefined as unknown as string)).toBeNull();
      expect(extractScalePriceCents('2100123ABCDE7')).toBeNull();
      expect(extractScalePriceCents('21001')).toBeNull();
    });
  });
});
