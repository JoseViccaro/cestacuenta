import { describe, it, expect } from 'vitest';
import { ShelfPriceOcrParser, parsePriceCandidates, extractBestPrice } from '../../src/domain/services/ShelfPriceOcrParser.js';
import { Money } from '../../src/domain/value-objects/Money.js';

describe('ShelfPriceOcrParser', () => {
  describe('extractBestPrice', () => {
    it('extracts simple price with euro symbol: "1,45 €"', () => {
      const price = extractBestPrice('1,45 €');
      expect(price).not.toBeNull();
      expect(price?.cents).toBe(145);
      expect(price?.equals(Money.fromCents(145))).toBe(true);
    });

    it('extracts price with dot separator: "2.99 €"', () => {
      const price = extractBestPrice('2.99 €');
      expect(price).not.toBeNull();
      expect(price?.cents).toBe(299);
      expect(price?.equals(Money.fromCents(299))).toBe(true);
    });

    it('extracts price from descriptive supermarket shelf tag: "LECHE ENTERA 1,05 €"', () => {
      const price = extractBestPrice('LECHE ENTERA 1,05 €');
      expect(price).not.toBeNull();
      expect(price?.cents).toBe(105);
      expect(price?.equals(Money.fromCents(105))).toBe(true);
    });

    it('prioritizes item unit price over price-per-kilo in "1,99 € (3,98 €/kg)"', () => {
      const price = extractBestPrice('1,99 € (3,98 €/kg)');
      expect(price).not.toBeNull();
      expect(price?.cents).toBe(199);
      expect(price?.equals(Money.fromCents(199))).toBe(true);
    });

    it('ignores EAN-13 barcode and extracts price from mixed text', () => {
      const price = extractBestPrice('8410128001025 LECHE DESNATADA 1,25 €');
      expect(price).not.toBeNull();
      expect(price?.cents).toBe(125);
      expect(price?.equals(Money.fromCents(125))).toBe(true);
    });

    it('ignores 8-digit and 12-digit barcodes', () => {
      const price8 = extractBestPrice('84101280 GALLETAS 0,85 €');
      expect(price8?.cents).toBe(85);

      const price12 = extractBestPrice('012345678905 ACEITE 4,99 €');
      expect(price12?.cents).toBe(499);
    });

    it('returns null for text without valid numbers', () => {
      expect(extractBestPrice('TEXTO SIN NUMEROS VALIDOS')).toBeNull();
      expect(extractBestPrice('SUPERMERCADO DIA')).toBeNull();
      expect(extractBestPrice('')).toBeNull();
    });

    it('extracts standalone decimal prices without currency: "1,45" and "2.99"', () => {
      const price1 = extractBestPrice('1,45');
      expect(price1?.cents).toBe(145);

      const price2 = extractBestPrice('2.99');
      expect(price2?.cents).toBe(299);
    });

    it('extracts promotional offer price: "Oferta 3,20 €/ud"', () => {
      const price = extractBestPrice('Oferta 3,20 €/ud');
      expect(price).not.toBeNull();
      expect(price?.cents).toBe(320);
    });

    it('extracts price with currency directly appended: "12,50€"', () => {
      const price = extractBestPrice('12,50€');
      expect(price).not.toBeNull();
      expect(price?.cents).toBe(1250);
    });

    it('does not confuse volume and weight measures with prices (e.g. 1L, 500g, pack 4x125g)', () => {
      const price = extractBestPrice('LECHE DESNATADA 1L 0,95 €');
      expect(price?.cents).toBe(95);

      const yogurtPrice = extractBestPrice('YOGUR FRESA PACK 4X125G 1,75 €');
      expect(yogurtPrice?.cents).toBe(175);

      const coffeePrice = extractBestPrice('CAFE MOLIDO 500g 2,40 €');
      expect(coffeePrice?.cents).toBe(240);
    });
  });

  describe('parsePriceCandidates', () => {
    it('detects multiple valid candidates from shelf tag with unit price and per-kilo price', () => {
      const candidates = parsePriceCandidates('1,99 € (3,98 €/kg)');
      expect(candidates.length).toBeGreaterThanOrEqual(2);

      const itemCandidate = candidates.find((c) => c.money.cents === 199);
      expect(itemCandidate).toBeDefined();
      expect(itemCandidate?.isLikelyPrice).toBe(true);

      const kiloCandidate = candidates.find((c) => c.money.cents === 398);
      expect(kiloCandidate).toBeDefined();
      expect(kiloCandidate?.isLikelyPrice).toBe(true);
    });

    it('ignores barcodes in candidate extraction', () => {
      const candidates = parsePriceCandidates('8410128001025 LECHE 1,25 €');
      expect(candidates.length).toBe(1);
      expect(candidates[0].money.cents).toBe(125);
      expect(candidates[0].isLikelyPrice).toBe(true);
    });

    it('handles object wrapper ShelfPriceOcrParser correctly', () => {
      const price = ShelfPriceOcrParser.extractBestPrice('0,89 €');
      expect(price?.cents).toBe(89);

      const candidates = ShelfPriceOcrParser.parsePriceCandidates('0,89 €');
      expect(candidates.length).toBe(1);
      expect(candidates[0].money.cents).toBe(89);
    });
  });
});
