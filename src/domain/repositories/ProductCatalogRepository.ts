import { ProductReference } from '../entities/ProductReference.js';

export interface ProductCatalogRepository {
  findByBarcode(barcode: string): Promise<ProductReference | null>;
  save(product: ProductReference): Promise<void>;
  listRecent(limit?: number): Promise<ProductReference[]>;
}
