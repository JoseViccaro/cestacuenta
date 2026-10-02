import { describe, it, expect } from 'vitest';
import { ShoppingSession } from '../../src/domain/entities/ShoppingSession.js';
import { Money } from '../../src/domain/value-objects/Money.js';

describe('ShoppingSession Entity', () => {
  describe('Lifecycle and state transitions', () => {
    it('initializes in ACTIVE status with default values', () => {
      const session = ShoppingSession.create({ storeName: 'Mercadona' });

      expect(session.id).toBeDefined();
      expect(session.status).toBe('ACTIVE');
      expect(session.startedAt).toBeInstanceOf(Date);
      expect(session.endedAt).toBeUndefined();
      expect(session.storeName).toBe('Mercadona');
      expect(session.items).toEqual([]);
      expect(session.total().cents).toBe(0);
      expect(session.totalItemCount()).toBe(0);
    });

    it('completes an active session', () => {
      const session = ShoppingSession.create();
      session.complete();

      expect(session.status).toBe('COMPLETED');
      expect(session.endedAt).toBeInstanceOf(Date);
    });

    it('discards an active session', () => {
      const session = ShoppingSession.create();
      session.discard();

      expect(session.status).toBe('DISCARDED');
      expect(session.endedAt).toBeInstanceOf(Date);
    });

    it('prevents any modification on a completed or discarded session', () => {
      const session = ShoppingSession.create();
      session.complete();

      expect(() => session.complete()).toThrow('Cannot modify session: session is already COMPLETED');
      expect(() => session.discard()).toThrow('Cannot modify session: session is already COMPLETED');
      expect(() =>
        session.addItem({
          name: 'Pan',
          unitPrice: Money.fromCents(100),
          quantity: 1,
        })
      ).toThrow('Cannot modify session: session is already COMPLETED');
      expect(() => session.scanBarcode('123456', Money.fromCents(100))).toThrow(
        'Cannot modify session: session is already COMPLETED'
      );
      expect(() => session.updateItemQuantity('item-1', 2)).toThrow(
        'Cannot modify session: session is already COMPLETED'
      );
      expect(() => session.updateItemPrice('item-1', Money.fromCents(200))).toThrow(
        'Cannot modify session: session is already COMPLETED'
      );
      expect(() => session.removeItem('item-1')).toThrow(
        'Cannot modify session: session is already COMPLETED'
      );
    });
  });

  describe('Adding manual items', () => {
    it('adds a manual item to the session and sets sessionId', () => {
      const session = ShoppingSession.create();
      const item = session.addItem({
        name: 'Plátanos de Canarias',
        unitPrice: Money.fromCents(180),
        quantity: 2,
        isBulk: true,
      });

      expect(item.id).toBeDefined();
      expect(item.sessionId).toBe(session.id);
      expect(item.name).toBe('Plátanos de Canarias');
      expect(item.unitPrice.cents).toBe(180);
      expect(item.quantity).toBe(2);
      expect(item.isBulk).toBe(true);

      expect(session.items).toHaveLength(1);
      expect(session.items[0].id).toBe(item.id);
      expect(session.total().cents).toBe(360);
      expect(session.totalItemCount()).toBe(2);
    });
  });

  describe('Barcode scanning behavior', () => {
    it('increments quantity when scanning the same barcode with the SAME price', () => {
      const session = ShoppingSession.create();
      const barcode = '8412345678901';
      const price = Money.fromCents(250); // 2.50 €

      // 1st scan
      const firstScan = session.scanBarcode(barcode, price, 'Café Molido 250g');
      expect(firstScan.isNew).toBe(true);
      expect(firstScan.item.quantity).toBe(1);
      expect(firstScan.item.name).toBe('Café Molido 250g');
      expect(session.items).toHaveLength(1);

      // 2nd scan of same product at same price
      const secondScan = session.scanBarcode(barcode, price, 'Café Molido 250g');
      expect(secondScan.isNew).toBe(false);
      expect(secondScan.item.quantity).toBe(2);
      expect(session.items).toHaveLength(1);
      expect(session.items[0].quantity).toBe(2);
      expect(session.total().cents).toBe(500); // 2 * 2.50 = 5.00 €
      expect(session.totalItemCount()).toBe(2);
    });

    it('creates a NEW separate line when scanning the same barcode with a DIFFERENT price', () => {
      // Key case: Yellow clearance sticker or discounted expiry unit for the same barcode
      const session = ShoppingSession.create();
      const barcode = '8412345678901';
      const regularPrice = Money.fromCents(250); // 2.50 €
      const discountedPrice = Money.fromCents(150); // 1.50 € (yellow sticker)

      // Scan 1: Regular price item
      const scan1 = session.scanBarcode(barcode, regularPrice, 'Yogur Griego 4x');
      expect(scan1.isNew).toBe(true);
      expect(scan1.item.quantity).toBe(1);
      expect(scan1.item.unitPrice.cents).toBe(250);

      // Scan 2: Same barcode, but discounted sticker price
      const scan2 = session.scanBarcode(barcode, discountedPrice, 'Yogur Griego 4x (Descuento caducidad)');
      expect(scan2.isNew).toBe(true);
      expect(scan2.item.quantity).toBe(1);
      expect(scan2.item.unitPrice.cents).toBe(150);

      // The session MUST have 2 distinct lines
      expect(session.items).toHaveLength(2);
      expect(session.items[0].id).not.toBe(session.items[1].id);
      expect(session.items[0].barcode).toBe(barcode);
      expect(session.items[1].barcode).toBe(barcode);
      expect(session.items[0].unitPrice.cents).toBe(250);
      expect(session.items[1].unitPrice.cents).toBe(150);

      // Total must be 2.50 € + 1.50 € = 4.00 €
      expect(session.total().cents).toBe(400);
      expect(session.total().toFormattedString()).toBe('4,00 €');
      expect(session.totalItemCount()).toBe(2);

      // Scan 3: Another discounted unit (same barcode and discounted price)
      const scan3 = session.scanBarcode(barcode, discountedPrice);
      expect(scan3.isNew).toBe(false);
      expect(scan3.item.quantity).toBe(2);
      expect(session.items).toHaveLength(2);

      // Total must be 1*2.50 + 2*1.50 = 2.50 + 3.00 = 5.50 €
      expect(session.total().cents).toBe(550);
      expect(session.total().toFormattedString()).toBe('5,50 €');
      expect(session.totalItemCount()).toBe(3);
    });

    it('supports isBulk flag when scanning bulk or scale items', () => {
      const session = ShoppingSession.create();
      const barcode = '2100123004507';
      const price = Money.fromCents(450);

      const result = session.scanBarcode(barcode, price, 'Manzanas Balanza', true);
      expect(result.isNew).toBe(true);
      expect(result.item.isBulk).toBe(true);
      expect(result.item.name).toBe('Manzanas Balanza');
      expect(session.items[0].isBulk).toBe(true);
    });

    it('rejects invalid barcode or unitPrice', () => {
      const session = ShoppingSession.create();
      expect(() => session.scanBarcode('', Money.fromCents(100))).toThrow('Barcode must be a non-empty string');
      expect(() => session.scanBarcode('123', 100 as unknown as Money)).toThrow(
        'unitPrice must be an instance of Money'
      );
    });
  });

  describe('Updating prices and recalculating totals', () => {
    it('updates unit price on existing line and recalculates total', () => {
      const session = ShoppingSession.create();
      const item = session.addItem({
        name: 'Aceite de Oliva 1L',
        unitPrice: Money.fromCents(850),
        quantity: 2,
      });

      expect(session.total().cents).toBe(1700);

      // User corrects price to 7.95 €
      session.updateItemPrice(item.id, Money.fromCents(795));

      expect(session.items[0].unitPrice.cents).toBe(795);
      expect(session.total().cents).toBe(1590); // 2 * 7.95 = 15.90 €
      expect(session.total().toFormattedString()).toBe('15,90 €');
    });

    it('throws when updating price on a non-existent item id', () => {
      const session = ShoppingSession.create();
      expect(() => session.updateItemPrice('non-existent', Money.fromCents(100))).toThrow(
        'Item with id "non-existent" not found in session'
      );
    });
  });

  describe('Quantity adjustments and item deletion', () => {
    it('updates item quantity to a positive number', () => {
      const session = ShoppingSession.create();
      const item = session.addItem({
        name: 'Manzanas',
        unitPrice: Money.fromCents(200),
        quantity: 1,
      });

      session.updateItemQuantity(item.id, 4);

      expect(session.items[0].quantity).toBe(4);
      expect(session.total().cents).toBe(800);
      expect(session.totalItemCount()).toBe(4);
    });

    it('removes item automatically when quantity is updated to 0 or negative', () => {
      const session = ShoppingSession.create();
      const item1 = session.addItem({
        name: 'Item 1',
        unitPrice: Money.fromCents(100),
        quantity: 2,
      });
      const item2 = session.addItem({
        name: 'Item 2',
        unitPrice: Money.fromCents(200),
        quantity: 1,
      });

      expect(session.items).toHaveLength(2);

      // Set quantity to 0 -> removes item
      session.updateItemQuantity(item1.id, 0);
      expect(session.items).toHaveLength(1);
      expect(session.items[0].id).toBe(item2.id);

      // Set quantity to negative -> removes item
      session.updateItemQuantity(item2.id, -1);
      expect(session.items).toHaveLength(0);
      expect(session.total().cents).toBe(0);
      expect(session.totalItemCount()).toBe(0);
    });

    it('explicitly removes item via removeItem', () => {
      const session = ShoppingSession.create();
      const item = session.addItem({
        name: 'Item to delete',
        unitPrice: Money.fromCents(300),
        quantity: 1,
      });

      expect(session.items).toHaveLength(1);
      session.removeItem(item.id);
      expect(session.items).toHaveLength(0);
      expect(session.total().cents).toBe(0);
    });

    it('throws when removing or updating quantity for non-existent item id', () => {
      const session = ShoppingSession.create();
      expect(() => session.removeItem('unknown')).toThrow('Item with id "unknown" not found');
      expect(() => session.updateItemQuantity('unknown', 3)).toThrow('Item with id "unknown" not found');
    });
  });

  describe('Aggregate calculations: Total Estimado and Item Count', () => {
    it('computes total and item count with multiple items and discounts', () => {
      const session = ShoppingSession.create({ storeName: 'Carrefour' });

      // Item 1: 3x @ 2.00 € with 0.50 € discount = 5.50 €
      session.addItem({
        name: 'Pack Refrescos',
        unitPrice: Money.fromCents(200),
        quantity: 3,
        discount: Money.fromCents(50),
      });

      // Item 2: 1x @ 4.25 € with 0 discount = 4.25 €
      session.addItem({
        name: 'Detergente',
        unitPrice: Money.fromCents(425),
        quantity: 1,
      });

      // Item 3: 2x @ 1.10 € with 3.00 € discount -> subtotal clamped to 0 €
      session.addItem({
        name: 'Galletas',
        unitPrice: Money.fromCents(110),
        quantity: 2,
        discount: Money.fromCents(300),
      });

      // Expected total: 5.50 € (550) + 4.25 € (425) + 0.00 € (0) = 9.75 € (975 cents)
      expect(session.total().cents).toBe(975);
      expect(session.total().toFormattedString()).toBe('9,75 €');
      expect(session.total().toDecimalString()).toBe('9,75');

      // Expected item count: 3 + 1 + 2 = 6 units
      expect(session.totalItemCount()).toBe(6);
    });

    it('preserves array encapsulation on items getter', () => {
      const session = ShoppingSession.create();
      session.addItem({
        name: 'Test Item',
        unitPrice: Money.fromCents(100),
        quantity: 1,
      });

      const retrievedItems = session.items;
      expect(retrievedItems).toHaveLength(1);

      // Mutating the returned array must not affect the session
      retrievedItems.pop();
      expect(session.items).toHaveLength(1);
    });
  });

  describe('Budget Management and Live Guardrails', () => {
    it('initializes with budgetLimit undefined by default and creates with budgetLimit', () => {
      const sessionDefault = ShoppingSession.create();
      expect(sessionDefault.budgetLimit).toBeUndefined();

      const limit = Money.fromCents(5000);
      const sessionWithLimit = new ShoppingSession({ budgetLimit: limit });
      expect(sessionWithLimit.budgetLimit).toBeDefined();
      expect(sessionWithLimit.budgetLimit?.cents).toBe(5000);
    });

    it('sets and updates budgetLimit on active session', () => {
      const session = ShoppingSession.create();
      const limit = Money.fromCents(6000);

      session.setBudgetLimit(limit);
      expect(session.budgetLimit?.cents).toBe(6000);

      const newLimit = Money.fromCents(7500);
      session.setBudgetLimit(newLimit);
      expect(session.budgetLimit?.cents).toBe(7500);
    });

    it('clears budgetLimit when passed null or undefined', () => {
      const session = ShoppingSession.create();
      session.setBudgetLimit(Money.fromCents(5000));
      expect(session.budgetLimit).toBeDefined();

      session.setBudgetLimit(null);
      expect(session.budgetLimit).toBeUndefined();

      session.setBudgetLimit(Money.fromCents(5000));
      session.setBudgetLimit(undefined);
      expect(session.budgetLimit).toBeUndefined();
    });

    it('enforces active session invariant on setBudgetLimit', () => {
      const session = ShoppingSession.create();
      session.complete();
      expect(() => session.setBudgetLimit(Money.fromCents(5000))).toThrow(
        'Cannot modify session: session is already COMPLETED'
      );

      const discardedSession = ShoppingSession.create();
      discardedSession.discard();
      expect(() => discardedSession.setBudgetLimit(Money.fromCents(5000))).toThrow(
        'Cannot modify session: session is already DISCARDED'
      );
    });

    it('rejects non-positive budget limits', () => {
      const session = ShoppingSession.create();
      expect(() => session.setBudgetLimit(Money.fromCents(0))).toThrow(
        'Budget limit must be greater than zero'
      );
    });

    it('rejects invalid budgetLimit types', () => {
      const session = ShoppingSession.create();
      expect(() => session.setBudgetLimit('invalid' as unknown as Money)).toThrow(
        'budgetLimit must be an instance of Money'
      );
    });

    it('returns NONE when no budget is configured', () => {
      const session = ShoppingSession.create();
      expect(session.budgetStatus()).toBe('NONE');
      expect(session.budgetMetrics()).toBeNull();
    });

    it('evaluates status and thresholds accurately: NORMAL (<80%), WARNING (80%-100%), EXCEEDED (>100%)', () => {
      const session = ShoppingSession.create();
      session.setBudgetLimit(Money.fromCents(10000)); // 100,00 €

      // 79,99 € -> NORMAL
      session.addItem({
        name: 'Item 1',
        unitPrice: Money.fromCents(7999),
        quantity: 1,
      });
      expect(session.budgetStatus()).toBe('NORMAL');

      // Add 0,01 € -> 80,00 € -> WARNING (exact boundary)
      const item2 = session.addItem({
        name: 'Item 2',
        unitPrice: Money.fromCents(1),
        quantity: 1,
      });
      expect(session.total().cents).toBe(8000);
      expect(session.budgetStatus()).toBe('WARNING');

      // Update item 2 to 20,01 € -> 100,00 € -> WARNING (exact cap boundary)
      session.updateItemPrice(item2.id, Money.fromCents(2001));
      expect(session.total().cents).toBe(10000);
      expect(session.budgetStatus()).toBe('WARNING');

      const metricsAtCap = session.budgetMetrics();
      expect(metricsAtCap).not.toBeNull();
      expect(metricsAtCap?.remaining.cents).toBe(0);
      expect(metricsAtCap?.overBudget.cents).toBe(0);
      expect(metricsAtCap?.percentage).toBe(100);

      // Add 0,01 € -> 100,01 € -> EXCEEDED
      session.addItem({
        name: 'Extra Item',
        unitPrice: Money.fromCents(1),
        quantity: 1,
      });
      expect(session.total().cents).toBe(10001);
      expect(session.budgetStatus()).toBe('EXCEEDED');
      const metricsExceeded = session.budgetMetrics();
      expect(metricsExceeded?.remaining.cents).toBe(0);
      expect(metricsExceeded?.overBudget.cents).toBe(1);
      expect(metricsExceeded?.percentage).toBe(100);
    });

    it('calculates percentage and defensive non-negative headroom/deficit correctly', () => {
      const session = ShoppingSession.create();
      session.setBudgetLimit(Money.fromCents(5000)); // 50,00 €

      session.addItem({
        name: 'Item 1',
        unitPrice: Money.fromCents(1500),
        quantity: 1,
      }); // 15,00 € -> 30%

      const metrics = session.budgetMetrics();
      expect(metrics).not.toBeNull();
      expect(metrics?.percentage).toBe(30);
      expect(metrics?.remaining.cents).toBe(3500);
      expect(metrics?.overBudget.cents).toBe(0);

      // Add item exceeding budget: 50,00 € + 20,00 € = 70,00 € (140%)
      session.addItem({
        name: 'Item 2',
        unitPrice: Money.fromCents(5500),
        quantity: 1,
      });
      expect(session.total().cents).toBe(7000);

      const metricsOver = session.budgetMetrics();
      expect(metricsOver).not.toBeNull();
      expect(metricsOver?.percentage).toBe(140);
      expect(metricsOver?.remaining.cents).toBe(0);
      expect(metricsOver?.overBudget.cents).toBe(2000);
      expect(metricsOver?.status).toBe('EXCEEDED');
    });

    it('computes dynamic margin per pending item', () => {
      const session = ShoppingSession.create();
      session.setBudgetLimit(Money.fromCents(5000)); // 50,00 €

      session.addItem({
        name: 'Item',
        unitPrice: Money.fromCents(2000),
        quantity: 1,
      }); // 20,00 € total, 30,00 € remaining

      // 4 pending items: 3000 / 4 = 750 cents (7,50 €)
      const metrics4 = session.budgetMetrics(4);
      expect(metrics4?.marginPerPendingItem?.cents).toBe(750);
      expect(metrics4?.marginPerPendingItem?.toFormattedString()).toBe('7,50 €');

      // 0 pending items or undefined -> null
      expect(session.budgetMetrics(0)?.marginPerPendingItem).toBeNull();
      expect(session.budgetMetrics(undefined)?.marginPerPendingItem).toBeNull();
      expect(session.budgetMetrics(-2)?.marginPerPendingItem).toBeNull();

      // Exceeded budget with pending items -> Money.zero()
      session.addItem({
        name: 'Item Big',
        unitPrice: Money.fromCents(3500),
        quantity: 1,
      }); // Total 55,00 € > 50,00 €
      const metricsExceeded = session.budgetMetrics(3);
      expect(metricsExceeded?.marginPerPendingItem?.cents).toBe(0);
      expect(metricsExceeded?.marginPerPendingItem?.toFormattedString()).toBe('0,00 €');
    });
  });
});
