import { Money } from '../value-objects/Money.js';

export interface ShelfTagResult {
  name: string;
  price: Money;
  unitRate?: string;
  internalCode?: string;
  rawText?: string;
}

/**
 * Regex matching unit rate patterns in European / Spanish supermarket tags:
 * e.g. "1 KILO: 5,769 €", "1 KG: 8,414 €", "1 kg = 3,78 €", "1 LITRO: 1,50 €", "100 g: 0,85 €",
 * "PVP/KG: 1,35 €", "PRECIO/L: 1,05 €", "( 1,05 € / l )", "8,95 €/L", "1,625 €/kg", "0,50 €/ud".
 */
export const UNIT_RATE_REGEX =
  /(?:\(?\s*(?:(?:1|100)\s*(?:KILO|KILOS|KG|LITRO|LITROS|LT|L|UD|UDS|UNIDAD|UNIDADES|G|GR)|PRECIO\s*(?:\/|POR|\s)\s*(?:KG|KILO|KILOS|L|LT|LITRO|LITROS|UD|UDS|UNIDAD|UNIDADES|100\s*G|100\s*GR|G|GR)|PVP\s*(?:\/|POR|\s)\s*(?:KG|KILO|KILOS|L|LT|LITRO|LITROS|UD|UDS|UNIDAD|UNIDADES|100\s*G|100\s*GR|G|GR))\s*[:=]?\s*\d+(?:[.,]\d+)?\s*(?:€|EUR)?\s*\)?|\(?\s*\d+(?:[.,]\d+)?\s*(?:€|EUR)?\s*\/\s*(?:kilo|kilos|kg|litro|litros|lt|l|ud|uds|un|unidad|unidades|100\s*g|100\s*gr|g|gr)\b\s*\)?)/i;

/**
 * Regex matching standalone unit rate headers: e.g. "1 KILO:", "1 KG:", "PVP/KG:".
 */
export const UNIT_RATE_HEADER_REGEX =
  /^\(?\s*(?:(?:1|100)\s*(?:KILO|KILOS|KG|LITRO|LITROS|LT|L|UD|UDS|UNIDAD|UNIDADES|G|GR)|PRECIO\s*(?:\/|POR|\s)\s*(?:KG|KILO|KILOS|L|LT|LITRO|LITROS|UD|UDS|UNIDAD|UNIDADES|100\s*G|100\s*GR|G|GR)|PVP\s*(?:\/|POR|\s)\s*(?:KG|KILO|KILOS|L|LT|LITRO|LITROS|UD|UDS|UNIDAD|UNIDADES|100\s*G|100\s*GR|G|GR))\s*[:=]?\s*\)?$/i;

/**
 * Regex matching previous price / offer discount lines to discard:
 * e.g. "ANTES 2,49 €", "ANTES: 2,49 €", "ERA 2,49 €", "PRECIO ANTERIOR 2,49 €".
 */
export const OLD_PRICE_REGEX =
  /\(?\s*(?:ANTES|ERA|PRECIO\s*ANTERIOR)\s*[:.]?\s*(?:€\s*)?\d+(?:[.,]\d+)?\s*(?:€|EUR)?\s*\)?/i;

export const OLD_PRICE_LINE_REGEX =
  /^\(?\s*(?:ANTES|ERA|PRECIO\s*ANTERIOR)\s*[:.]?\s*(?:€\s*)?\d+(?:[.,]\d+)?\s*(?:€|EUR)?\s*\)?$/i;

/**
 * Regex matching promotional price lines:
 * e.g. "AHORA 1,99 €", "AHORA: 1,99 €", "OFERTA 1,99 €", "PRECIO CLUB 1,99 €", "HOY 1,99 €".
 */
export const PROMO_PRICE_LINE_REGEX =
  /^\(?\s*(?:(?:AHORA|OFERTA|PRECIO\s*CLUB|PRECIO\s*ACTUAL|HOY)\s*[:.]?\s*)(?:€\s*)?(\d{1,3}[.,]\d{1,2})\s*(?:€|EUR)?\s*\)?$/i;

/**
 * Regex matching standard price lines:
 * e.g. "1,05 €", "1.89 €", "1,75 €", "1,50", "PVP 1,35 €".
 */
export const STANDARD_PRICE_LINE_REGEX =
  /^\(?\s*(?:(?:P\.?V\.?P\.?|PRECIO)\s*[:.]?\s*)?(?:€\s*)?(\d{1,3}[.,]\d{1,2})\s*(?:€|EUR)?\s*\)?$/i;

