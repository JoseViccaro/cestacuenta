import { describe, it, expect } from 'vitest';
import { Money } from '../../src/domain/value-objects/Money.js';

describe('Money Value Object', () => {
  describe('Creation from cents and validation', () => {
    it('creates Money instance from valid integer cents', () => {
      const zero = Money.fromCents(0);
      expect(zero.cents).toBe(0);

      const amount = Money.fromCents(145);
      expect(amount.cents).toBe(145);

      const staticZero = Money.zero();
      expect(staticZero.cents).toBe(0);
    });

    it('rejects negative numbers', () => {
      expect(() => Money.fromCents(-1)).toThrow('Invalid cents amount');
      expect(() => Money.fromCents(-500)).toThrow('Invalid cents amount');
      expect(() => new Money(-1)).toThrow('Invalid cents amount');
    });

    it('rejects non-integer floating point numbers', () => {
      expect(() => Money.fromCents(1.5)).toThrow('Invalid cents amount');
      expect(() => Money.fromCents(0.99)).toThrow('Invalid cents amount');
      expect(() => new Money(12.34)).toThrow('Invalid cents amount');
    });

    it('rejects NaN, Infinity, and non-number types', () => {
      expect(() => Money.fromCents(NaN)).toThrow('Invalid cents amount');
      expect(() => Money.fromCents(Infinity)).toThrow('Invalid cents amount');
      expect(() => Money.fromCents(-Infinity)).toThrow('Invalid cents amount');
      expect(() => Money.fromCents('100' as unknown as number)).toThrow('Invalid cents amount');
    });

    it('is immutable and frozen', () => {
      const money = Money.fromCents(100);
      expect(Object.isFrozen(money)).toBe(true);
      expect(() => {
        (money as unknown as { cents: number }).cents = 200;
      }).toThrow();
    });
  });

  describe('Parsing string representations', () => {
    it('parses strings with comma decimal separator', () => {
      expect(Money.parse('1,45').cents).toBe(145);
      expect(Money.parse('0,05').cents).toBe(5);
      expect(Money.parse('0,99').cents).toBe(99);
      expect(Money.parse('12,5').cents).toBe(1250);
      expect(Money.parse('12,05').cents).toBe(1205);
      expect(Money.parse('10').cents).toBe(1000);
      expect(Money.parse('0').cents).toBe(0);
      expect(Money.parse('0,00').cents).toBe(0);
    });

    it('parses strings with dot decimal separator', () => {
      expect(Money.parse('1.45').cents).toBe(145);
      expect(Money.parse('0.05').cents).toBe(5);
      expect(Money.parse('0.99').cents).toBe(99);
      expect(Money.parse('12.5').cents).toBe(1250);
      expect(Money.parse('12.05').cents).toBe(1205);
      expect(Money.parse('10').cents).toBe(1000);
      expect(Money.parse('12').cents).toBe(1200);
    });

    it('handles whitespace and optional currency symbol gracefully', () => {
      expect(Money.parse('  1,45  ').cents).toBe(145);
      expect(Money.parse('1,45 €').cents).toBe(145);
      expect(Money.parse('0,05€').cents).toBe(5);
    });

    it('throws descriptive error on invalid inputs', () => {
      expect(() => Money.parse('abc')).toThrow('Invalid money format: "abc"');
      expect(() => Money.parse('-1')).toThrow('Invalid money format: "-1"');
      expect(() => Money.parse('-1,45')).toThrow('Invalid money format: "-1,45"');
      expect(() => Money.parse('1,234')).toThrow('Invalid money format: "1,234"');
      expect(() => Money.parse('1.234')).toThrow('Invalid money format: "1.234"');
      expect(() => Money.parse('')).toThrow('Invalid money string: input cannot be empty');
      expect(() => Money.parse('   ')).toThrow('Invalid money string: input cannot be empty');
      expect(() => Money.parse('1,2,3')).toThrow('Invalid money format: "1,2,3"');
      expect(() => Money.parse('1,')).toThrow('Invalid money format: "1,"');
      expect(() => Money.parse(',45')).toThrow('Invalid money format: ",45"');
      expect(() => Money.parse(123 as unknown as string)).toThrow('Invalid input type');
    });
  });

  describe('Absence of floating point errors', () => {
    it('avoids standard JS floating point pitfalls (e.g. 0.1 + 0.2)', () => {
      // In JS numbers: 0.1 + 0.2 === 0.30000000000000004
      const m1 = Money.parse('0,10');
      const m2 = Money.parse('0,20');
      const sum = m1.add(m2);

      expect(sum.cents).toBe(30);
      expect(sum.toDecimalString()).toBe('0,30');
      expect(sum.toFormattedString()).toBe('0,30 €');
    });

    it('avoids float drift in 0.07 + 0.01', () => {
      // In JS numbers: 0.07 + 0.01 === 0.07999999999999999
      const m1 = Money.parse('0,07');
      const m2 = Money.parse('0,01');
      const sum = m1.add(m2);

      expect(sum.cents).toBe(8);
      expect(sum.toDecimalString()).toBe('0,08');
      expect(sum.toFormattedString()).toBe('0,08 €');
    });

    it('accumulates multiple additions without loss of precision', () => {
      let total = Money.zero();
      const step = Money.parse('0,10'); // 10 cents

      for (let i = 0; i < 10; i++) {
        total = total.add(step);
      }

      expect(total.cents).toBe(100);
      expect(total.toDecimalString()).toBe('1,00');
      expect(total.toFormattedString()).toBe('1,00 €');
    });
  });

  describe('Arithmetic operations and comparisons', () => {
    it('adds two Money instances', () => {
      const a = Money.fromCents(145);
      const b = Money.fromCents(255);
      const result = a.add(b);

      expect(result.cents).toBe(400);
      expect(a.cents).toBe(145); // Immutability
      expect(b.cents).toBe(255);
    });

    it('subtracts two Money instances', () => {
      const a = Money.fromCents(255);
      const b = Money.fromCents(145);
      const result = a.subtract(b);

      expect(result.cents).toBe(110);
    });

    it('throws when subtraction yields negative cents', () => {
      const smaller = Money.fromCents(50);
      const larger = Money.fromCents(100);

      expect(() => smaller.subtract(larger)).toThrow('result cannot be negative');
    });

    it('multiplies by integer and decimal quantities with symmetric rounding', () => {
      const price = Money.fromCents(145);
      expect(price.multiply(3).cents).toBe(435);
      expect(price.multiply(0).cents).toBe(0);

      const bulkPrice = Money.fromCents(100); // 1.00 €
      expect(bulkPrice.multiply(1.5).cents).toBe(150);

      const oddPrice = Money.fromCents(33);
      expect(oddPrice.multiply(3).cents).toBe(99);
    });

    it('rejects invalid multiplication operands', () => {
      const price = Money.fromCents(100);
      expect(() => price.multiply(-1)).toThrow('Multiplier must be a non-negative number');
      expect(() => price.multiply(NaN)).toThrow('Multiplier must be a non-negative number');
    });

    it('compares equality correctly', () => {
      const a = Money.fromCents(145);
      const b = Money.parse('1,45');
      const c = Money.fromCents(200);

      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
      expect(a.equals(null as unknown as Money)).toBe(false);
      expect(a.equals({ cents: 145 } as unknown as Money)).toBe(false);
    });
  });

  describe('String formatting', () => {
    it('formats to decimal string with 2 digits', () => {
      expect(Money.fromCents(0).toDecimalString()).toBe('0,00');
      expect(Money.fromCents(5).toDecimalString()).toBe('0,05');
      expect(Money.fromCents(99).toDecimalString()).toBe('0,99');
      expect(Money.fromCents(145).toDecimalString()).toBe('1,45');
      expect(Money.fromCents(1250).toDecimalString()).toBe('12,50');
    });

    it('formats to localized currency string', () => {
      expect(Money.fromCents(0).toFormattedString()).toBe('0,00 €');
      expect(Money.fromCents(5).toFormattedString()).toBe('0,05 €');
      expect(Money.fromCents(145).toFormattedString()).toBe('1,45 €');
      expect(Money.fromCents(1250).toFormattedString()).toBe('12,50 €');
    });
  });
});
