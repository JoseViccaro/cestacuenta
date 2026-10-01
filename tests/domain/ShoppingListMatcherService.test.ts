import { describe, it, expect } from 'vitest';
import {
  ShoppingListMatcherService,
  findMatch,
  normalizeText,
  extractWords,
  extractSignificantWords,
} from '../../src/domain/services/ShoppingListMatcherService.js';
import { ShoppingListItem } from '../../src/domain/entities/ShoppingListItem.js';

describe('ShoppingListMatcherService', () => {
  const createItem = (name: string, isChecked = false, id = name): ShoppingListItem => {
    return new ShoppingListItem({
      id,
      listId: 'list-1',
      name,
      isChecked,
    });
  };

  describe('Normalization and tokenization helper functions', () => {
    it('converts text to lowercase and strips diacritics/accents', () => {
      expect(normalizeText('Café Con LECHE')).toBe('cafe con leche');
      expect(normalizeText('Plátanos de Canarias')).toBe('platanos de canarias');
      expect(normalizeText('Jamón Ibérico')).toBe('jamon iberico');
      expect(normalizeText('Piña en rodajas')).toBe('pina en rodajas');
    });

    it('removes punctuation and special characters, preserving alphanumeric tokens', () => {
      expect(normalizeText('Coca-Cola (Zero) 1.5L!')).toBe('coca cola zero 1 5l');
      expect(normalizeText('Pack 4x125g / Yogures')).toBe('pack 4x125g yogures');
    });

    it('returns empty string for null, undefined, or empty input', () => {
      expect(normalizeText('')).toBe('');
      expect(normalizeText('   ')).toBe('');
      expect(normalizeText(null as unknown as string)).toBe('');
      expect(normalizeText(undefined as unknown as string)).toBe('');
    });

    it('extracts significant words by filtering out Spanish stop words', () => {
      const words = extractSignificantWords('Café con leche de soja');
      expect(words).toEqual(['cafe', 'leche', 'soja']);
    });

    it('falls back to raw tokens if input contains only stop words', () => {
      const words = extractSignificantWords('de la con');
      expect(words).toEqual(['de', 'la', 'con']);
    });
  });

  describe('findMatch: Exact matching', () => {
    it('matches exact name ignoring case and accents', () => {
      const items = [
        createItem('Plátano'),
        createItem('Manzana'),
      ];

      const match = findMatch('platano', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('Plátano');
    });

    it('matches exact name with punctuation differences', () => {
      const items = [createItem('Coca-Cola Zero')];

      const match = findMatch('Coca Cola Zero', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('Coca-Cola Zero');
    });

    it('prioritizes exact match over partial subset match', () => {
      const items = [
        createItem('Leche'),
        createItem('Leche Entera Pascual'),
      ];

      // Exact match with item 2
      const match = findMatch('leche entera pascual', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('Leche Entera Pascual');
    });
  });

  describe('findMatch: Word subset matching', () => {
    it('matches multi-word item when all significant words exist in cart item (prompt requirement 1)', () => {
      // Prompt example: "leche entera" matches cart item "leche entera pascual 1l"
      const items = [createItem('leche entera')];

      const match = findMatch('leche entera pascual 1l', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('leche entera');
    });

    it('matches single-word item in longer cart item name (prompt requirement 2)', () => {
      // Prompt example: "leche" matches cart item "leche desnatada hacendado"
      const items = [createItem('leche')];

      const match = findMatch('leche desnatada hacendado', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('leche');
    });

    it('matches item with stop words against branded cart item', () => {
      // "pan de molde" has significant words ["pan", "molde"]
      const items = [createItem('pan de molde')];

      const match = findMatch('Pan de Molde Bimbo Sin Corteza 500g', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('pan de molde');
    });

    it('matches regardless of word order', () => {
      const items = [createItem('chocolate negro')];

      const match = findMatch('Tableta Negro Chocolate Lindt 85%', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('chocolate negro');
    });

    it('prefers more specific item (more matched significant words) over generic item', () => {
      const genericItem = createItem('leche', false, 'item-generic');
      const specificItem = createItem('leche desnatada', false, 'item-specific');
      const items = [genericItem, specificItem];

      // "leche desnatada hacendado" contains both "leche" and "desnatada" (2 words vs 1)
      const match = findMatch('leche desnatada hacendado', items);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('item-specific');
      expect(match?.name).toBe('leche desnatada');
    });

    it('does not match if only some significant words are present in cart item', () => {
      // List has "aceite oliva virgen" -> cart has "aceite girasol" (missing "oliva", "virgen")
      const items = [createItem('aceite de oliva virgen')];

      const match = findMatch('Aceite de Girasol Koipesol 1L', items);
      expect(match).toBeNull();
    });

    it('does not match substring within an unrelated word (word boundary respect)', () => {
      // List has "sal" (salt). Cart has "salsa de tomate" (sauce)
      const items = [createItem('sal')];

      const match = findMatch('Salsa de Tomate Orlando', items);
      expect(match).toBeNull();
    });
  });

  describe('findMatch: Dictated quantity stop words matching', () => {
    it('matches item with digit prefix against scanned cart product', () => {
      // Dictated: "2 leche", scanned: "Leche Pascual Entera 1L"
      const items = [createItem('2 leche')];
      const match = findMatch('Leche Pascual Entera 1L', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('2 leche');
    });

    it('matches item with Spanish number words against scanned product', () => {
      // Dictated: "dos paquetes de arroz", scanned: "Arroz SOS Redondo 1kg"
      const items = [createItem('dos paquetes de arroz')];
      const match = findMatch('Arroz SOS Redondo 1kg', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('dos paquetes de arroz');
    });

    it('matches item with quantity digits and multi-word product name', () => {
      // Dictated: "3 manzana fuji", scanned: "Manzana Fuji Bolsa 1.5kg"
      const items = [createItem('3 manzana fuji')];
      const match = findMatch('Manzana Fuji Bolsa 1.5kg', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('3 manzana fuji');
    });

    it('filters out grocery units like medio, kilo, litro from significant words', () => {
      // Dictated: "medio kilo de tomate", scanned: "Tomate En Rama 1kg"
      const items = [createItem('medio kilo de tomate')];
      const match = findMatch('Tomate En Rama 1kg', items);
      expect(match).not.toBeNull();
      expect(match?.name).toBe('medio kilo de tomate');
    });
  });

  describe('findMatch: Invariants and edge cases', () => {
    it('ignores checked items and only matches unchecked items', () => {
      const checkedLeche = createItem('leche', true, 'checked-leche');
      const uncheckedPan = createItem('pan', false, 'unchecked-pan');

      const match = findMatch('Leche Entera Pascual 1L', [checkedLeche, uncheckedPan]);
      expect(match).toBeNull();
    });

    it('matches unchecked duplicate if another copy is already checked', () => {
      const checkedLeche = createItem('leche', true, 'item-1');
      const uncheckedLeche = createItem('leche', false, 'item-2');

      const match = findMatch('Leche Entera Pascual 1L', [checkedLeche, uncheckedLeche]);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('item-2');
    });

    it('returns null when items array is empty or undefined', () => {
      expect(findMatch('Leche Pascual', [])).toBeNull();
      expect(findMatch('Leche Pascual', undefined as unknown as ShoppingListItem[])).toBeNull();
    });

    it('returns null when cart item name is empty or whitespace', () => {
      const items = [createItem('Leche')];

      expect(findMatch('', items)).toBeNull();
      expect(findMatch('   ', items)).toBeNull();
      expect(findMatch(null as unknown as string, items)).toBeNull();
    });

    it('works identically via ShoppingListMatcherService class (static and instance)', () => {
      const items = [createItem('Huevos')];

      const staticResult = ShoppingListMatcherService.findMatch('Huevos camperos L', items);
      expect(staticResult).not.toBeNull();
      expect(staticResult?.name).toBe('Huevos');

      const serviceInstance = new ShoppingListMatcherService();
      const instanceResult = serviceInstance.findMatch('Huevos camperos L', items);
      expect(instanceResult).not.toBeNull();
      expect(instanceResult?.name).toBe('Huevos');
    });
  });
});