/**
 * Regex matching internal reference codes:
 * Standalone 5 to 8 digit codes (e.g. Mercadona 6-digit codes: "098335", "238120", "707633"),
 * or prefixed with REF, ART, COD, SKU, LOTE (4 to 8 digits, e.g. "REF 482910", "ART 84729").
 */
export const INTERNAL_CODE_LINE_REGEX =
  /^\(?\s*(?:(?:REF|ART|ART[IÍ]CULO|COD|C[OÓ]D|C[OÓ]DIGO|SKU|LOTE|REFERENCIA)\.?\s*[:.]?\s*(\d{4,8})|(\d{5,8}))\s*\)?$/i;

/**
 * Regex matching standalone retail barcodes (8, 12, 13, 14 digits).
 */
export const BARCODE_LINE_REGEX = /^\d{8,14}$/;

/**
 * Regex matching dates (e.g. "28/09/24", "12-03-2026", "01/02/2026", "01.05.25").
 */
export const DATE_LINE_REGEX =
  /^\(?\s*(?:FECHA\s*[:.]?\s*)?\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*\)?$/i;

/**
 * Regex matching store brands, headers, and regulatory boilerplate to strip from product titles.
 */
export const STORE_NOISE_LINE_REGEX =
  /^\(?\s*(?:MERCADONA(?:\s*,?\s*S\.?A\.?)?|CONSUM(?:\s*,?\s*S\.?COOP\.?)?|CARREFOUR|DIA|LIDL|ALDI|EROSKI|ALCAMPO|AHORRAMAS|HIPERDINO|BONPREU|CAPRABO|(?:P\.?V\.?P\.?|PRECIO|OFERTA|AHORA|ANTES)\s*(?:IVA\s*INCLUIDO|CON\s*IVA|SIN\s*IVA)?|IVA\s*INCLUIDO|CON\s*IVA|SIN\s*IVA|SUGERENCIA\s*DE\s*PRESENTACI[OÓ]N|PRECIO\s*CLUB|OFERTA|PROMOCI[OÓ]N|DESCUENTO|SUPERPRECIO)\s*\)?$/i;

/**
 * Regex matching measurement weights/volumes (e.g. "208 g", "260 g", "1,2 kg", "1L").
 * These should NOT be mistaken for prices when isolated on a line.
 */
export const WEIGHT_VOLUME_REGEX =
  /^\(?\s*\d+(?:[.,]\d+)?\s*(?:g|gr|gramos|mg|kg|kilos?|l|lt|litros?|ml|cl|dl|%|pz|piezas?)\s*\)?$/i;

/**
 * Extracts unit rate text if present in the given OCR text.
 * e.g. "1 KILO: 8,414 €", "1 kg = 3,78 €", "8,95 €/L", or "( 1,05 € / l )".
 */
export function extractUnitRate(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(UNIT_RATE_REGEX);
    if (match) {
      return line;
    }
  }

  // Fallback to match across entire text
  const match = text.match(UNIT_RATE_REGEX);
  return match ? match[0].trim() : null;
}

/**
 * Extracts internal product / item code if present (e.g. "482910", "84729", "238120").
 */
export function extractInternalCode(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(INTERNAL_CODE_LINE_REGEX);
    if (match) {
      return match[1] || match[2] || match[0].trim();
    }
  }

  // Search for standalone 5-8 digit sequences or prefixed 4-8 digit sequences
  const regex = /(?:(?:REF|ART|ART[IÍ]CULO|COD|C[OÓ]D|C[OÓ]DIGO|SKU|LOTE|REFERENCIA)\.?\s*[:.]?\s*(\b\d{4,8}\b)|(\b\d{5,8}\b))/i;
  const match = text.match(regex);
  if (match) {
    return match[1] || match[2];
  }

  return null;
}

/**
 * Extracts the primary selling price from supermarket shelf tag text as Money.
 * Prioritizes active offer/promo prices ("AHORA 1,99 €"), disregards old promo prices ("ANTES 2,49 €"),
 * unit rates (e.g. "1 KILO: 8,414 €", "( 1,05 € / l )", "8,95 €/L"), internal codes, barcodes, and package weights ("1,2 kg").
 */
