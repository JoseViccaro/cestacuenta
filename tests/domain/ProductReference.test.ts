import { describe, it, expect } from 'vitest';
import { Money } from '../../src/domain/value-objects/Money.js';
import { ProductReference } from '../../src/domain/entities/ProductReference.js';

describe('ProductReference', () => {
  const validBarcode = '8410123456789';
  const validName = 'Leche Entera 1L';
  const validPrice = Money.fromCents(125);

  describe('creation & validation', () => {
    it('creates an instance with props object', () => {
      const now = new Date('2026-09-27T10:00:00Z');
      const product = new ProductReference({
        barcode: validBarcode,
        name: validName,
        lastPrice: validPrice,
        updatedAt: now,
      });

      expect(product.barcode).toBe(validBarcode);
      expect(product.name).toBe(validName);
      expect(product.lastPrice).toBe(validPrice);
      expect(product.updatedAt).toBe(now);
    });

    it('creates an instance with positional arguments', () => {
      const now = new Date('2026-09-27T10:00:00Z');
      const product = new ProductReference(validBarcode, validName, validPrice, now);

      expect(product.barcode).toBe(validBarcode);
      expect(product.name).toBe(validName);
      expect(product.lastPrice).toBe(validPrice);
      expect(product.updatedAt).toBe(now);
    });

    it('defaults updatedAt to current date when omitted', () => {
      const before = new Date();
      const product = new ProductReference({
        barcode: validBarcode,
        name: validName,
        lastPrice: validPrice,
      });
      const after = new Date();

      expect(product.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(product.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('trims barcode and name', () => {
      const product = new ProductReference({
        barcode: '   8410123456789   ',
        name: '   Yogur Natural   ',
        lastPrice: validPrice,
      });

      expect(product.barcode).toBe('8410123456789');
      expect(product.name).toBe('Yogur Natural');
    });

    it('throws when barcode is empty or invalid', () => {
      expect(() => new ProductReference({ barcode: '', name: validName, lastPrice: validPrice })).toThrow(
        /barcode must be a non-empty string/
      );
      expect(() => new ProductReference({ barcode: '   ', name: validName, lastPrice: validPrice })).toThrow(
        /barcode must be a non-empty string/
      );
    });

    it('throws when name is empty or invalid', () => {
      expect(() => new ProductReference({ barcode: validBarcode, name: '', lastPrice: validPrice })).toThrow(
        /name must be a non-empty string/
      );
      expect(() => new ProductReference({ barcode: validBarcode, name: '   ', lastPrice: validPrice })).toThrow(
        /name must be a non-empty string/
      );
    });

    it('throws when lastPrice is not an instance of Money', () => {
      expect(
        () =>
          new ProductReference({
            barcode: validBarcode,
            name: validName,
            lastPrice: 125 as unknown as Money,
          })
      ).toThrow(/lastPrice must be an instance of Money/);
    });

    it('throws when lastPrice is zero or negative', () => {
      expect(
        () =>
          new ProductReference({
            barcode: validBarcode,
            name: validName,
            lastPrice: Money.fromCents(0),
          })
      ).toThrow(/lastPrice must be greater than zero/);

      const fakeNegativeMoney = Object.create(Money.prototype);
      Object.assign(fakeNegativeMoney, { cents: -10 });
      expect(
        () =>
          new ProductReference({
            barcode: validBarcode,
            name: validName,
            lastPrice: fakeNegativeMoney,
          })
      ).toThrow(/lastPrice must be greater than zero/);
    });

    it('throws when updatedAt is an invalid date', () => {
      expect(
        () =>
          new ProductReference({
            barcode: validBarcode,
            name: validName,
            lastPrice: validPrice,
            updatedAt: new Date('invalid-date'),
          })
      ).toThrow(/updatedAt must be a valid Date/);
    });

    it('is immutable and frozen', () => {
      const product = new ProductReference({
        barcode: validBarcode,
        name: validName,
        lastPrice: validPrice,
      });

      expect(Object.isFrozen(product)).toBe(true);
      expect(() => {
        (product as unknown as { name: string }).name = 'Modified';
      }).toThrow();
    });
  });

  describe('withName', () => {
    it('returns a new ProductReference with updated name and new timestamp', () => {
      const originalTime = new Date('2026-09-01T10:00:00Z');
      const product = new ProductReference({
        barcode: validBarcode,
        name: validName,
        lastPrice: validPrice,
        updatedAt: originalTime,
      });

      const updatedTime = new Date('2026-09-27T12:00:00Z');
      const updated = product.withName('Leche Desnatada 1L', updatedTime);

      expect(updated).not.toBe(product);
      expect(updated.barcode).toBe(validBarcode);
      expect(updated.name).toBe('Leche Desnatada 1L');
      expect(updated.lastPrice).toBe(validPrice);
      expect(updated.updatedAt).toBe(updatedTime);
      expect(product.name).toBe(validName);
    });
  });

  describe('withPrice', () => {
    it('returns a new ProductReference with updated price and new timestamp', () => {
      const originalTime = new Date('2026-09-01T10:00:00Z');
      const product = new ProductReference({
        barcode: validBarcode,
        name: validName,
        lastPrice: validPrice,
        updatedAt: originalTime,
      });

      const newPrice = Money.fromCents(135);
      const updatedTime = new Date('2026-09-27T12:00:00Z');
      const updated = product.withPrice(newPrice, updatedTime);

      expect(updated).not.toBe(product);
      expect(updated.barcode).toBe(validBarcode);
      expect(updated.name).toBe(validName);
      expect(updated.lastPrice.cents).toBe(135);
      expect(updated.updatedAt).toBe(updatedTime);
      expect(product.lastPrice.cents).toBe(125);
    });
  });
});
