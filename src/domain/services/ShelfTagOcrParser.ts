import { Money } from '../value-objects/Money.js';

export interface ShelfTagResult {
  name: string;
  price: Money;
  unitRate?: string;
  internalCode?: string;
  rawText?: string;
}

/**
 * Regex matching unit rate patterns in supermarket tags:
 * e.g. "1 KILO: 5,769 €", "1 KG: 8,414 €", "1 LITRO: 1,50 €", "100 g: 0,85 €",
 * "PRECIO/KG: 5,76 €", "1,625 €/kg", "0,50 €/ud".
 */
const UNIT_RATE_REGEX =
  /(?:(?:1|100)\s*(?:KILO|KG|LITRO|LITROS|LT|L|UD|UDS|UNIDAD|UNIDADES|G|GR)|PRECIO\s*(?:\/|POR)?\s*(?:KG|KILO|L|UD)|PVP\s*(?:\/|POR)?\s*(?:KG|KILO|L|UD))\s*[:=]?\s*\d+(?:[.,]\d+)?\s*(?:€|EUR)?|\b\d+(?:[.,]\d+)?\s*(?:€|EUR)?\s*\/\s*(?:kilo|kg|kilos|litro|litros|lt|l|ud|uds|un|unidad|unidades|100g)\b/i;

/**
 * Regex matching standalone unit rate headers: e.g. "1 KILO:", "1 KG:".
 */
const UNIT_RATE_HEADER_REGEX =
  /^(?:1|100)\s*(?:KILO|KG|LITRO|LITROS|LT|L|UD|UDS|UNIDAD|UNIDADES|G|GR)\s*[:=]?$/i;

/**
 * Regex matching internal reference codes:
 * Standalone 5 to 8 digit codes (e.g. Mercadona 6-digit codes: "098335", "238120", "707633"),
 * or prefixed with REF, ART, COD, SKU, LOTE.
 */
const INTERNAL_CODE_LINE_REGEX =
  /^(?:(?:REF|ART|COD|CÓD|SKU|LOTE)\.?\s*[:.]?\s*)?(\d{5,8})$/i;

/**
 * Regex matching standalone retail barcodes (8, 12, 13, 14 digits).
 */
const BARCODE_LINE_REGEX = /^\d{8,14}$/;

/**
 * Regex matching dates (e.g. "28/09/24", "12-03-2026", "01.05.25").
 */
const DATE_LINE_REGEX =
  /^(?:FECHA\s*[:.]?\s*)?\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/i;

/**
 * Regex matching store brands, headers, and regulatory boilerplate to strip from product titles.
 */
const STORE_NOISE_LINE_REGEX =
  /^(?:MERCADONA(?:\s*,?\s*S\.?A\.?)?|CONSUM|CARREFOUR|DIA|LIDL|ALDI|EROSKI|ALCAMPO|(?:P\.?V\.?P\.?|PRECIO|OFERTA|AHORA|ANTES)\s*(?:IVA\s*INCLUIDO|CON\s*IVA|SIN\s*IVA)?|IVA\s*INCLUIDO|CON\s*IVA|SIN\s*IVA|SUGERENCIA\s*DE\s*PRESENTACI[OÓ]N)$/i;

/**
 * Regex matching measurement weights/volumes (e.g. "208 g", "260 g", "1,2 kg", "1L").
 * These should NOT be mistaken for prices.
 */
const WEIGHT_VOLUME_REGEX =
  /^\d+(?:[.,]\d+)?\s*(?:g|gr|gramos|mg|kg|kilos?|l|lt|litros?|ml|cl|dl|%|pz|piezas?)$/i;

/**
 * Extracts unit rate text if present in the given OCR text.
 * e.g. "1 KILO: 8,414 €" or "1,625 €/kg".
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
 * Extracts internal product / item code if present (e.g. "098335", "238120", "707633").
 */
export function extractInternalCode(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(INTERNAL_CODE_LINE_REGEX);
    if (match) {
      return match[1] || match[0];
    }
  }

  // Search for standalone 5-8 digit sequences not preceded/followed by decimals or measurement units
  const regex = /(?:(?:REF|ART|COD|CÓD|SKU|LOTE)\.?\s*[:.]?\s*)?(\b\d{5,8}\b)/i;
  const match = text.match(regex);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Extracts the primary selling price from supermarket shelf tag text as Money.
 * Disregards unit rates (e.g. "1 KILO: 8,414 €"), internal codes, barcodes, and package weights ("1,2 kg").
 */
export function extractPrice(text: string): Money | null {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  // First pass: look for a line that represents the primary selling price
  for (const line of lines) {
    // Skip unit rate lines, internal codes, barcodes, dates, noise, and weight measures
    if (
      UNIT_RATE_REGEX.test(line) ||
      UNIT_RATE_HEADER_REGEX.test(line) ||
      INTERNAL_CODE_LINE_REGEX.test(line) ||
      BARCODE_LINE_REGEX.test(line) ||
      DATE_LINE_REGEX.test(line) ||
      STORE_NOISE_LINE_REGEX.test(line) ||
      WEIGHT_VOLUME_REGEX.test(line)
    ) {
      continue;
    }

    // Check if line is purely or primarily a price: e.g. "1,50 €", "1.75 €", "1,75€", "1,50", "PVP 1,50 €"
    const priceLineMatch = line.match(
      /^(?:(?:P\.?V\.?P\.?|PRECIO|AHORA|OFERTA)\s*[:.]?\s*)?(?:€\s*)?(\d{1,3}[.,]\d{1,2})\s*(?:€|EUR)?$/i
    );

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

  // Second pass: general price extraction by removing unit rate and codes first
  let cleaned = text;

  // Mask unit rates
  cleaned = cleaned.replace(
    new RegExp(UNIT_RATE_REGEX.source, 'gi'),
    ' '
  );

  // Mask barcodes and internal codes
  cleaned = cleaned.replace(/(?<!\d)\d{5,14}(?!\d)/g, ' ');

  // Mask standalone weights/volumes (e.g. "1,2 kg", "208 g", "500ml") so decimal weights aren't parsed as prices
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
 * Filters out price lines, unit rates, internal codes, barcodes, dates, and noise.
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
      !DATE_LINE_REGEX.test(line) &&
      !STORE_NOISE_LINE_REGEX.test(line) &&
      !/^(?:(?:P\.?V\.?P\.?|PRECIO|AHORA|OFERTA)\s*[:.]?\s*)?(?:€\s*)?\d{1,3}[.,]\d{1,2}\s*(?:€|EUR)?$/i.test(line)
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

    // Skip store name & regulatory noise
    if (STORE_NOISE_LINE_REGEX.test(line)) {
      continue;
    }

    // Skip standalone price lines
    if (
      /^(?:(?:P\.?V\.?P\.?|PRECIO|AHORA|OFERTA)\s*[:.]?\s*)?(?:€\s*)?\d{1,3}[.,]\d{1,2}\s*(?:€|EUR)?$/i.test(
        line
      )
    ) {
      continue;
    }

    // Clean inline noise from the line: remove standalone codes, dates, euro symbols with prices
    let cleanedLine = line;
    // Remove standalone dates
    cleanedLine = cleanedLine.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, '');
    // Remove standalone prices with currency: e.g. "1,50 €" or "€ 1,50"
    cleanedLine = cleanedLine.replace(/(?:€|EUR)\s*\d{1,3}[.,]\d{1,2}\b|\b\d{1,3}[.,]\d{1,2}\s*(?:€|EUR)/gi, '');
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
