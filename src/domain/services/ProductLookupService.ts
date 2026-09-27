import { Money } from '../value-objects/Money.js';
import { ProductCatalogRepository } from '../repositories/ProductCatalogRepository.js';
import { isScaleBarcode, extractScalePriceCents } from './ScaleBarcodeDetector.js';

export interface OpenFoodFactsLookupClient {
  fetchProduct(barcode: string): Promise<{ barcode: string; name: string } | null>;
}

export type ProductLookupSource = 'LOCAL' | 'OPEN_FOOD_FACTS' | 'NONE';

export interface ProductLookupResult {
  barcode: string;
  name?: string;
  suggestedPrice?: Money;
  isScale: boolean;
  source: ProductLookupSource;
}

export class ProductLookupService {
  constructor(
    private readonly catalogRepository: ProductCatalogRepository,
    private readonly offClient?: OpenFoodFactsLookupClient
  ) {}

  async lookup(barcode: string): Promise<ProductLookupResult> {
    const cleanBarcode = barcode?.trim() ?? '';
    const isScale = isScaleBarcode(cleanBarcode);

    // 1. Buscar en catálogo local persistente
    const local = await this.catalogRepository.findByBarcode(cleanBarcode);
    if (local) {
      return {
        barcode: cleanBarcode,
        name: local.name,
        suggestedPrice: local.lastPrice,
        isScale,
        source: 'LOCAL',
      };
    }

    // 2. Si no existe en local y no es código de balanza, consultar Open Food Facts
    if (!isScale && this.offClient) {
      try {
        const offProduct = await this.offClient.fetchProduct(cleanBarcode);
        if (offProduct && offProduct.name.trim().length > 0) {
          return {
            barcode: cleanBarcode,
            name: offProduct.name.trim(),
            suggestedPrice: undefined,
            isScale: false,
            source: 'OPEN_FOOD_FACTS',
          };
        }
      } catch {
        // En caso de excepción no controlada en el cliente externo, continuar a fallback NONE
      }
    }

    // 3. Fallback cuando no se encuentra en ninguna fuente
    // Si es código de báscula, intentar extraer el precio embebido en el código
    const scaleCents = isScale ? extractScalePriceCents(cleanBarcode) : null;
    const suggestedPrice = scaleCents ? Money.fromCents(scaleCents) : undefined;

    return {
      barcode: cleanBarcode,
      name: undefined,
      suggestedPrice,
      isScale,
      source: 'NONE',
    };
  }
}
