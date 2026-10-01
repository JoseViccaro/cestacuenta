import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProductLookupService,
  ProductReference,
  Money,
  ProductCatalogRepository,
} from '../../src/domain/index.js';

class MockCatalogRepository implements ProductCatalogRepository {
  private readonly products = new Map<string, ProductReference>();

  async findByBarcode(barcode: string): Promise<ProductReference | null> {
    return this.products.get(barcode.trim()) ?? null;
  }

  async save(product: ProductReference): Promise<void> {
    this.products.set(product.barcode, product);
  }

  async listRecent(): Promise<ProductReference[]> {
    return Array.from(this.products.values());
  }
}

describe('ProductLookupService', () => {
  let catalogRepo: MockCatalogRepository;
  let mockOffClient: { fetchProduct: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    catalogRepo = new MockCatalogRepository();
    mockOffClient = {
      fetchProduct: vi.fn(),
    };
  });

  it('returns LOCAL source with suggested price when found in local catalog', async () => {
    const localProduct = new ProductReference({
      barcode: '8410123456789',
      name: 'Leche Entera 1L',
      lastPrice: Money.fromCents(125),
    });
    await catalogRepo.save(localProduct);

    const service = new ProductLookupService(catalogRepo, mockOffClient);
    const result = await service.lookup('8410123456789');

    expect(result.source).toBe('LOCAL');
    expect(result.barcode).toBe('8410123456789');
    expect(result.name).toBe('Leche Entera 1L');
    expect(result.suggestedPrice?.cents).toBe(125);
    expect(result.isScale).toBe(false);
    expect(mockOffClient.fetchProduct).not.toHaveBeenCalled();
  });

  it('returns OPEN_FOOD_FACTS source when not in local catalog and found in OFF', async () => {
    mockOffClient.fetchProduct.mockResolvedValue({
      barcode: '8410000000001',
      name: 'Cacao Soluble (ColaCao)',
    });

    const service = new ProductLookupService(catalogRepo, mockOffClient);
    const result = await service.lookup('8410000000001');

    expect(result.source).toBe('OPEN_FOOD_FACTS');
    expect(result.barcode).toBe('8410000000001');
    expect(result.name).toBe('Cacao Soluble (ColaCao)');
    expect(result.suggestedPrice).toBeUndefined();
    expect(result.isScale).toBe(false);
    expect(mockOffClient.fetchProduct).toHaveBeenCalledWith('8410000000001');
  });

  it('returns NONE source when neither local catalog nor OFF has the product', async () => {
    mockOffClient.fetchProduct.mockResolvedValue(null);

    const service = new ProductLookupService(catalogRepo, mockOffClient);
    const result = await service.lookup('8499999999999');

    expect(result.source).toBe('NONE');
    expect(result.barcode).toBe('8499999999999');
    expect(result.name).toBeUndefined();
    expect(result.suggestedPrice).toBeUndefined();
    expect(result.isScale).toBe(false);
  });

  it('detects scale barcodes (starting with 2) and extracts embedded price without calling OFF', async () => {
    const service = new ProductLookupService(catalogRepo, mockOffClient);
    // 21 (prefix) + 00123 (product) + 00450 (450 cents = 4.50 €) + 7 (checksum)
    const result = await service.lookup('2100123004507');

    expect(result.isScale).toBe(true);
    expect(result.suggestedPrice?.cents).toBe(450);
    expect(result.source).toBe('NONE');
    expect(mockOffClient.fetchProduct).not.toHaveBeenCalled();
  });

  it('marks isScale: true even if scale barcode was saved in local catalog', async () => {
    const scaleProduct = new ProductReference({
      barcode: '2100123004507',
      name: 'Plátanos Balanza',
      lastPrice: Money.fromCents(450),
    });
    await catalogRepo.save(scaleProduct);

    const service = new ProductLookupService(catalogRepo, mockOffClient);
    const result = await service.lookup('2100123004507');

    expect(result.source).toBe('LOCAL');
    expect(result.isScale).toBe(true);
    expect(result.name).toBe('Plátanos Balanza');
    expect(result.suggestedPrice?.cents).toBe(450);
    expect(mockOffClient.fetchProduct).not.toHaveBeenCalled();
  });

  it('works gracefully without OFF client provided', async () => {
    const service = new ProductLookupService(catalogRepo);
    const result = await service.lookup('8410123456789');

    expect(result.source).toBe('NONE');
    expect(result.name).toBeUndefined();
    expect(result.suggestedPrice).toBeUndefined();
    expect(result.isScale).toBe(false);
  });

  it('handles exceptions in OFF client gracefully without throwing', async () => {
    mockOffClient.fetchProduct.mockRejectedValue(new Error('Network boom'));

    const service = new ProductLookupService(catalogRepo, mockOffClient);
    const result = await service.lookup('8410123456789');

    expect(result.source).toBe('NONE');
    expect(result.name).toBeUndefined();
  });

  it('suggests store-specific last price when available in history service', async () => {
    const localProduct = new ProductReference({
      barcode: '8410123456789',
      name: 'Leche Entera 1L',
      lastPrice: Money.fromCents(125), // Catalog default price
    });
    await catalogRepo.save(localProduct);

    // History has Mercadona at 1.35
    const mockHistoryService = {
      getLastPriceAtStore: vi.fn().mockReturnValue({
        price: Money.fromCents(135),
        storeName: 'Mercadona',
        date: new Date(),
        productName: 'Leche Entera 1L',
        sessionId: 's-1',
        isPromotional: false,
      }),
    };

    const service = new ProductLookupService(catalogRepo, mockOffClient, mockHistoryService as any);
    const result = await service.lookup('8410123456789', 'Mercadona');

    expect(result.source).toBe('LOCAL');
    expect(result.suggestedPrice?.cents).toBe(135); // Store-specific price takes precedence
    expect(mockHistoryService.getLastPriceAtStore).toHaveBeenCalledWith({
      storeName: 'Mercadona',
      barcode: '8410123456789',
      name: 'Leche Entera 1L',
    });
  });

  it('falls back to catalog lastPrice when history service has no observation for store', async () => {
    const localProduct = new ProductReference({
      barcode: '8410123456789',
      name: 'Leche Entera 1L',
      lastPrice: Money.fromCents(125),
    });
    await catalogRepo.save(localProduct);

    const mockHistoryService = {
      getLastPriceAtStore: vi.fn().mockReturnValue(null),
    };

    const service = new ProductLookupService(catalogRepo, mockOffClient, mockHistoryService as any);
    const result = await service.lookup('8410123456789', 'Carrefour');

    expect(result.source).toBe('LOCAL');
    expect(result.suggestedPrice?.cents).toBe(125);
  });
});

