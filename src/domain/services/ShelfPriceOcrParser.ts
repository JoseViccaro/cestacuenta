import { Money } from '../value-objects/Money.js';

export interface PriceCandidate {
  raw: string;
  money: Money;
  isLikelyPrice: boolean;
}

interface InternalCandidate extends PriceCandidate {
  score: number;
}

/**
 * Strips barcodes (consecutive sequences of 8, 12, 13 or more digits).
 * Replaces them with whitespace of equivalent length to preserve relative text positions.
 */
function maskBarcodes(text: string): string {
  return text.replace(/(?<!\d)(?:\d{8}|\d{12,13}|\d{14,})(?!\d)/g, (match) => ' '.repeat(match.length));
}

/**
 * Normalizes common OCR artifacts:
 * - Fixes separated digits and decimal separators (e.g. "1 , 45" -> "1,45")
 * - Masks standalone measurement quantities that do not represent prices (e.g. "1L", "500g", "100%", "pack 4x125g")
 */
function cleanOcrText(text: string): string {
  let cleaned = text.replace(/[\r\n]+/g, ' ');

  // Normalize spaced decimals: e.g. "1 , 45" or "2 . 99" -> "1,45" / "2.99"
  cleaned = cleaned.replace(/(\d+)\s*([.,])\s*(\d{1,2})\b/g, '$1$2$3');

  // Mask barcodes
  cleaned = maskBarcodes(cleaned);

  // Mask pack multipliers like "4x125" or "2x1"
  cleaned = cleaned.replace(/(?<!\d)\d+\s*[xX]\s*\d+\b/g, (match) => ' '.repeat(match.length));

  // Mask standalone weight and volume quantities without currency symbols or slash rates
  // e.g. "1L", "500g", "33cl", "100%" (leaving "1,99 €/kg" or "3,20 €/ud" untouched)
  cleaned = cleaned.replace(
    /(?<![€/\w])\b\d+(?:[.,]\d+)?\s*(?:g|gr|gramos|mg|kg|kilos?|l|lt|litros?|ml|cl|dl|%|pz|piezas?)\b(?!\s*[/€])/gi,
    (match) => ' '.repeat(match.length)
  );

  return cleaned;
}

/**
 * Evaluates candidate likelihood and supermarket shelf ranking score.
 */
function calculateCandidateScore(candidate: {
  money: Money;
  hasCurrency: boolean;
  prefix?: string;
  unit?: string;
  hasDecimals: boolean;
  isLikelyPrice: boolean;
}): number {
  if (!candidate.isLikelyPrice || candidate.money.cents <= 0) {
    return -1000;
  }

  let score = 0;

  // Explicit currency symbol (€ or EUR) is a primary signal
  if (candidate.hasCurrency) {
    score += 50;
  }

  // Keywords context
  const prefix = (candidate.prefix || '').toUpperCase();
  if (
    prefix.includes('AHORA') ||
    prefix.includes('OFERTA') ||
    prefix.includes('OFERTÓN') ||
    prefix.includes('PVP') ||
    prefix.includes('PRECIO')
  ) {
    score += 40;
  } else if (prefix.includes('ANTES')) {
    // Discount reference price (we prioritize current price)
    score -= 30;
  }

  // Unit rate analysis
  const unit = (candidate.unit || '').toLowerCase();
  if (unit.includes('ud') || unit.includes('un')) {
    // Unit price per item
    score += 35;
  } else if (
    unit.includes('kg') ||
    unit.includes('kilo') ||
    unit.includes('l') ||
    unit.includes('litro') ||
    unit.includes('g')
  ) {
    // Secondary price per weight/volume (e.g. 3,98 €/kg vs 1,99 € unit price)
    score -= 25;
  }

  // Decimal precision (retail prices in supermarkets overwhelmingly contain decimals)
  if (candidate.hasDecimals) {
    score += 20;
  } else {
    if (!candidate.hasCurrency) {
      score -= 40;
    }
  }

  // Common retail item price range bonus (0.20 € to 50.00 €)
  if (candidate.money.cents >= 20 && candidate.money.cents <= 5000) {
    score += 10;
  }

  return score;
}

/**
 * Extracts price candidates from shelf tag OCR text.
 */
