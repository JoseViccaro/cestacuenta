export class Money {
  readonly cents: number;

  constructor(cents: number) {
    if (typeof cents !== 'number' || !Number.isInteger(cents) || cents < 0) {
      throw new Error(`Invalid cents amount: ${cents}. Cents must be a non-negative integer.`);
    }
    this.cents = cents;
    Object.freeze(this);
  }

  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0);
  }

  /**
   * Parses monetary string representations like:
   * "1,45", "1.45", "0,99", "12", "12,5" (-> 1250 cents), "12,05" (-> 1205 cents).
   *
   * Validates purely with integer arithmetic without floating-point multiplication:
   * parses integer part and decimal part padded to 2 digits, computing integerPart * 100 + decimalPart.
   *
   * Throws descriptive error for invalid inputs (e.g. "abc", "-1", "1,234").
   */
  static parse(input: string): Money {
    if (typeof input !== 'string') {
      throw new Error(`Invalid input type for Money.parse: expected string, received ${typeof input}`);
    }

    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new Error('Invalid money string: input cannot be empty');
    }

    // Matches non-negative integers with optional 1 or 2 decimal digits separated by dot or comma.
    // Also optionally accepts trailing currency symbol '€'.
    const match = trimmed.match(/^(\d+)(?:[.,](\d{1,2}))?(?:\s*€)?$/);
    if (!match) {
      throw new Error(`Invalid money format: "${input}". Expected valid amount (e.g., "1,45", "12.5", "10").`);
    }

    const integerPart = parseInt(match[1], 10);
    const decimalPart = match[2] !== undefined ? match[2].padEnd(2, '0') : '00';
    const parsedDecimals = parseInt(decimalPart, 10);

    const cents = integerPart * 100 + parsedDecimals;
    if (!Number.isSafeInteger(cents)) {
      throw new Error(`Amount is too large to safely represent as money: "${input}"`);
    }

    return new Money(cents);
  }

  add(other: Money): Money {
    if (!(other instanceof Money)) {
      throw new Error('Can only add an instance of Money');
    }
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    if (!(other instanceof Money)) {
      throw new Error('Can only subtract an instance of Money');
    }
    if (this.cents < other.cents) {
      throw new Error(
        `Cannot subtract ${other.toFormattedString()} from ${this.toFormattedString()}: result cannot be negative.`
      );
    }
    return new Money(this.cents - other.cents);
  }

  multiply(quantity: number): Money {
    if (typeof quantity !== 'number' || isNaN(quantity) || quantity < 0) {
      throw new Error(`Invalid quantity multiplier: ${quantity}. Multiplier must be a non-negative number.`);
    }
    return new Money(Math.round(this.cents * quantity));
  }

  equals(other: unknown): boolean {
    return other instanceof Money && this.cents === other.cents;
  }

  toDecimalString(): string {
    const units = Math.floor(this.cents / 100);
    const decimals = (this.cents % 100).toString().padStart(2, '0');
    return `${units},${decimals}`;
  }

  toFormattedString(): string {
    return `${this.toDecimalString()} €`;
  }

  format(): string {
    return this.toFormattedString();
  }
}
