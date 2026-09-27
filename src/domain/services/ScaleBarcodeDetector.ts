/**
 * Detección de códigos de báscula / peso en estantería (GS1 España / Europa).
 * En supermercados, los códigos EAN-13 que comienzan con prefijo "2" (20 a 29)
 * corresponden a artículos pesados en balanza o de precio variable in-store.
 */

/**
 * Detecta si un código de barras corresponde a un producto de balanza o peso variable.
 * Requisito: longitud exacta de 13 dígitos numéricos y comienzo con '2'.
 */
export function isScaleBarcode(barcode: string): boolean {
  if (!barcode || typeof barcode !== 'string') {
    return false;
  }
  const clean = barcode.trim();
  return /^[2]\d{12}$/.test(clean);
}

/**
 * Extrae el precio en céntimos para códigos de báscula con formato de precio variable in-store.
 * Típicamente EAN-13 con prefijo '21' (o prefijo 2X con 5 dígitos de producto y 4-5 dígitos de precio en céntimos).
 * Formato estándar GS1: 21XXXXX PPPPC (donde P representan los céntimos del precio y C el dígito de control).
 * 
 * Si no cumple el formato o el precio extraído es <= 0, retorna null con fallback seguro.
 */
export function extractScalePriceCents(barcode: string): number | null {
  if (!barcode || typeof barcode !== 'string') {
    return null;
  }
  const clean = barcode.trim();

  // Debe comenzar por '21' (prefijo específico in-store de precio variable)
  if (!clean.startsWith('21')) {
    return null;
  }

  // Formato EAN-13: 21 (2) + XXXXX (5) + PPPPP (5) + C (1) = 13 dígitos
  if (clean.length === 13 && /^\d{13}$/.test(clean)) {
    const priceDigits = clean.slice(7, 12);
    const cents = parseInt(priceDigits, 10);
    return Number.isInteger(cents) && cents > 0 ? cents : null;
  }

  // Formato 12 dígitos (ej. EAN sin prefijo de país adicional o con 4 dígitos de precio):
  // 21 (2) + XXXXX (5) + PPPP (4) + C (1) = 12 dígitos
  if (clean.length === 12 && /^\d{12}$/.test(clean)) {
    const priceDigits = clean.slice(7, 11);
    const cents = parseInt(priceDigits, 10);
    return Number.isInteger(cents) && cents > 0 ? cents : null;
  }

  return null;
}
