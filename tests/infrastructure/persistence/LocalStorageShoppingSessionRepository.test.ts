import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShoppingSession,
  Money,
} from '../../../src/domain/index.js';
import {
  LocalStorageShoppingSessionRepository,
  InMemoryStorage,
} from '../../../src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.js';

describe('LocalStorageShoppingSessionRepository', () => {
  let storage: InMemoryStorage;
  let repository: LocalStorageShoppingSessionRepository;

  beforeEach(() => {
    storage = new InMemoryStorage();
    repository = new LocalStorageShoppingSessionRepository(storage);
  });

  describe('getActiveSession', () => {
    it('returns null when storage is completely empty', async () => {
      const active = await repository.getActiveSession();
      expect(active).toBeNull();
    });

    it('returns active session when one is saved', async () => {
      const session = ShoppingSession.create({ storeName: 'Mercadona' });
      session.addItem({
        name: 'Leche Entera 1L',
        unitPrice: Money.fromCents(215),
        quantity: 2,
        barcode: '8410123456789',
      });

      await repository.save(session);

      const retrieved = await repository.getActiveSession();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(session.id);
      expect(retrieved!.storeName).toBe('Mercadona');
      expect(retrieved!.status).toBe('ACTIVE');
      expect(retrieved!.items.length).toBe(1);
    });

    it('hydrates Money value objects correctly in cents', async () => {
      const session = ShoppingSession.create({ storeName: 'Carrefour' });
      session.addItem({
        name: 'Plátanos',
        unitPrice: Money.fromCents(187),
        quantity: 1,
        isBulk: true,
      });

      await repository.save(session);

      const retrieved = await repository.getActiveSession();
      expect(retrieved).not.toBeNull();
      const item = retrieved!.items[0];

      expect(item.unitPrice).toBeInstanceOf(Money);
      expect(item.unitPrice.cents).toBe(187);
      expect(item.unitPrice.toFormattedString()).toBe('1,87 €');
      expect(item.discount).toBeInstanceOf(Money);
      expect(item.discount.cents).toBe(0);
      expect(item.subtotal()).toBeInstanceOf(Money);
      expect(item.subtotal().cents).toBe(187);
      expect(retrieved!.total()).toBeInstanceOf(Money);
      expect(retrieved!.total().cents).toBe(187);
    });

    it('returns null if active session key has corrupted JSON', async () => {
      storage.setItem(LocalStorageShoppingSessionRepository.ACTIVE_SESSION_KEY, 'not-valid-json');
      const retrieved = await repository.getActiveSession();
      expect(retrieved).toBeNull();
    });

    it('returns null if saved active session status is not ACTIVE', async () => {
      storage.setItem(
        LocalStorageShoppingSessionRepository.ACTIVE_SESSION_KEY,
        JSON.stringify({
          id: 'test-id',
          status: 'COMPLETED',
          startedAt: new Date().toISOString(),
          items: [],
        })
      );
      const retrieved = await repository.getActiveSession();
      expect(retrieved).toBeNull();
    });
  });

  describe('save', () => {
    it('saves session with multiple items, discounts and bulk flag', async () => {
      const session = ShoppingSession.create({ storeName: 'Dia' });
      session.addItem({
        name: 'Café Molido',
        unitPrice: Money.fromCents(340),
        quantity: 2,
        discount: Money.fromCents(50),
      });
      session.addItem({
        name: 'Manzanas',
        unitPrice: Money.fromCents(210),
        quantity: 1,
        isBulk: true,
      });

      await repository.save(session);

      const active = await repository.getActiveSession();
      expect(active).not.toBeNull();
      expect(active!.items.length).toBe(2);

      const cafe = active!.items.find((i) => i.name === 'Café Molido')!;
      expect(cafe.unitPrice.cents).toBe(340);
      expect(cafe.quantity).toBe(2);
      expect(cafe.discount.cents).toBe(50);
      expect(cafe.subtotal().cents).toBe(630); // 340 * 2 - 50 = 630
      expect(cafe.isBulk).toBe(false);

      const manzanas = active!.items.find((i) => i.name === 'Manzanas')!;
      expect(manzanas.unitPrice.cents).toBe(210);
      expect(manzanas.quantity).toBe(1);
      expect(manzanas.isBulk).toBe(true);

      expect(active!.total().cents).toBe(840);
    });

    it('clears active session key and persists to history when completing a session', async () => {
      const session = ShoppingSession.create({ storeName: 'Lidl' });
      session.addItem({
        name: 'Yogur Natural',
        unitPrice: Money.fromCents(120),
        quantity: 3,
      });
      await repository.save(session);

      // Verify active session exists
      expect(await repository.getActiveSession()).not.toBeNull();

      // Complete session and save
      session.complete();
      await repository.save(session);

      // Active session should now be null
      const activeAfterComplete = await repository.getActiveSession();
      expect(activeAfterComplete).toBeNull();

      // Active key should be removed from storage
      expect(storage.getItem(LocalStorageShoppingSessionRepository.ACTIVE_SESSION_KEY)).toBeNull();

      // Session should exist in history
      const history = await repository.listHistory();
      expect(history.length).toBe(1);
      expect(history[0].id).toBe(session.id);
      expect(history[0].status).toBe('COMPLETED');
      expect(history[0].endedAt).toBeDefined();
    });

    it('clears active session key and persists to history when discarding a session', async () => {
      const session = ShoppingSession.create({ storeName: 'Alcampo' });
      await repository.save(session);
      expect(await repository.getActiveSession()).not.toBeNull();

      session.discard();
      await repository.save(session);

      expect(await repository.getActiveSession()).toBeNull();
      const history = await repository.listHistory();
      expect(history.length).toBe(1);
      expect(history[0].status).toBe('DISCARDED');
    });

    it('updates an existing session in history if saved again', async () => {
      const session = ShoppingSession.create({ storeName: 'Lidl' });
      session.complete();
      await repository.save(session);

      expect((await repository.listHistory()).length).toBe(1);

      // Save again
      await repository.save(session);
      expect((await repository.listHistory()).length).toBe(1);
    });
  });

  describe('getById', () => {
    it('finds active session by ID', async () => {
      const session = ShoppingSession.create({ storeName: 'Aldi' });
      await repository.save(session);

      const found = await repository.getById(session.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(session.id);
      expect(found!.storeName).toBe('Aldi');
    });

    it('finds completed session from history by ID', async () => {
      const session = ShoppingSession.create({ storeName: 'Aldi' });
      session.complete();
      await repository.save(session);

      const found = await repository.getById(session.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(session.id);
      expect(found!.status).toBe('COMPLETED');
    });

    it('returns null when id does not match any session', async () => {
      const found = await repository.getById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('listHistory', () => {
    it('returns empty array when there is no history', async () => {
      const history = await repository.listHistory();
      expect(history).toEqual([]);
    });

    it('returns history ordered by startedAt descending', async () => {
      const session1 = new ShoppingSession({
        id: 's1',
        startedAt: new Date('2026-09-01T10:00:00Z'),
        status: 'COMPLETED',
        storeName: 'Tienda 1',
      });
      const session2 = new ShoppingSession({
        id: 's2',
        startedAt: new Date('2026-09-10T10:00:00Z'),
        status: 'COMPLETED',
        storeName: 'Tienda 2',
      });
      const session3 = new ShoppingSession({
        id: 's3',
        startedAt: new Date('2026-09-05T10:00:00Z'),
        status: 'COMPLETED',
        storeName: 'Tienda 3',
      });

      await repository.save(session1);
      await repository.save(session2);
      await repository.save(session3);

      const history = await repository.listHistory();
      expect(history.length).toBe(3);
      expect(history[0].id).toBe('s2'); // 2026-09-10
      expect(history[1].id).toBe('s3'); // 2026-09-05
      expect(history[2].id).toBe('s1'); // 2026-09-01
    });

    it('supports limit and offset pagination', async () => {
      for (let i = 1; i <= 5; i++) {
        const session = new ShoppingSession({
          id: `session-${i}`,
          startedAt: new Date(`2026-09-0${i}T10:00:00Z`),
          status: 'COMPLETED',
          storeName: `Store ${i}`,
        });
        await repository.save(session);
      }

      // Page 1: limit 2, offset 0 -> session-5, session-4
      const page1 = await repository.listHistory(2, 0);
      expect(page1.length).toBe(2);
      expect(page1[0].id).toBe('session-5');
      expect(page1[1].id).toBe('session-4');

      // Page 2: limit 2, offset 2 -> session-3, session-2
      const page2 = await repository.listHistory(2, 2);
      expect(page2.length).toBe(2);
      expect(page2[0].id).toBe('session-3');
      expect(page2[1].id).toBe('session-2');

      // Page 3: limit 2, offset 4 -> session-1
      const page3 = await repository.listHistory(2, 4);
      expect(page3.length).toBe(1);
      expect(page3[0].id).toBe('session-1');
    });

    it('handles corrupted history gracefully', async () => {
      storage.setItem(LocalStorageShoppingSessionRepository.HISTORY_KEY, '{invalid');
      const history = await repository.listHistory();
      expect(history).toEqual([]);
    });
  });

  describe('in-memory fallback when window is undefined', () => {
    it('instantiates repository with fallback when no storage is provided in Node environment', async () => {
      const fallbackRepo = new LocalStorageShoppingSessionRepository();
      const session = ShoppingSession.create({ storeName: 'Fallback Store' });
      session.addItem({
        name: 'Pan de Molde',
        unitPrice: Money.fromCents(145),
        quantity: 1,
      });

      await fallbackRepo.save(session);
      const retrieved = await fallbackRepo.getActiveSession();

      expect(retrieved).not.toBeNull();
      expect(retrieved!.storeName).toBe('Fallback Store');
      expect(retrieved!.items[0].unitPrice.cents).toBe(145);
    });
  });
});
