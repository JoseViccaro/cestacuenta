import { ShoppingListItem } from '../entities/ShoppingListItem.js';

export const SPANISH_STOP_WORDS = new Set([
  'de',
  'la',
  'el',
  'en',
  'y',
  'con',
  'sin',
  'un',
  'una',
  'los',
  'las',
  'del',
  'al',
  'para',
  'por',
  'o',
  'e',
  'unos',
  'unas',
  // Digits
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  // Common Spanish numeral words
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  // Common grocery measure units
  'medio',
  'kilo',
  'kilos',
  'litro',
  'litros',
  'paquete',
  'paquetes',
]);

export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function extractWords(text: string): string[] {
  const norm = normalizeText(text);
  if (!norm) return [];
  return norm.split(' ').filter((w) => w.length > 0);
}

export function extractSignificantWords(text: string): string[] {
  const words = extractWords(text);
  const filtered = words.filter((w) => !SPANISH_STOP_WORDS.has(w));
  return filtered.length > 0 ? filtered : words;
}

export function findMatch(
  cartItemName: string,
  items: ShoppingListItem[]
): ShoppingListItem | null {
  if (!cartItemName || typeof cartItemName !== 'string' || cartItemName.trim().length === 0) {
    return null;
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return null;
  }

  const uncheckedItems = items.filter((item) => !item.isChecked);
  if (uncheckedItems.length === 0) {
    return null;
  }

  const normalizedCartName = normalizeText(cartItemName);
  if (!normalizedCartName) {
    return null;
  }

  // 1. Exact match check (highest priority)
  for (const item of uncheckedItems) {
    const normalizedItemName = normalizeText(item.name);
    if (normalizedItemName === normalizedCartName) {
      return item;
    }
  }

  // 2. Word subset match check
  const cartWords = new Set(extractWords(cartItemName));
  const candidates: Array<{ item: ShoppingListItem; matchScore: number }> = [];

  for (const item of uncheckedItems) {
    const sigWords = extractSignificantWords(item.name);
    if (sigWords.length === 0) continue;

    const allWordsMatch = sigWords.every((word) => cartWords.has(word));
    if (allWordsMatch) {
      candidates.push({ item, matchScore: sigWords.length });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Prefer more specific matches (higher count of significant words)
  candidates.sort((a, b) => b.matchScore - a.matchScore);
  return candidates[0].item;
}

export class ShoppingListMatcherService {
  static findMatch(cartItemName: string, items: ShoppingListItem[]): ShoppingListItem | null {
    return findMatch(cartItemName, items);
  }

  findMatch(cartItemName: string, items: ShoppingListItem[]): ShoppingListItem | null {
    return findMatch(cartItemName, items);
  }
}
