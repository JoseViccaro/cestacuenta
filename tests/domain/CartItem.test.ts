import { describe, it, expect } from 'vitest';
import { CartItem } from '../../src/domain/entities/CartItem.js';
import { Money } from '../../src/domain/value-objects/Money.js';

describe('CartItem Entity', () => {
  const defaultItemProps = {
    id: 'item-1',
    sessionId: 'session-1',
    barcode: '8412345678901',
    name: 'Leche Desnatada 1L',
    unitPrice: Money.fromCents(120),
    quantity: 1,
  };

  describe('Creation and validation', () => {
    it('creates a valid CartItem instance with defaults', () => {
      const item = new CartItem(defaultItemProps);

      expect(item.id).toBe('item-1');
      expect(item.sessionId).toBe('session-1');
      expect(item.barcode).toBe('8412345678901');
      expect(item.name).toBe('Leche Desnatada 1L');
      expect(item.unitPrice.cents).toBe(120);
      expect(item.quantity).toBe(1);
      expect(item.isBulk).toBe(false);
      expect(item.discount.cents).toBe(0);
      expect(Object.isFrozen(item)).toBe(true);
    });

    it('creates an item with custom bulk and discount', () => {
      const item = new CartItem({
        ...defaultItemProps,
        isBulk: true,
        discount: Money.fromCents(30),
      });

      expect(item.isBulk).toBe(true);
      expect(item.discount.cents).toBe(30);
    });

    it('rejects invalid or empty identifiers and name', () => {
      expect(() => new CartItem({ ...defaultItemProps, id: '' })).toThrow('CartItem id must be a non-empty string');
      expect(() => new CartItem({ ...defaultItemProps, sessionId: '  ' })).toThrow(
        'CartItem sessionId must be a non-empty string'
      );
      expect(() => new CartItem({ ...defaultItemProps, name: '' })).toThrow(
        'CartItem name must be a non-empty string'
      );
    });

    it('rejects non-Money unitPrice or discount', () => {
      expect(
        () => new CartItem({ ...defaultItemProps, unitPrice: 120 as unknown as Money })
      ).toThrow('unitPrice must be an instance of Money');
      expect(
        () => new CartItem({ ...defaultItemProps, discount: 50 as unknown as Money })
      ).toThrow('discount must be an instance of Money');
    });

    it('rejects invalid quantities', () => {
      expect(() => new CartItem({ ...defaultItemProps, quantity: 0 })).toThrow(
        'quantity must be an integer greater than or equal to 1'
      );
      expect(() => new CartItem({ ...defaultItemProps, quantity: -2 })).toThrow(
        'quantity must be an integer greater than or equal to 1'
      );
      expect(() => new CartItem({ ...defaultItemProps, quantity: 1.5 })).toThrow(
        'quantity must be an integer greater than or equal to 1'
      );
    });
  });

  describe('Subtotal calculation and negative protection', () => {
    it('calculates subtotal without discount: unitPrice * quantity', () => {
      const item = new CartItem({
        ...defaultItemProps,
        unitPrice: Money.fromCents(250), // 2.50 €
        quantity: 3,
      });

      expect(item.subtotal().cents).toBe(750);
      expect(item.subtotal().toFormattedString()).toBe('7,50 €');
    });

    it('calculates subtotal subtracting discount: (unitPrice * quantity) - discount', () => {
      const item = new CartItem({
        ...defaultItemProps,
        unitPrice: Money.fromCents(200), // 2.00 €
        quantity: 3, // 6.00 €
        discount: Money.fromCents(50), // 0.50 € discount
      });

      expect(item.subtotal().cents).toBe(550);
      expect(item.subtotal().toFormattedString()).toBe('5,50 €');
    });

    it('protects against negative subtotals when discount exceeds gross amount', () => {
      const item = new CartItem({
        ...defaultItemProps,
        unitPrice: Money.fromCents(100),
        quantity: 1,
        discount: Money.fromCents(250), // discount > unitPrice * quantity
      });

      expect(item.subtotal().cents).toBe(0);
      expect(item.subtotal().toFormattedString()).toBe('0,00 €');
    });
  });

  describe('Immutable updates', () => {
    it('returns a new CartItem when withQuantity is called, leaving original intact', () => {
      const original = new CartItem(defaultItemProps);
      const updated = original.withQuantity(5);

      expect(updated).not.toBe(original);
      expect(updated.quantity).toBe(5);
      expect(original.quantity).toBe(1);
      expect(updated.id).toBe(original.id);
      expect(updated.name).toBe(original.name);
      expect(updated.unitPrice.equals(original.unitPrice)).toBe(true);
    });

    it('returns a new CartItem when withUnitPrice is called, leaving original intact', () => {
      const original = new CartItem(defaultItemProps);
      const newPrice = Money.fromCents(199);
      const updated = original.withUnitPrice(newPrice);

      expect(updated).not.toBe(original);
      expect(updated.unitPrice.cents).toBe(199);
      expect(original.unitPrice.cents).toBe(120);
      expect(updated.quantity).toBe(original.quantity);
    });

    it('returns a new CartItem when withDiscount is called, leaving original intact', () => {
      const original = new CartItem(defaultItemProps);
      const discount = Money.fromCents(40);
      const updated = original.withDiscount(discount);

      expect(updated).not.toBe(original);
      expect(updated.discount.cents).toBe(40);
      expect(original.discount.cents).toBe(0);
    });

    it('prevents direct mutation due to Object.freeze', () => {
      const item = new CartItem(defaultItemProps);
      expect(() => {
        (item as unknown as { quantity: number }).quantity = 10;
      }).toThrow();
    });
  });
});
