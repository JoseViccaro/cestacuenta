import { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  ProductReference,
  Money,
  ProductCatalogRepository,
} from '../../../domain/index.js';

interface ProductReferenceRow {
  barcode: string;
  name: string;
  last_price_cents: number;
  updated_at: string;
}

export class SqliteProductCatalogRepository implements ProductCatalogRepository {
  private readonly db: DatabaseSync;
  private readonly isMemory: boolean;

  private selectByBarcodeStmt!: StatementSync;
  private upsertProductStmt!: StatementSync;
  private selectRecentStmt!: StatementSync;

  constructor(dbOrPath: DatabaseSync | string = ':memory:') {
    if (typeof dbOrPath === 'string') {
      this.db = new DatabaseSync(dbOrPath);
      this.isMemory = dbOrPath === ':memory:';
    } else {
      this.db = dbOrPath;
      this.isMemory = typeof dbOrPath.location === 'function' ? dbOrPath.location() === null : false;
    }

    this.initDatabase();
  }

  private initDatabase(): void {
    if (!this.isMemory) {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS product_references (
        barcode TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        last_price_cents INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_product_references_updated_at 
      ON product_references (updated_at DESC);
    `);

    this.selectByBarcodeStmt = this.db.prepare(`
      SELECT barcode, name, last_price_cents, updated_at
      FROM product_references
      WHERE barcode = ?
    `);

    this.upsertProductStmt = this.db.prepare(`
      INSERT INTO product_references (barcode, name, last_price_cents, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(barcode) DO UPDATE SET
        name = excluded.name,
        last_price_cents = excluded.last_price_cents,
        updated_at = excluded.updated_at
    `);

    this.selectRecentStmt = this.db.prepare(`
      SELECT barcode, name, last_price_cents, updated_at
      FROM product_references
      ORDER BY updated_at DESC
      LIMIT ?
    `);
  }

  async findByBarcode(barcode: string): Promise<ProductReference | null> {
    const trimmed = barcode?.trim();
    if (!trimmed) return null;

    const row = this.selectByBarcodeStmt.get(trimmed) as unknown as ProductReferenceRow | undefined;
    if (!row) {
      return null;
    }

    return this.hydrateProduct(row);
  }

  async save(product: ProductReference): Promise<void> {
    this.upsertProductStmt.run(
      product.barcode,
      product.name,
      product.lastPrice.cents,
      product.updatedAt.toISOString()
    );
  }

  async listRecent(limit?: number): Promise<ProductReference[]> {
    const safeLimit = limit !== undefined && limit > 0 ? limit : 20;
    const rows = this.selectRecentStmt.all(safeLimit) as unknown as ProductReferenceRow[];
    return rows.map((row) => this.hydrateProduct(row));
  }

  close(): void {
    this.db.close();
  }

  private hydrateProduct(row: ProductReferenceRow): ProductReference {
    return new ProductReference({
      barcode: row.barcode,
      name: row.name,
      lastPrice: Money.fromCents(Number(row.last_price_cents)),
      updatedAt: new Date(row.updated_at),
    });
  }
}
