import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ShoppingSession,
  Money,
} from '../../../src/domain/index.js';
import { SqliteShoppingSessionRepository } from '../../../src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.js';

describe('SqliteShoppingSessionRepository', () => {
  let repository: SqliteShoppingSessionRepository;

  beforeEach(() => {
    repository = new SqliteShoppingSessionRepository(':memory:');
  });

  afterEach(() => {
    repository.close();
  });

  describe('getActiveSession', () => {
    it('returns null when there is no active session in the database', async () => {
      const active = await repository.getActiveSession();
      expect(active).toBeNull();
    });

    it('returns null when all sessions in the database are completed or discarded', async () => {
      const session = ShoppingSession.create({ storeName: 'Lidl' });
      session.addItem({
        name: 'Agua Mineral',
        unitPrice: Money.fromCents(65),
        quantity: 2,
      });
      session.complete();
      await repository.save(session);

      const active = await repository.getActiveSession();
      expect(active).toBeNull();
    });

    it('returns the most recent active session when multiple sessions exist', async () => {
      const session1 = new ShoppingSession({
        id: 'session-old',
        startedAt: new Date('2026-09-20T10:00:00.000Z'),
        status: 'ACTIVE',
        storeName: 'Mercadona',
      });
      const session2 = new ShoppingSession({
        id: 'session-new',
        startedAt: new Date('2026-09-27T10:00:00.000Z'),
        status: 'ACTIVE',
        storeName: 'Carrefour',
      });

      await repository.save(session1);
      await repository.save(session2);

      const active = await repository.getActiveSession();
      expect(active).not.toBeNull();
      expect(active?.id).toBe('session-new');
      expect(active?.storeName).toBe('Carrefour');
    });
  });

  describe('save and retrieve active session', () => {
    it('saves and retrieves an active session with multiple item types (barcode, manual, bulk)', async () => {
      const session = ShoppingSession.create({ storeName: 'Mercadona Centro' });

      // 1. Barcode item
      const barcodeItem = session.addItem({
        barcode: '8410123456789',
        name: 'Leche Entera 1L',
        unitPrice: Money.fromCents(215),
        quantity: 2,
        discount: Money.fromCents(30),
      });

      // 2. Manual item (no barcode)
      const manualItem = session.addItem({
        name: 'Pan Barra Rústica',
        unitPrice: Money.fromCents(85),
        quantity: 3,
      });

      // 3. Bulk item (granel/báscula)
      const bulkItem = session.addItem({
        name: 'Plátanos de Canarias',
        unitPrice: Money.fromCents(187),
        quantity: 1,
        isBulk: true,
      });

      await repository.save(session);

      const loaded = await repository.getActiveSession();
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
      expect(loaded!.status).toBe('ACTIVE');
      expect(loaded!.storeName).toBe('Mercadona Centro');
      expect(loaded!.startedAt.getTime()).toBe(session.startedAt.getTime());
      expect(loaded!.endedAt).toBeUndefined();

      expect(loaded!.items).toHaveLength(3);

      // Verify barcode item
      const retrievedBarcodeItem = loaded!.items.find((i) => i.id === barcodeItem.id);
      expect(retrievedBarcodeItem).toBeDefined();
      expect(retrievedBarcodeItem!.barcode).toBe('8410123456789');
      expect(retrievedBarcodeItem!.name).toBe('Leche Entera 1L');
      expect(retrievedBarcodeItem!.unitPrice.cents).toBe(215);
      expect(retrievedBarcodeItem!.quantity).toBe(2);
      expect(retrievedBarcodeItem!.discount.cents).toBe(30);
      expect(retrievedBarcodeItem!.isBulk).toBe(false);
      expect(retrievedBarcodeItem!.subtotal().cents).toBe(400); // 215 * 2 - 30

      // Verify manual item
      const retrievedManualItem = loaded!.items.find((i) => i.id === manualItem.id);
      expect(retrievedManualItem).toBeDefined();
      expect(retrievedManualItem!.barcode).toBeUndefined();
      expect(retrievedManualItem!.name).toBe('Pan Barra Rústica');
      expect(retrievedManualItem!.unitPrice.cents).toBe(85);
      expect(retrievedManualItem!.quantity).toBe(3);
      expect(retrievedManualItem!.discount.cents).toBe(0);
      expect(retrievedManualItem!.isBulk).toBe(false);
      expect(retrievedManualItem!.subtotal().cents).toBe(255); // 85 * 3

      // Verify bulk item
      const retrievedBulkItem = loaded!.items.find((i) => i.id === bulkItem.id);
      expect(retrievedBulkItem).toBeDefined();
      expect(retrievedBulkItem!.barcode).toBeUndefined();
      expect(retrievedBulkItem!.name).toBe('Plátanos de Canarias');
      expect(retrievedBulkItem!.unitPrice.cents).toBe(187);
      expect(retrievedBulkItem!.quantity).toBe(1);
      expect(retrievedBulkItem!.discount.cents).toBe(0);
      expect(retrievedBulkItem!.isBulk).toBe(true);
      expect(retrievedBulkItem!.subtotal().cents).toBe(187);

      // Verify aggregated totals
      expect(loaded!.total().cents).toBe(400 + 255 + 187); // 842 cents = 8,42 €
      expect(loaded!.totalItemCount()).toBe(2 + 3 + 1); // 6
    });

    it('preserves the order of items as they were added', async () => {
      const session = ShoppingSession.create();
      session.addItem({ name: 'First Item', unitPrice: Money.fromCents(100), quantity: 1 });
      session.addItem({ name: 'Second Item', unitPrice: Money.fromCents(200), quantity: 2 });
      session.addItem({ name: 'Third Item', unitPrice: Money.fromCents(300), quantity: 3 });

      await repository.save(session);

      const loaded = await repository.getActiveSession();
      expect(loaded!.items.map((i) => i.name)).toEqual(['First Item', 'Second Item', 'Third Item']);
    });
  });

  describe('save updates (mutation cycle)', () => {
    it('accurately updates quantities, prices, removes items and reflects exact persistence state', async () => {
      const session = ShoppingSession.create({ storeName: 'Aldi' });

      const item1 = session.addItem({
        name: 'Arroz Redondo 1kg',
        unitPrice: Money.fromCents(135),
        quantity: 1,
      });

      const item2 = session.addItem({
        name: 'Aceite de Oliva 1L',
        unitPrice: Money.fromCents(890),
        quantity: 2,
      });

      await repository.save(session);

      // Initial state verification
      let loaded = await repository.getActiveSession();
      expect(loaded!.items).toHaveLength(2);
      expect(loaded!.total().cents).toBe(135 + 890 * 2); // 1915

      // 1. Increment quantity of item 1
      session.updateItemQuantity(item1.id, 5);

      // 2. Change price of item 1 (e.g. shelf price correction)
      session.updateItemPrice(item1.id, Money.fromCents(140));

      // 3. Remove item 2 from cart
      session.removeItem(item2.id);

      // 4. Add a new item 3
      const item3 = session.addItem({
        barcode: '840000000001',
        name: 'Yogur Natural Pack 4',
        unitPrice: Money.fromCents(120),
        quantity: 2,
      });

      await repository.save(session);

      // Reload and verify mutations are strictly persisted
      loaded = await repository.getActiveSession();
      expect(loaded!.items).toHaveLength(2);

      const loadedItem1 = loaded!.items.find((i) => i.id === item1.id);
      expect(loadedItem1).toBeDefined();
      expect(loadedItem1!.quantity).toBe(5);
      expect(loadedItem1!.unitPrice.cents).toBe(140);
      expect(loadedItem1!.subtotal().cents).toBe(140 * 5); // 700 cents

      const loadedItem2 = loaded!.items.find((i) => i.id === item2.id);
      expect(loadedItem2).toBeUndefined();

      const loadedItem3 = loaded!.items.find((i) => i.id === item3.id);
      expect(loadedItem3).toBeDefined();
      expect(loadedItem3!.barcode).toBe('840000000001');
      expect(loadedItem3!.quantity).toBe(2);
      expect(loadedItem3!.unitPrice.cents).toBe(120);
      expect(loadedItem3!.subtotal().cents).toBe(240);

      expect(loaded!.total().cents).toBe(700 + 240); // 940 cents
      expect(loaded!.totalItemCount()).toBe(5 + 2); // 7
    });
  });

  describe('session completion and listHistory', () => {
    it('completing a session makes it no longer active but present in listHistory', async () => {
      const session = ShoppingSession.create({ storeName: 'Dia' });
      session.addItem({
        name: 'Café Molido Natural',
        unitPrice: Money.fromCents(320),
        quantity: 2,
      });

      await repository.save(session);

      // While active, it is returned by getActiveSession and NOT in listHistory
      expect(await repository.getActiveSession()).not.toBeNull();
      expect(await repository.listHistory()).toHaveLength(0);

      // Complete the session
      session.complete();
      expect(session.status).toBe('COMPLETED');
      expect(session.endedAt).toBeInstanceOf(Date);

      await repository.save(session);

      // After completion, getActiveSession is null
      const activeAfter = await repository.getActiveSession();
      expect(activeAfter).toBeNull();

      // But it appears in listHistory
      const history = await repository.listHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(session.id);
      expect(history[0].status).toBe('COMPLETED');
      expect(history[0].storeName).toBe('Dia');
      expect(history[0].endedAt?.getTime()).toBe(session.endedAt?.getTime());
      expect(history[0].items).toHaveLength(1);
      expect(history[0].items[0].name).toBe('Café Molido Natural');
      expect(history[0].total().cents).toBe(640);
    });

    it('paginates history sessions ordered chronologically descending', async () => {
      const s1 = new ShoppingSession({
        id: 'session-1',
        startedAt: new Date('2026-09-01T10:00:00.000Z'),
        endedAt: new Date('2026-09-01T10:30:00.000Z'),
        status: 'COMPLETED',
        storeName: 'Store 1',
      });
      const s2 = new ShoppingSession({
        id: 'session-2',
        startedAt: new Date('2026-09-02T10:00:00.000Z'),
        endedAt: new Date('2026-09-02T10:30:00.000Z'),
        status: 'COMPLETED',
        storeName: 'Store 2',
      });
      const s3 = new ShoppingSession({
        id: 'session-3',
        startedAt: new Date('2026-09-03T10:00:00.000Z'),
        endedAt: new Date('2026-09-03T10:30:00.000Z'),
        status: 'COMPLETED',
        storeName: 'Store 3',
      });

      await repository.save(s1);
      await repository.save(s2);
      await repository.save(s3);

      // First page with limit 2
      const page1 = await repository.listHistory(2, 0);
      expect(page1).toHaveLength(2);
      expect(page1[0].id).toBe('session-3');
      expect(page1[1].id).toBe('session-2');

      // Second page with offset 2
      const page2 = await repository.listHistory(2, 2);
      expect(page2).toHaveLength(1);
      expect(page2[0].id).toBe('session-1');
    });
  });

  describe('getById', () => {
    it('returns null for non-existing id', async () => {
      const result = await repository.getById('non-existent-id');
      expect(result).toBeNull();
    });

    it('returns the session with all items when found by id', async () => {
      const session = ShoppingSession.create({ storeName: 'Consum' });
      session.addItem({
        name: 'Galletas María',
        unitPrice: Money.fromCents(150),
        quantity: 1,
      });
      await repository.save(session);

      const found = await repository.getById(session.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(session.id);
      expect(found!.storeName).toBe('Consum');
      expect(found!.items).toHaveLength(1);
      expect(found!.items[0].name).toBe('Galletas María');
    });
  });

  describe('preservation of cents in prices and subtotals', () => {
    it('preserves exact integer cents without floating-point distortion or precision loss', async () => {
      const session = ShoppingSession.create();

      // Typical floating-point trap: 0.10 + 0.20 !== 0.30 in IEEE 754
      session.addItem({
        name: 'Item 10 cents',
        unitPrice: Money.fromCents(10),
        quantity: 1,
      });
      session.addItem({
        name: 'Item 20 cents',
        unitPrice: Money.fromCents(20),
        quantity: 1,
      });

      // Item with large quantity and odd cents: 7 * 1,43 € - 0,15 € discount
      session.addItem({
        name: 'Odd Cents Item',
        unitPrice: Money.fromCents(143),
        quantity: 7,
        discount: Money.fromCents(15),
      });

      // High monetary amount: 12.345,67 € (1,234,567 cents)
      session.addItem({
        name: 'High Value Electronic Item',
        unitPrice: Money.fromCents(1234567),
        quantity: 2,
      });

      await repository.save(session);

      const loaded = await repository.getActiveSession();
      expect(loaded).not.toBeNull();

      const item1 = loaded!.items.find((i) => i.name === 'Item 10 cents');
      expect(item1!.unitPrice.cents).toBe(10);
      expect(item1!.subtotal().cents).toBe(10);

      const item2 = loaded!.items.find((i) => i.name === 'Item 20 cents');
      expect(item2!.unitPrice.cents).toBe(20);
      expect(item2!.subtotal().cents).toBe(20);

      const item3 = loaded!.items.find((i) => i.name === 'Odd Cents Item');
      expect(item3!.unitPrice.cents).toBe(143);
      expect(item3!.quantity).toBe(7);
      expect(item3!.discount.cents).toBe(15);
      // (143 * 7) - 15 = 1001 - 15 = 986 cents
      expect(item3!.subtotal().cents).toBe(986);

      const item4 = loaded!.items.find((i) => i.name === 'High Value Electronic Item');
      expect(item4!.unitPrice.cents).toBe(1234567);
      expect(item4!.quantity).toBe(2);
      expect(item4!.subtotal().cents).toBe(2469134);

      // Total session calculation in cents
      const expectedTotal = 10 + 20 + 986 + 2469134;
      expect(loaded!.total().cents).toBe(expectedTotal);
      expect(loaded!.total().toDecimalString()).toBe('24701,50');
    });
  });

  describe('Database options and pragmas', () => {
    it('accepts an existing DatabaseSync instance in constructor', async () => {
      const customDb = new DatabaseSync(':memory:');
      const customRepo = new SqliteShoppingSessionRepository(customDb);

      const session = ShoppingSession.create({ storeName: 'CustomDB Store' });
      await customRepo.save(session);

      const retrieved = await customRepo.getActiveSession();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.storeName).toBe('CustomDB Store');

      customRepo.close();
    });

    it('enforces foreign key constraints with ON DELETE CASCADE', async () => {
      const session = ShoppingSession.create({ storeName: 'Cascade Test' });
      session.addItem({ name: 'Item to cascade', unitPrice: Money.fromCents(100), quantity: 1 });
      await repository.save(session);

      // Direct inspection of database via underlying DatabaseSync
      const db = (repository as unknown as { db: DatabaseSync }).db;

      // Foreign keys check
      const fkPragma = db.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };
      expect(fkPragma.foreign_keys).toBe(1);

      // Verify items exist
      const countBefore = (db.prepare('SELECT COUNT(*) as c FROM cart_items WHERE session_id = ?').get(session.id) as { c: number }).c;
      expect(countBefore).toBe(1);

      // Manually delete session from shopping_sessions
      db.prepare('DELETE FROM shopping_sessions WHERE id = ?').run(session.id);

      // Cascading delete must have removed the cart_items
      const countAfter = (db.prepare('SELECT COUNT(*) as c FROM cart_items WHERE session_id = ?').get(session.id) as { c: number }).c;
      expect(countAfter).toBe(0);
    });

    it('applies WAL mode on file-based databases', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cestacuenta-test-'));
      const dbPath = path.join(tempDir, 'test_wal.db');

      const fileRepo = new SqliteShoppingSessionRepository(dbPath);
      const db = (fileRepo as unknown as { db: DatabaseSync }).db;

      const journalMode = (db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string }).journal_mode;
      expect(journalMode.toLowerCase()).toBe('wal');

      fileRepo.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });
});
