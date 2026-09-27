import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProductReference,
  Money,
} from '../../../src/domain/index.js';
import {
  LocalStorageProductCatalogRepository,
} from '../../../src/infrastructure/persistence/web/LocalStorageProductCatalogRepository.js';
import {
  InMemoryStorage,
} from '../../../src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.js';

describe('LocalStorageProductCatalogRepository', () => {
  let memoryStorage: InMemoryStorage;
  let repository: LocalStorageProductCatalogRepository;

  beforeEach(() => {
    memoryStorage = new InMemoryStorage();
    repository = new LocalStorageProductCatalogRepository(memoryStorage);
  });

  describe('findByBarcode', () => {
    it('returns null when product is not stored', async () => {
      const result = await repository.findByBarcode('8410123456789');
      expect(result).toBeNull();
    });

    it('returns null for empty or whitespace barcode', async () => {
      expect(await repository.findByBarcode('')).toBeNull();
      expect(await repository.findByBarcode('   ')).toBeNull();
    });

    it('finds and hydrates product by barcode with trimmed barcode', async () => {
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

    it('gracefully handles corrupted JSON in storage', async () => {
      memoryStorage.setItem(LocalStorageProductCatalogRepository.STORAGE_KEY, 'invalid json{');
      const result = await repository.findByBarcode('8410123456789');
      expect(result).toBeNull();
    });
  });

  describe('save (upsert)', () => {
    it('saves a new product and preserves exact money cents', async () => {
      const product = new ProductReference({
        barcode: '8400000000001',
        name: 'Galletas Chiquilín',
        lastPrice: Money.fromCents(249),
      });

      await repository.save(product);

      const found = await repository.findByBarcode('8400000000001');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Galletas Chiquilín');
      expect(found?.lastPrice.cents).toBe(249);
    });

    it('updates an existing product without duplicating it', async () => {
      const initial = new ProductReference({
        barcode: '8400000000001',
        name: 'Galletas',
        lastPrice: Money.fromCents(200),
        updatedAt: new Date('2026-09-20T10:00:00Z'),
      });
      await repository.save(initial);

      const updated = new ProductReference({
        barcode: '8400000000001',
        name: 'Galletas María Oro',
        lastPrice: Money.fromCents(225),
        updatedAt: new Date('2026-09-27T10:00:00Z'),
      });
      await repository.save(updated);

      const found = await repository.findByBarcode('8400000000001');
      expect(found?.name).toBe('Galletas María Oro');
      expect(found?.lastPrice.cents).toBe(225);

      const all = await repository.listRecent();
      expect(all).toHaveLength(1);
    });
  });

  describe('listRecent', () => {
    it('returns products sorted by updatedAt descending', async () => {
      const p1 = new ProductReference({
        barcode: '1111111111111',
        name: 'Prod 1',
        lastPrice: Money.fromCents(100),
        updatedAt: new Date('2026-09-20T10:00:00Z'),
      });
      const p2 = new ProductReference({
        barcode: '2222222222222',
        name: 'Prod 2',
        lastPrice: Money.fromCents(200),
        updatedAt: new Date('2026-09-25T10:00:00Z'),
      });

      await repository.save(p1);
      await repository.save(p2);

      const recent = await repository.listRecent();
      expect(recent).toHaveLength(2);
      expect(recent[0].barcode).toBe('2222222222222');
      expect(recent[1].barcode).toBe('1111111111111');
    });

    it('respects limit parameter', async () => {
      for (let i = 1; i <= 4; i++) {
        await repository.save(
          new ProductReference({
            barcode: `840000000000${i}`,
            name: `Prod ${i}`,
            lastPrice: Money.fromCents(100 * i),
            updatedAt: new Date(`2026-09-0${i}T10:00:00Z`),
          })
        );
      }

      const top2 = await repository.listRecent(2);
      expect(top2).toHaveLength(2);
      expect(top2[0].barcode).toBe('8400000000004');
      expect(top2[1].barcode).toBe('8400000000003');
    });
  });
});
