import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ProductReference,
  Money,
} from '../../../src/domain/index.js';
import { SqliteProductCatalogRepository } from '../../../src/infrastructure/persistence/sqlite/SqliteProductCatalogRepository.js';
import { SqliteShoppingSessionRepository } from '../../../src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.js';

describe('SqliteProductCatalogRepository', () => {
  let repository: SqliteProductCatalogRepository;

  beforeEach(() => {
    repository = new SqliteProductCatalogRepository(':memory:');
  });

  afterEach(() => {
    repository.close();
  });

  describe('findByBarcode', () => {
    it('returns null when product is not in catalog', async () => {
      const result = await repository.findByBarcode('8410123456789');
      expect(result).toBeNull();
    });

    it('returns null for empty or whitespace barcode', async () => {
      expect(await repository.findByBarcode('')).toBeNull();
      expect(await repository.findByBarcode('   ')).toBeNull();
    });

    it('finds and hydrates product by barcode with trimmed lookup', async () => {
      const product = new ProductReference({
        barcode: '8410123456789',
        name: 'Leche Entera 1L',
        lastPrice: Money.fromCents(125),
        updatedAt: new Date('2026-09-27T10:00:00.000Z'),
      });
      await repository.save(product);

      const found = await repository.findByBarcode(' 8410123456789 ');
      expect(found).not.toBeNull();
      expect(found?.barcode).toBe('8410123456789');
      expect(found?.name).toBe('Leche Entera 1L');
      expect(found?.lastPrice.cents).toBe(125);
      expect(found?.lastPrice).toBeInstanceOf(Money);
      expect(found?.updatedAt.toISOString()).toBe('2026-09-27T10:00:00.000Z');
    });
  });

  describe('save (upsert)', () => {
    it('saves a new product reference', async () => {
      const product = new ProductReference({
        barcode: '8400000000001',
        name: 'Arroz Redondo 1kg',
        lastPrice: Money.fromCents(135),
      });

      await repository.save(product);

      const found = await repository.findByBarcode('8400000000001');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Arroz Redondo 1kg');
      expect(found?.lastPrice.cents).toBe(135);
    });

    it('updates an existing product reference without creating duplicate records', async () => {
      const initial = new ProductReference({
        barcode: '8400000000001',
        name: 'Arroz Redondo 1kg',
        lastPrice: Money.fromCents(135),
        updatedAt: new Date('2026-09-20T10:00:00Z'),
      });
      await repository.save(initial);

      const updated = new ProductReference({
        barcode: '8400000000001',
        name: 'Arroz Redondo Extra 1kg',
        lastPrice: Money.fromCents(149),
        updatedAt: new Date('2026-09-27T10:00:00Z'),
      });
      await repository.save(updated);

      const found = await repository.findByBarcode('8400000000001');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Arroz Redondo Extra 1kg');
      expect(found?.lastPrice.cents).toBe(149);
      expect(found?.updatedAt.toISOString()).toBe(new Date('2026-09-27T10:00:00Z').toISOString());

      const all = await repository.listRecent();
      expect(all).toHaveLength(1);
    });
  });

  describe('listRecent', () => {
    it('returns products ordered by updatedAt descending', async () => {
      const p1 = new ProductReference({
        barcode: '1111111111111',
        name: 'Item 1',
        lastPrice: Money.fromCents(100),
        updatedAt: new Date('2026-09-21T10:00:00Z'),
      });
      const p2 = new ProductReference({
        barcode: '2222222222222',
        name: 'Item 2',
        lastPrice: Money.fromCents(200),
        updatedAt: new Date('2026-09-25T10:00:00Z'),
      });
      const p3 = new ProductReference({
        barcode: '3333333333333',
        name: 'Item 3',
        lastPrice: Money.fromCents(300),
        updatedAt: new Date('2026-09-23T10:00:00Z'),
      });

      await repository.save(p1);
      await repository.save(p2);
      await repository.save(p3);

      const recent = await repository.listRecent();
      expect(recent).toHaveLength(3);
      expect(recent[0].barcode).toBe('2222222222222'); // Sept 25
      expect(recent[1].barcode).toBe('3333333333333'); // Sept 23
      expect(recent[2].barcode).toBe('1111111111111'); // Sept 21
    });

    it('respects the limit parameter', async () => {
      for (let i = 1; i <= 5; i++) {
        await repository.save(
          new ProductReference({
            barcode: `840000000000${i}`,
            name: `Item ${i}`,
            lastPrice: Money.fromCents(100 * i),
            updatedAt: new Date(`2026-09-0${i}T10:00:00Z`),
          })
        );
      }

      const top2 = await repository.listRecent(2);
      expect(top2).toHaveLength(2);
      expect(top2[0].barcode).toBe('8400000000005');
      expect(top2[1].barcode).toBe('8400000000004');
    });
  });

  describe('compatibility with shared database and file persistence', () => {
    it('can share the same SQLite DatabaseSync instance with SqliteShoppingSessionRepository', async () => {
      const sharedDb = new DatabaseSync(':memory:');
      const sessionRepo = new SqliteShoppingSessionRepository(sharedDb);
      const catalogRepo = new SqliteProductCatalogRepository(sharedDb);

      const product = new ProductReference({
        barcode: '8412345678901',
        name: 'Café Grano 500g',
        lastPrice: Money.fromCents(450),
      });
      await catalogRepo.save(product);

      const loaded = await catalogRepo.findByBarcode('8412345678901');
      expect(loaded?.name).toBe('Café Grano 500g');

      sessionRepo.close();
    });

    it('persists data to file in WAL mode and reloads across instances', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cestacuenta-catalog-'));
      const dbPath = path.join(tempDir, 'catalog.db');

      const repo1 = new SqliteProductCatalogRepository(dbPath);
      await repo1.save(
        new ProductReference({
          barcode: '8411111111111',
          name: 'Aceite Oliva 1L',
          lastPrice: Money.fromCents(890),
        })
      );
      repo1.close();

      const repo2 = new SqliteProductCatalogRepository(dbPath);
      const found = await repo2.findByBarcode('8411111111111');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Aceite Oliva 1L');
      expect(found?.lastPrice.cents).toBe(890);
      repo2.close();

      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });
});
