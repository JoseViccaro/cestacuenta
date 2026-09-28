import { describe, it, expect } from 'vitest';
import {
  ShelfTagOcrParser,
  parseShelfTag,
  extractPrice,
  extractName,
  extractUnitRate,
  extractInternalCode,
} from '../../../src/domain/services/ShelfTagOcrParser.js';
import { Money } from '../../../src/domain/value-objects/Money.js';

describe('ShelfTagOcrParser', () => {
  describe('Mercadona actual shelf tag tests', () => {
    it('correctly parses Label 1: Salsa Salmón Perros', () => {
      const text = 'SALSA SALMÓN PERROS\nCOMPY 260 g\n1,50 €\n1 KILO: 5,769 €\n098335';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toContain('SALSA SALMÓN PERROS');
      expect(result?.name).toBe('SALSA SALMÓN PERROS COMPY 260 g');
      expect(result?.price.cents).toBe(150);
      expect(result?.price.equals(Money.fromCents(150))).toBe(true);
      expect(result?.unitRate).toBe('1 KILO: 5,769 €');
      expect(result?.internalCode).toBe('098335');
    });

    it('correctly parses Label 2: Stick Dental', () => {
      const text = 'STICK DENTAL\nCOMPY 208 g\n1,75 €\n1 KILO: 8,414 €\n238120';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toContain('STICK DENTAL');
      expect(result?.name).toBe('STICK DENTAL COMPY 208 g');
      expect(result?.price.cents).toBe(175);
      expect(result?.price.equals(Money.fromCents(175))).toBe(true);
      expect(result?.unitRate).toBe('1 KILO: 8,414 €');
      expect(result?.internalCode).toBe('238120');
    });

    it('correctly parses Label 3: C. Gall Poll y Tern with decimal weight', () => {
      const text = 'C. GALL POLL Y TERN\nCOMPY 1,2 kg\n1,95 €\n1 KILO: 1,625 €\n707633';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toContain('C. GALL POLL Y TERN');
      expect(result?.name).toBe('C. GALL POLL Y TERN COMPY 1,2 kg');
      expect(result?.price.cents).toBe(195);
      expect(result?.price.equals(Money.fromCents(195))).toBe(true);
      expect(result?.unitRate).toBe('1 KILO: 1,625 €');
      expect(result?.internalCode).toBe('707633');
    });
  });

  describe('Edge cases and variations', () => {
    it('handles inverted lines (bottom-up scan order)', () => {
      const invertedText = '707633\n1 KILO: 1,625 €\n1,95 €\nCOMPY 1,2 kg\nC. GALL POLL Y TERN';
      const result = parseShelfTag(invertedText);

      expect(result).not.toBeNull();
      expect(result?.name).toContain('C. GALL POLL Y TERN');
      expect(result?.name).toBe('C. GALL POLL Y TERN COMPY 1,2 kg');
      expect(result?.price.cents).toBe(195);
      expect(result?.internalCode).toBe('707633');
      expect(result?.unitRate).toBe('1 KILO: 1,625 €');
    });

    it('handles multi-line product names (3+ lines)', () => {
      const text = 'GALLETAS DE AVENA\nCON CHOCOLATE NEGRO\nY NARANJA\nHACENDADO 300 g\n2,15 €\n1 KILO: 7,167 €\n123456';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('GALLETAS DE AVENA CON CHOCOLATE NEGRO Y NARANJA HACENDADO 300 g');
      expect(result?.price.cents).toBe(215);
      expect(result?.internalCode).toBe('123456');
    });

    it('returns null when price is missing', () => {
      const textWithoutPrice = 'STICK DENTAL\nCOMPY 208 g\n098335';
      const result = parseShelfTag(textWithoutPrice);
      expect(result).toBeNull();

      expect(extractPrice(textWithoutPrice)).toBeNull();
      expect(extractName(textWithoutPrice)).toBe('STICK DENTAL COMPY 208 g');
    });

    it('returns null when product name is missing', () => {
      const textWithoutName = '1,50 €\n1 KILO: 5,769 €\n098335';
      const result = parseShelfTag(textWithoutName);
      expect(result).toBeNull();

      expect(extractPrice(textWithoutName)?.cents).toBe(150);
      expect(extractName(textWithoutName)).toBeNull();
    });

    it('returns null for empty, blank or invalid inputs', () => {
      expect(parseShelfTag('')).toBeNull();
      // @ts-expect-error testing runtime safety
      expect(parseShelfTag(null)).toBeNull();
      // @ts-expect-error testing runtime safety
      expect(parseShelfTag(undefined)).toBeNull();
      expect(parseShelfTag('   \n  \t  ')).toBeNull();
    });

    it('strips supermarket headers and regulatory noise lines from name', () => {
      const text = 'MERCADONA, S.A.\nPVP IVA INCLUIDO\nLECHE ENTERA HACENDADO 1L\n0,95 €\n1 LITRO: 0,95 €\n345678';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('LECHE ENTERA HACENDADO 1L');
      expect(result?.price.cents).toBe(95);
    });

    it('works with ShelfTagOcrParser object wrapper methods', () => {
      const text = 'STICK DENTAL\nCOMPY 208 g\n1,75 €\n1 KILO: 8,414 €\n238120';
      const result = ShelfTagOcrParser.parse(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('STICK DENTAL COMPY 208 g');
      expect(ShelfTagOcrParser.extractPrice(text)?.cents).toBe(175);
      expect(ShelfTagOcrParser.extractName(text)).toBe('STICK DENTAL COMPY 208 g');
      expect(ShelfTagOcrParser.extractUnitRate(text)).toBe('1 KILO: 8,414 €');
      expect(ShelfTagOcrParser.extractInternalCode(text)).toBe('238120');
    });
  });
});
