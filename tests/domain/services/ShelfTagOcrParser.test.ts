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
  describe('Supermarket chains in Spain & Europe', () => {
    it('correctly parses Carrefour shelf tags', () => {
      const text = 'LECHE ENTERA CARREFOUR 1L\n1,05 €\n( 1,05 € / l )\nREF 482910';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('LECHE ENTERA CARREFOUR 1L');
      expect(result?.price.cents).toBe(105);
      expect(result?.price.equals(Money.fromCents(105))).toBe(true);
      expect(result?.unitRate).toBe('( 1,05 € / l )');
      expect(result?.internalCode).toBe('482910');
    });

    it('correctly parses Lidl shelf tags', () => {
      const text = 'GALLETAS CHOCOLATE SONDEY\n1,89 €\n1 kg = 3,78 €\nART 84729';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('GALLETAS CHOCOLATE SONDEY');
      expect(result?.price.cents).toBe(189);
      expect(result?.price.equals(Money.fromCents(189))).toBe(true);
      expect(result?.unitRate).toBe('1 kg = 3,78 €');
      expect(result?.internalCode).toBe('84729');
    });

    it('correctly parses Dia shelf tags with date and PVP/KG', () => {
      const text = 'ARROZ REDONDO DIA 1KG\n1,35 €\nPVP/KG: 1,35 €\n01/02/2026';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('ARROZ REDONDO DIA 1KG');
      expect(result?.price.cents).toBe(135);
      expect(result?.price.equals(Money.fromCents(135))).toBe(true);
      expect(result?.unitRate).toBe('PVP/KG: 1,35 €');
    });

    it('correctly parses Mercadona shelf tags', () => {
      const text = 'STICK DENTAL COMPY 208 g\n1,75 €\n1 KILO: 8,414 €\n238120';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('STICK DENTAL COMPY 208 g');
      expect(result?.price.cents).toBe(175);
      expect(result?.price.equals(Money.fromCents(175))).toBe(true);
      expect(result?.unitRate).toBe('1 KILO: 8,414 €');
      expect(result?.internalCode).toBe('238120');
    });

    it('correctly parses Alcampo, Aldi and Eroski shelf tags with unit rate slash format', () => {
      const text = 'ACEITE DE OLIVA VIRGEN EXTRA 1L\n8,95 €\n8,95 €/L';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('ACEITE DE OLIVA VIRGEN EXTRA 1L');
      expect(result?.price.cents).toBe(895);
      expect(result?.price.equals(Money.fromCents(895))).toBe(true);
      expect(result?.unitRate).toBe('8,95 €/L');
    });

    it('correctly parses Consum and Ahorramas tags with pack indicators', () => {
      const text = 'CONSUM\nYOGUR NATURAL PACK 4 500 g\n1,20 €\n1 KILO: 2,40 €\nART. 92831';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('YOGUR NATURAL PACK 4 500 g');
      expect(result?.price.cents).toBe(120);
      expect(result?.unitRate).toBe('1 KILO: 2,40 €');
      expect(result?.internalCode).toBe('92831');
    });
  });

  describe('Promotions and Offers parsing', () => {
    it('correctly selects current price over "ANTES" price in offer tags', () => {
      const text = 'ANTES 2,49 €\nAHORA 1,99 €\nDESODORANTE NIVEA';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('DESODORANTE NIVEA');
      expect(result?.price.cents).toBe(199);
      expect(result?.price.equals(Money.fromCents(199))).toBe(true);
    });

    it('handles "PRECIO CLUB" discount tags', () => {
      const text = 'PRECIO CLUB 1,99 €\nANTES: 2,49 €\nDESODORANTE NIVEA';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('DESODORANTE NIVEA');
      expect(result?.price.cents).toBe(199);
    });

    it('handles promotional header with store logo', () => {
      const text = 'CARREFOUR\nOFERTA\nANTES 2,49 €\nAHORA 1,99 €\nDESODORANTE NIVEA 50ML';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('DESODORANTE NIVEA 50ML');
      expect(result?.price.cents).toBe(199);
    });

    it('handles "ERA ... AHORA ..." format', () => {
      const text = 'DESODORANTE NIVEA\nERA 2,49 €\nAHORA 1,99 €';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('DESODORANTE NIVEA');
      expect(result?.price.cents).toBe(199);
    });
  });

  describe('Robust Unit Rate Discarding', () => {
    it('detects and discards various unit rate variants without mistaking them for selling prices', () => {
      const variants = [
        '1 KILO: 8,414 €',
        '1 kg = 3,78 €',
        '( 1,05 € / l )',
        'PVP/KG: 1,35 €',
        'PRECIO/L: 1,05 €',
        '8,95 €/L',
        '0,50 €/ud',
        '100 g: 0,85 €',
        '1 LITRO: 1,50 €',
        '( 2,50 € / kg )',
      ];

      for (const unitRateStr of variants) {
        const text = `PRODUCTO TEST 250 g\n2,99 €\n${unitRateStr}\n123456`;
        const result = parseShelfTag(text);
        expect(result).not.toBeNull();
        expect(result?.price.cents).toBe(299);
        expect(result?.name).toBe('PRODUCTO TEST 250 g');
        expect(extractUnitRate(text)).not.toBeNull();
      }
    });
  });

  describe('Robust Name Cleansing & Noise Filtering', () => {
    it('strips supermarket logos and boilerplate', () => {
      const noiseLines = [
        'CARREFOUR',
        'MERCADONA, S.A.',
        'LIDL',
        'DIA',
        'ALCAMPO',
        'ALDI',
        'EROSKI',
        'CONSUM',
        'AHORRAMAS',
        'PRECIO CLUB',
        'IVA INCLUIDO',
        'SUGERENCIA DE PRESENTACIÓN',
      ];

      for (const noise of noiseLines) {
        const text = `${noise}\nCAFE MOLIDO NATURAL 250 g\n2,45 €\n1 KILO: 9,80 €\nREF 44921`;
        const result = parseShelfTag(text);
        expect(result).not.toBeNull();
        expect(result?.name).toBe('CAFE MOLIDO NATURAL 250 g');
        expect(result?.price.cents).toBe(245);
      }
    });

    it('strips internal codes (REF 123456, ART 98765, 238120)', () => {
      const tag1 = parseShelfTag('GALLETAS TOSTADAS 800 g\n1,60 €\nREF 123456');
      expect(tag1?.name).toBe('GALLETAS TOSTADAS 800 g');
      expect(tag1?.internalCode).toBe('123456');

      const tag2 = parseShelfTag('GALLETAS TOSTADAS 800 g\n1,60 €\nART 98765');
      expect(tag2?.name).toBe('GALLETAS TOSTADAS 800 g');
      expect(tag2?.internalCode).toBe('98765');

      const tag3 = parseShelfTag('GALLETAS TOSTADAS 800 g\n1,60 €\n238120');
      expect(tag3?.name).toBe('GALLETAS TOSTADAS 800 g');
      expect(tag3?.internalCode).toBe('238120');
    });

    it('retains brand, product description, and package size/weight', () => {
      const text = 'CERVEZA MAHOU CINCO ESTRELLAS PACK 6 33CL\n4,50 €\n1 LITRO: 2,27 €';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('CERVEZA MAHOU CINCO ESTRELLAS PACK 6 33CL');
      expect(result?.price.cents).toBe(450);
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

  describe('Retail & Electronics shelf tags (Pendrives, Hardware, Tech)', () => {
    it('correctly parses real-world Kingston pendrive tag with store logo and service header', () => {
      const text = 'prink\nDirepar...\nPENDRIVE\n128 GB\n€ 29,46';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('PENDRIVE 128 GB');
      expect(result?.price.cents).toBe(2946);
      expect(result?.price.format()).toBe('29,46 €');
      expect(result?.price.equals(Money.fromCents(2946))).toBe(true);
    });

    it('correctly extracts various European currency format positions (€ 29,46, €29.46, 29,46€, 29.46 EUR)', () => {
      const variants = [
        'PENDRIVE 128 GB\n€ 29,46',
        'PENDRIVE 128 GB\n€29.46',
        'PENDRIVE 128 GB\n29,46€',
        'PENDRIVE 128 GB\n29.46 EUR',
      ];

      for (const raw of variants) {
        const result = parseShelfTag(raw);
        expect(result).not.toBeNull();
        expect(result?.name).toBe('PENDRIVE 128 GB');
        expect(result?.price.cents).toBe(2946);
      }
    });

    it('supports tech capacities and ratings: GB, TB, MB, USB, W, V, MAH, PACK', () => {
      const techTags = [
        {
          text: 'MEDIAMARKT\nDISCO SSD EXTERNO 2 TB\n89,90 €',
          expectedName: 'DISCO SSD EXTERNO 2 TB',
          expectedCents: 8990,
        },
        {
          text: 'TARJETA MICRO SD 512 MB\n9,95 €',
          expectedName: 'TARJETA MICRO SD 512 MB',
          expectedCents: 995,
        },
        {
          text: 'CARGADOR RAPIDO USB-C 65 W\n€ 19,99',
          expectedName: 'CARGADOR RAPIDO USB-C 65 W',
          expectedCents: 1999,
        },
        {
          text: 'TRANSFORMADOR CORRIENTE 12 V\n14,50 €',
          expectedName: 'TRANSFORMADOR CORRIENTE 12 V',
          expectedCents: 1450,
        },
        {
          text: 'POWERBANK BATERIA 10000 MAH\n€ 22,95',
          expectedName: 'POWERBANK BATERIA 10000 MAH',
          expectedCents: 2295,
        },
        {
          text: 'MEMORIAS USB 3.0 PACK 3\n15,00 €',
          expectedName: 'MEMORIAS USB 3.0 PACK 3',
          expectedCents: 1500,
        },
      ];

      for (const item of techTags) {
        const result = parseShelfTag(item.text);
        expect(result).not.toBeNull();
        expect(result?.name).toBe(item.expectedName);
        expect(result?.price.cents).toBe(item.expectedCents);
      }
    });

    it('filters Dripar... and store logo noise from title', () => {
      const text = 'prink\nDripar...\nPENDRIVE 64 GB USB 3.2\n€ 16,95';
      const result = parseShelfTag(text);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('PENDRIVE 64 GB USB 3.2');
      expect(result?.price.cents).toBe(1695);
    });
  });
});
