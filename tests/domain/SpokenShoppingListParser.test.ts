import { describe, it, expect } from 'vitest';
import {
  SpokenShoppingListParser,
  SpokenParserOptions,
} from '../../src/domain/services/SpokenShoppingListParser.js';

describe('SpokenShoppingListParser', () => {
  describe('Single item dictation and sanitization', () => {
    it('parses a single simple item and capitalizes the first letter', () => {
      expect(SpokenShoppingListParser.parse('plátanos')).toEqual(['Plátanos']);
      expect(SpokenShoppingListParser.parse('leche')).toEqual(['Leche']);
    });

    it('trims leading and trailing whitespace', () => {
      expect(SpokenShoppingListParser.parse('   pan integral   ')).toEqual(['Pan integral']);
    });

    it('returns an empty array for empty, whitespace, null, or undefined input', () => {
      expect(SpokenShoppingListParser.parse('')).toEqual([]);
      expect(SpokenShoppingListParser.parse('   ')).toEqual([]);
      expect(SpokenShoppingListParser.parse(null as unknown as string)).toEqual([]);
      expect(SpokenShoppingListParser.parse(undefined as unknown as string)).toEqual([]);
    });

    it('cleans leading bullet points, dashes, and trailing punctuation', () => {
      expect(SpokenShoppingListParser.parse('- manzanas.')).toEqual(['Manzanas']);
      expect(SpokenShoppingListParser.parse('* peras;')).toEqual(['Peras']);
    });
  });

  describe('Conjunctions and punctuation segmentation', () => {
    it('splits items separated by commas, semicolons, periods, or newlines', () => {
      expect(SpokenShoppingListParser.parse('leche, huevos, pan')).toEqual([
        'Leche',
        'Huevos',
        'Pan',
      ]);
      expect(SpokenShoppingListParser.parse('manzanas; peras; plátanos')).toEqual([
        'Manzanas',
        'Peras',
        'Plátanos',
      ]);
      expect(SpokenShoppingListParser.parse('arroz. garbanzos. lentejas')).toEqual([
        'Arroz',
        'Garbanzos',
        'Lentejas',
      ]);
      expect(SpokenShoppingListParser.parse("yogur\nqueso\nmantequilla")).toEqual([
        'Yogur',
        'Queso',
        'Mantequilla',
      ]);
    });

    it('splits items connected by Spanish conjunction " y "', () => {
      expect(SpokenShoppingListParser.parse('leche y huevos y pan')).toEqual([
        'Leche',
        'Huevos',
        'Pan',
      ]);
      expect(SpokenShoppingListParser.parse('leche, huevos y pan')).toEqual([
        'Leche',
        'Huevos',
        'Pan',
      ]);
    });

    it('splits items connected by Spanish conjunction " e " before words starting with i or hi', () => {
      expect(SpokenShoppingListParser.parse('café e infusiones e higos')).toEqual([
        'Café',
        'Infusiones',
        'Higos',
      ]);
      expect(SpokenShoppingListParser.parse('peras e higos')).toEqual(['Peras', 'Higos']);
    });

    it('does not split on the letter "e" when not followed by i/hi or inside a word', () => {
      // "leche entera" should not be split
      expect(SpokenShoppingListParser.parse('leche entera')).toEqual(['Leche entera']);
      // "tomate" should not be split
      expect(SpokenShoppingListParser.parse('tomate')).toEqual(['Tomate']);
    });

    it('splits items with multi-word Spanish connectors', () => {
      expect(SpokenShoppingListParser.parse('arroz además de tomates también galletas')).toEqual([
        'Arroz',
        'Tomates',
        'Galletas',
      ]);
      expect(SpokenShoppingListParser.parse('pan y también café')).toEqual(['Pan', 'Café']);
    });
  });

  describe('Command prefix stripping', () => {
    it('strips leading conversational commands and politeness markers', () => {
      expect(
        SpokenShoppingListParser.parse('por favor añade a la lista dos paquetes de café')
      ).toEqual(['Dos paquetes de café']);

      expect(SpokenShoppingListParser.parse('añade a la lista leche y galletas')).toEqual([
        'Leche',
        'Galletas',
      ]);

      expect(SpokenShoppingListParser.parse('pon en la lista huevos y aceite')).toEqual([
        'Huevos',
        'Aceite',
      ]);

      expect(SpokenShoppingListParser.parse('apunta en la lista manzanas')).toEqual(['Manzanas']);

      expect(SpokenShoppingListParser.parse('comprar tomates y cebollas')).toEqual([
        'Tomates',
        'Cebollas',
      ]);

      expect(SpokenShoppingListParser.parse('quiero comprar detergente')).toEqual(['Detergente']);

      expect(SpokenShoppingListParser.parse('necesito comprar papel higiénico')).toEqual([
        'Papel higiénico',
      ]);
    });

    it('strips redundant intra-clause command verbs in multi-item dictation', () => {
      expect(
        SpokenShoppingListParser.parse('quiero comprar patatas y comprar pimientos')
      ).toEqual(['Patatas', 'Pimientos']);

      expect(SpokenShoppingListParser.parse('añade pan y añade mantequilla')).toEqual([
        'Pan',
        'Mantequilla',
      ]);
    });

    it('respects stripPrefixes: false option', () => {
      const result = SpokenShoppingListParser.parse('comprar manzanas', {
        stripPrefixes: false,
      });
      expect(result).toEqual(['Comprar manzanas']);
    });
  });

  describe('Compound food preservation', () => {
    it('preserves recognized compound food items with "y"', () => {
      expect(
        SpokenShoppingListParser.parse('jamón y queso, aceite de oliva y sal y pimienta')
      ).toEqual(['Jamón y queso', 'Aceite de oliva', 'Sal y pimienta']);

      expect(SpokenShoppingListParser.parse('fresas con nata y pan y chocolate')).toEqual([
        'Fresas con nata',
        'Pan y chocolate',
      ]);

      expect(SpokenShoppingListParser.parse('café con leche y tostadas')).toEqual([
        'Café con leche',
        'Tostadas',
      ]);
    });

    it('preserves prepositional compounds with "de"', () => {
      expect(SpokenShoppingListParser.parse('aceite de oliva y leche de avena')).toEqual([
        'Aceite de oliva',
        'Leche de avena',
      ]);

      expect(SpokenShoppingListParser.parse('crema de cacao')).toEqual(['Crema de cacao']);
    });

    it('respects protectCompounds: false option', () => {
      const result = SpokenShoppingListParser.parse('sal y pimienta', {
        protectCompounds: false,
      });
      expect(result).toEqual(['Sal', 'Pimienta']);
    });
  });

  describe('Preservation of quantities and units', () => {
    it('preserves numbers, digits, and written quantity words', () => {
      expect(
        SpokenShoppingListParser.parse('2 paquetes de arroz, 3 kilos de patatas y medio melón')
      ).toEqual(['2 paquetes de arroz', '3 kilos de patatas', 'Medio melón']);

      expect(
        SpokenShoppingListParser.parse('tres litros de leche y 4 manzanas')
      ).toEqual(['Tres litros de leche', '4 manzanas']);

      expect(
        SpokenShoppingListParser.parse('un paquete de café y dos barras de pan')
      ).toEqual(['Un paquete de café', 'Dos barras de pan']);
    });
  });

  describe('Complex scenario dictation', () => {
    it('handles realistic natural Spanish dictation accurately', () => {
      const input =
        'Por favor apunta en la lista dos cartones de leche, una docena de huevos, jamón y queso e infusiones';
      const output = SpokenShoppingListParser.parse(input);

      expect(output).toEqual([
        'Dos cartones de leche',
        'Una docena de huevos',
        'Jamón y queso',
        'Infusiones',
      ]);
    });
  });
});
