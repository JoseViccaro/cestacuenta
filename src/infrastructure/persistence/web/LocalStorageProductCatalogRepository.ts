import {
  ProductReference,
  Money,
  ProductCatalogRepository,
} from '../../../domain/index.js';
import {
  KeyValueStorage,
  InMemoryStorage,
} from './LocalStorageShoppingSessionRepository.js';

export interface SerializedProductReference {
  barcode: string;
  name: string;
  lastPriceCents: number;
  updatedAt: string;
}

function getAvailableStorage(): KeyValueStorage {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const testKey = '__cestacuenta_catalog_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      return new InMemoryStorage();
    }
  }
  return new InMemoryStorage();
}

export class LocalStorageProductCatalogRepository implements ProductCatalogRepository {
  public static readonly STORAGE_KEY = 'cestacuenta_product_catalog';

  private readonly storage: KeyValueStorage;

  constructor(customStorage?: KeyValueStorage) {
    this.storage = customStorage ?? getAvailableStorage();
  }

  async findByBarcode(barcode: string): Promise<ProductReference | null> {
    const trimmed = barcode?.trim();
    if (!trimmed) return null;

    const list = this.readAllRaw();
    const match = list.find((item) => item.barcode === trimmed);
    if (!match) {
      return null;
    }

    return this.deserializeProduct(match);
  }

  async save(product: ProductReference): Promise<void> {
    const list = this.readAllRaw();
    const serialized = this.serializeProduct(product);

    const existingIndex = list.findIndex((item) => item.barcode === product.barcode);
    if (existingIndex !== -1) {
      list[existingIndex] = serialized;
    } else {
      list.unshift(serialized);
    }

    // Keep sorted by updatedAt descending
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    this.storage.setItem(
      LocalStorageProductCatalogRepository.STORAGE_KEY,
      JSON.stringify(list)
    );
  }

  async listRecent(limit = 20): Promise<ProductReference[]> {
    const list = this.readAllRaw();
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const safeLimit = Math.max(0, limit);
    const slice = list.slice(0, safeLimit);

    return slice.map((item) => this.deserializeProduct(item));
  }

  private readAllRaw(): SerializedProductReference[] {
    const raw = this.storage.getItem(LocalStorageProductCatalogRepository.STORAGE_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as SerializedProductReference[];
      }
      return [];
    } catch {
      return [];
    }
  }

  private serializeProduct(product: ProductReference): SerializedProductReference {
    return {
      barcode: product.barcode,
      name: product.name,
      lastPriceCents: product.lastPrice.cents,
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private deserializeProduct(data: SerializedProductReference): ProductReference {
    return new ProductReference({
      barcode: data.barcode,
      name: data.name,
      lastPrice: Money.fromCents(data.lastPriceCents),
      updatedAt: new Date(data.updatedAt),
    });
  }
}