export function extractPrice(text: string): Money | null {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  // Pass 1A: Look for an explicit promotional / offer current price (AHORA, OFERTA, PRECIO CLUB, etc.)
  for (const line of lines) {
    if (OLD_PRICE_LINE_REGEX.test(line) || UNIT_RATE_REGEX.test(line) || UNIT_RATE_HEADER_REGEX.test(line)) {
      continue;
    }
    const promoMatch = line.match(PROMO_PRICE_LINE_REGEX);
    if (promoMatch && promoMatch[1]) {
      try {
        const money = Money.parse(promoMatch[1]);
        if (money.cents > 0) {
          return money;
        }
      } catch {
        // Continue
      }
    }
  }

  // Pass 1B: Look for a standard selling price line
  for (const line of lines) {
    if (
      UNIT_RATE_REGEX.test(line) ||
      UNIT_RATE_HEADER_REGEX.test(line) ||
      OLD_PRICE_LINE_REGEX.test(line) ||
      OLD_PRICE_REGEX.test(line) ||
      INTERNAL_CODE_LINE_REGEX.test(line) ||
      BARCODE_LINE_REGEX.test(line) ||
      DATE_LINE_REGEX.test(line) ||
      STORE_NOISE_LINE_REGEX.test(line) ||
      WEIGHT_VOLUME_REGEX.test(line)
    ) {
      continue;
    }

    const priceLineMatch = line.match(STANDARD_PRICE_LINE_REGEX);
    if (priceLineMatch && priceLineMatch[1]) {
      try {
        const money = Money.parse(priceLineMatch[1]);
        if (money.cents > 0) {
          return money;
        }
      } catch {
        // Continue
      }
    }
  }

  // Pass 2: General price extraction by removing old prices, unit rates, codes and weights first
  let cleaned = text;

  // Mask old prices (e.g. "ANTES 2,49 €", "ERA 2,49 €")
  cleaned = cleaned.replace(new RegExp(OLD_PRICE_REGEX.source, 'gi'), ' ');

  // Mask unit rates (e.g. "( 1,05 € / l )", "1 kg = 3,78 €", "8,95 €/L")
  cleaned = cleaned.replace(new RegExp(UNIT_RATE_REGEX.source, 'gi'), ' ');

  // Mask barcodes and internal codes
  cleaned = cleaned.replace(/(?<!\d)\d{5,14}(?!\d)/g, ' ');

  // Mask standalone dates
  cleaned = cleaned.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, ' ');

  // Mask standalone weights/volumes so decimal weights aren't parsed as prices
  cleaned = cleaned.replace(
    /(?<![€/\w])\b\d+(?:[.,]\d+)?\s*(?:g|gr|gramos|mg|kg|kilos?|l|lt|litros?|ml|cl|dl|%|pz|piezas?)\b(?!\s*[/€])/gi,
    ' '
  );

  // Look for remaining price candidates: e.g. "1,50 €" or "1,50"
  const candidateRegex = /(?:(€|EUR)\s*)?(\d{1,3}[.,]\d{2})(?:\s*(€|EUR))?/gi;
  let candidateMatch: RegExpExecArray | null;
  let bestCandidate: Money | null = null;
  let bestHasCurrency = false;

  while ((candidateMatch = candidateRegex.exec(cleaned)) !== null) {
    const preCurrency = candidateMatch[1];
    const numStr = candidateMatch[2];
    const postCurrency = candidateMatch[3];
    const hasCurrency = Boolean(preCurrency || postCurrency);

    try {
      const money = Money.parse(numStr);
      if (money.cents > 0) {
        if (!bestCandidate || (!bestHasCurrency && hasCurrency)) {
          bestCandidate = money;
          bestHasCurrency = hasCurrency;
        }
      }
    } catch {
      // Continue
    }
  }

  return bestCandidate;
}

/**
 * Extracts a clean product title from supermarket shelf tag text.
 * Filters out price lines, unit rates, internal codes, barcodes, dates, and store noise.
 * Retains brand, product description, and package size/weight (e.g. "208 g", "1L", "PACK 4").
 */