export function parsePriceCandidates(text: string): PriceCandidate[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const cleanedText = cleanOcrText(text);

  // Matches price patterns:
  // Group 1: Prefix (PVP, OFERTA, PRECIO, etc.)
  // Group 2: Leading currency symbol (€, EUR)
  // Group 3: Number (e.g. 1,45 or 2.99 or 12)
  // Group 4: Trailing currency symbol (€, EUR)
  // Group 5: Unit suffix (/kg, /ud, /l, etc.)
  const PRICE_REGEX =
    /(?:(PVP|P\.V\.P\.|PRECIO|OFERTA|OFERTÓN|AHORA|ANTES|REBAJADO)\s*[:.]?\s*)?(?:(€|EUR)\s*)?(\d{1,4}(?:[.,]\d{1,2})?)(?:\s*(€|EUR))?(?:\s*\/\s*(kg|kilo|kilos|g|gr|l|lt|litro|litros|ud|un|unidad|uds|unidades))?/gi;

  const candidates: PriceCandidate[] = [];
  let match: RegExpExecArray | null;

  while ((match = PRICE_REGEX.exec(cleanedText)) !== null) {
    const rawMatch = match[0].trim();
    const prefix = match[1];
    const preCurrency = match[2];
    const numStr = match[3];
    const postCurrency = match[4];
    const unit = match[5];

    if (!numStr) continue;

    // Reject standalone single-digit numbers without decimals, currency or keywords
    const hasCurrency = Boolean(preCurrency || postCurrency);
    const hasPrefix = Boolean(prefix);
    const hasUnit = Boolean(unit);
    const hasDecimals = /[.,]/.test(numStr);

    if (!hasCurrency && !hasPrefix && !hasUnit && !hasDecimals) {
      continue;
    }

    try {
      const money = Money.parse(numStr);

      const isLikelyPrice =
        money.cents > 0 &&
        money.cents <= 100000 &&
        (hasCurrency || hasPrefix || hasUnit || hasDecimals);

      candidates.push({
        raw: rawMatch,
        money,
        isLikelyPrice,
      });
    } catch {
      // Ignore invalid money formats
    }
  }

  return candidates;
}

/**
 * Extracts the most probable unit selling price from supermarket shelf OCR text.
 * Prefers selling price over price-per-kilo and current offer price over previous price.
 */
export function extractBestPrice(text: string): Money | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const cleanedText = cleanOcrText(text);

  const PRICE_REGEX =
    /(?:(PVP|P\.V\.P\.|PRECIO|OFERTA|OFERTÓN|AHORA|ANTES|REBAJADO)\s*[:.]?\s*)?(?:(€|EUR)\s*)?(\d{1,4}(?:[.,]\d{1,2})?)(?:\s*(€|EUR))?(?:\s*\/\s*(kg|kilo|kilos|g|gr|l|lt|litro|litros|ud|un|unidad|uds|unidades))?/gi;

  const scoredCandidates: InternalCandidate[] = [];
  let match: RegExpExecArray | null;

  while ((match = PRICE_REGEX.exec(cleanedText)) !== null) {
    const rawMatch = match[0].trim();
    const prefix = match[1];
    const preCurrency = match[2];
    const numStr = match[3];
    const postCurrency = match[4];
    const unit = match[5];

    if (!numStr) continue;

    const hasCurrency = Boolean(preCurrency || postCurrency);
    const hasPrefix = Boolean(prefix);
    const hasUnit = Boolean(unit);
    const hasDecimals = /[.,]/.test(numStr);

    if (!hasCurrency && !hasPrefix && !hasUnit && !hasDecimals) {
      continue;
    }

    try {
      const money = Money.parse(numStr);
      const isLikelyPrice =
        money.cents > 0 &&
        money.cents <= 100000 &&
        (hasCurrency || hasPrefix || hasUnit || hasDecimals);

      const score = calculateCandidateScore({
        money,
        hasCurrency,
        prefix,
        unit,
        hasDecimals,
        isLikelyPrice,
      });

      scoredCandidates.push({
        raw: rawMatch,
        money,
        isLikelyPrice,
        score,
      });
    } catch {
      // Ignore
    }
  }

  if (scoredCandidates.length === 0) {
    return null;
  }

  // Sort descending by score
  scoredCandidates.sort((a, b) => b.score - a.score);

  const best = scoredCandidates[0];
  if (best && best.score > 0 && best.isLikelyPrice) {
    return best.money;
  }

  return null;
}

export const ShelfPriceOcrParser = {
  parsePriceCandidates,
  extractBestPrice,
};
