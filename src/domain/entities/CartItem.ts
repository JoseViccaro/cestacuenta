import { Money } from '../value-objects/Money.js';

export interface CartItemProps {
  id: string;
  sessionId: string;
  barcode?: string;
  name: string;
  unitPrice: Money;
  quantity: number;
  isBulk?: boolean;
  discount?: Money;
}

export class CartItem {
  readonly id: string;
  readonly sessionId: string;
  readonly barcode?: string;
  readonly name: string;
  readonly unitPrice: Money;
  readonly quantity: number;
  readonly isBulk: boolean;
  readonly discount: Money;

  constructor(props: CartItemProps) {
    if (!props.id || typeof props.id !== 'string' || props.id.trim().length === 0) {
      throw new Error('CartItem id must be a non-empty string');
    }
    if (!props.sessionId || typeof props.sessionId !== 'string' || props.sessionId.trim().length === 0) {
      throw new Error('CartItem sessionId must be a non-empty string');
    }
    if (!props.name || typeof props.name !== 'string' || props.name.trim().length === 0) {
      throw new Error('CartItem name must be a non-empty string');
    }
    if (!(props.unitPrice instanceof Money)) {
      throw new Error('CartItem unitPrice must be an instance of Money');
    }
    if (typeof props.quantity !== 'number' || !Number.isInteger(props.quantity) || props.quantity < 1) {
      throw new Error(`CartItem quantity must be an integer greater than or equal to 1, received: ${props.quantity}`);
    }
    if (props.discount !== undefined && !(props.discount instanceof Money)) {
      throw new Error('CartItem discount must be an instance of Money');
    }

    this.id = props.id;
    this.sessionId = props.sessionId;
    this.barcode = props.barcode?.trim() || undefined;
    this.name = props.name.trim();
    this.unitPrice = props.unitPrice;
    this.quantity = props.quantity;
    this.isBulk = props.isBulk ?? false;
    this.discount = props.discount ?? Money.fromCents(0);

    Object.freeze(this);
  }

  subtotal(): Money {
    const rawCents = (this.unitPrice.cents * this.quantity) - this.discount.cents;
    return Money.fromCents(Math.max(0, rawCents));
  }

  withQuantity(quantity: number): CartItem {
    return new CartItem({
      id: this.id,
      sessionId: this.sessionId,
      barcode: this.barcode,
      name: this.name,
      unitPrice: this.unitPrice,
      quantity,
      isBulk: this.isBulk,
      discount: this.discount,
    });
  }

  withUnitPrice(unitPrice: Money): CartItem {
    return new CartItem({
      id: this.id,
      sessionId: this.sessionId,
      barcode: this.barcode,
      name: this.name,
      unitPrice,
      quantity: this.quantity,
      isBulk: this.isBulk,
      discount: this.discount,
    });
  }

  withDiscount(discount: Money): CartItem {
    return new CartItem({
      id: this.id,
      sessionId: this.sessionId,
      barcode: this.barcode,
      name: this.name,
      unitPrice: this.unitPrice,
      quantity: this.quantity,
      isBulk: this.isBulk,
      discount,
    });
  }
}