export function extractName(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  const rawLines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return null;

  // Determine if the lines were captured in inverted order (e.g. barcode/code first, name last)
  let codeIndex = -1;
  let firstCandidateNameIndex = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (INTERNAL_CODE_LINE_REGEX.test(line) || BARCODE_LINE_REGEX.test(line)) {
      if (codeIndex === -1) codeIndex = i;
    } else if (
      !UNIT_RATE_REGEX.test(line) &&
      !UNIT_RATE_HEADER_REGEX.test(line) &&
      !OLD_PRICE_LINE_REGEX.test(line) &&
      !PROMO_PRICE_LINE_REGEX.test(line) &&
      !STANDARD_PRICE_LINE_REGEX.test(line) &&
      !DATE_LINE_REGEX.test(line) &&
      !STORE_NOISE_LINE_REGEX.test(line)
    ) {
      if (firstCandidateNameIndex === -1) firstCandidateNameIndex = i;
    }
  }

  const isInverted =
    codeIndex !== -1 &&
    firstCandidateNameIndex !== -1 &&
    codeIndex < firstCandidateNameIndex;

  const candidateLines: string[] = [];

  for (const line of rawLines) {
    // Skip unit rates
    if (UNIT_RATE_REGEX.test(line) || UNIT_RATE_HEADER_REGEX.test(line)) {
      continue;
    }

    // Skip internal codes & barcodes
    if (INTERNAL_CODE_LINE_REGEX.test(line) || BARCODE_LINE_REGEX.test(line)) {
      continue;
    }

    // Skip dates
    if (DATE_LINE_REGEX.test(line)) {
      continue;
    }

    // Skip store name & regulatory noise lines
    if (STORE_NOISE_LINE_REGEX.test(line)) {
      continue;
    }

    // Skip old promo price lines
    if (OLD_PRICE_LINE_REGEX.test(line)) {
      continue;
    }

    // Skip promo and standard price lines
    if (PROMO_PRICE_LINE_REGEX.test(line) || STANDARD_PRICE_LINE_REGEX.test(line)) {
      continue;
    }

    // Clean inline noise from the line: remove standalone codes, dates, euro symbols with prices
    let cleanedLine = line;

    // Remove inline boilerplate phrases
    cleanedLine = cleanedLine.replace(
      /\b(?:PRECIO\s*CLUB|IVA\s*INCLUIDO|CON\s*IVA|SIN\s*IVA|SUGERENCIA\s*DE\s*PRESENTACI[OÓ]N)\b/gi,
      ''
    );

    // Remove old price phrases inline (e.g. "ANTES 2,49 €")
    cleanedLine = cleanedLine.replace(
      /\b(?:ANTES|ERA|PRECIO\s*ANTERIOR)\s*[:.]?\s*(?:€\s*)?\d+(?:[.,]\d+)?\s*(?:€|EUR)?\b/gi,
      ''
    );

    // Remove standalone promo prefixes at start of line (e.g. "AHORA:", "OFERTA:")
    cleanedLine = cleanedLine.replace(/^(?:AHORA|OFERTA|PRECIO\s*CLUB)\s*[:.]?\s*/i, '');

    // Remove standalone dates
    cleanedLine = cleanedLine.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, '');

    // Remove standalone prices with currency: e.g. "1,50 €" or "€ 1,50"
    cleanedLine = cleanedLine.replace(/(?:€|EUR)\s*\d{1,3}[.,]\d{1,2}\b|\b\d{1,3}[.,]\d{1,2}\s*(?:€|EUR)/gi, '');

    // Remove inline code prefixes (e.g. "REF 482910", "ART 84729")
    cleanedLine = cleanedLine.replace(
      /\b(?:REF|ART|ART[IÍ]CULO|COD|C[OÓ]D|C[OÓ]DIGO|SKU|LOTE|REFERENCIA)\.?\s*[:.]?\s*\d{4,8}\b/gi,
      ''
    );

    // Remove standalone 5-8 digit internal codes
    cleanedLine = cleanedLine.replace(/(?<!\d)\d{5,8}(?!\d)/g, '');

    // Remove excess punctuation and spaces
    cleanedLine = cleanedLine.replace(/[=~_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

    // Check if line has meaningful alphabetical content
    if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(cleanedLine)) {
      candidateLines.push(cleanedLine);
    }
  }

  if (candidateLines.length === 0) {
    return null;
  }

  // If detected inverted scanning, restore top-to-bottom order
  if (isInverted) {
    candidateLines.reverse();
  }

  const joinedName = candidateLines.join(' ').replace(/\s{2,}/g, ' ').trim();
  return joinedName.length > 0 ? joinedName : null;
}

/**
 * Parses supermarket shelf tag OCR text into a structured ShelfTagResult.
 * Returns null if a valid product name or price cannot be extracted.
 */
export function parseShelfTag(text: string): ShelfTagResult | null {
  if (!text || typeof text !== 'string') return null;

  const price = extractPrice(text);
  if (!price || price.cents <= 0) {
    return null;
  }

  const name = extractName(text);
  if (!name || name.length < 2) {
    return null;
  }

  const unitRate = extractUnitRate(text) || undefined;
  const internalCode = extractInternalCode(text) || undefined;

  return {
    name,
    price,
    unitRate,
    internalCode,
    rawText: text,
  };
}

export const ShelfTagOcrParser = {
  parse: parseShelfTag,
  extractPrice,
  extractName,
  extractUnitRate,
  extractInternalCode,
};
