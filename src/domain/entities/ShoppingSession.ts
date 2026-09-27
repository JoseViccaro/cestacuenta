import { Money } from '../value-objects/Money.js';
import { CartItem, CartItemProps } from './CartItem.js';

function generateUUID(): string {
  if (
    typeof globalThis !== 'undefined' &&
    'crypto' in globalThis &&
    typeof (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID === 'function'
  ) {
    return (globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'DISCARDED';

export interface ShoppingSessionProps {
  id?: string;
  startedAt?: Date;
  endedAt?: Date;
  status?: SessionStatus;
  storeName?: string;
  items?: CartItem[];
}

export class ShoppingSession {
  readonly id: string;
  readonly startedAt: Date;
  endedAt?: Date;
  status: SessionStatus;
  storeName?: string;
  private _items: CartItem[];

  constructor(props?: ShoppingSessionProps) {
    this.id = props?.id ?? generateUUID();
    this.startedAt = props?.startedAt ?? new Date();
    this.endedAt = props?.endedAt;
    this.status = props?.status ?? 'ACTIVE';
    this.storeName = props?.storeName;
    this._items = props?.items ? [...props.items] : [];
  }

  static create(props?: { id?: string; storeName?: string }): ShoppingSession {
    return new ShoppingSession({
      id: props?.id,
      storeName: props?.storeName,
      status: 'ACTIVE',
      startedAt: new Date(),
      items: [],
    });
  }

  get items(): CartItem[] {
    return [...this._items];
  }

  addItem(item: Omit<CartItemProps, 'id' | 'sessionId'> & { id?: string }): CartItem {
    this.ensureActive();

    const newItem = new CartItem({
      ...item,
      id: item.id ?? generateUUID(),
      sessionId: this.id,
    });

    this._items.push(newItem);
    return newItem;
  }

  scanBarcode(
    barcode: string,
    unitPrice: Money,
    defaultName?: string,
    isBulk?: boolean
  ): { item: CartItem; isNew: boolean } {
    this.ensureActive();

    if (!barcode || typeof barcode !== 'string' || barcode.trim().length === 0) {
      throw new Error('Barcode must be a non-empty string');
    }
    if (!(unitPrice instanceof Money)) {
      throw new Error('unitPrice must be an instance of Money');
    }

    const trimmedBarcode = barcode.trim();

    // Look for an existing item with the SAME barcode AND the SAME unit price
    const existingIndex = this._items.findIndex(
      (item) => item.barcode === trimmedBarcode && item.unitPrice.equals(unitPrice)
    );

    if (existingIndex !== -1) {
      const existing = this._items[existingIndex];
      const updated = existing.withQuantity(existing.quantity + 1);
      this._items[existingIndex] = updated;
      return { item: updated, isNew: false };
    }

    // Different price or not found yet -> create a new line item
    const newItem = new CartItem({
      id: generateUUID(),
      sessionId: this.id,
      barcode: trimmedBarcode,
      name: defaultName && defaultName.trim().length > 0 ? defaultName.trim() : `Producto ${trimmedBarcode}`,
      unitPrice,
      quantity: 1,
      isBulk: isBulk ?? false,
      discount: Money.fromCents(0),
    });

    this._items.push(newItem);
    return { item: newItem, isNew: true };
  }

  updateItemQuantity(itemId: string, quantity: number): void {
    this.ensureActive();

    const index = this._items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new Error(`Item with id "${itemId}" not found in session`);
    }

    if (quantity <= 0) {
      this._items.splice(index, 1);
      return;
    }

    this._items[index] = this._items[index].withQuantity(quantity);
  }

  updateItemPrice(itemId: string, newPrice: Money): void {
    this.ensureActive();

    if (!(newPrice instanceof Money)) {
      throw new Error('newPrice must be an instance of Money');
    }

    const index = this._items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new Error(`Item with id "${itemId}" not found in session`);
    }

    this._items[index] = this._items[index].withUnitPrice(newPrice);
  }

  removeItem(itemId: string): void {
    this.ensureActive();

    const index = this._items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new Error(`Item with id "${itemId}" not found in session`);
    }

    this._items.splice(index, 1);
  }

  total(): Money {
    const totalCents = this._items.reduce(
      (acc, item) => acc + item.subtotal().cents,
      0
    );
    return Money.fromCents(totalCents);
  }

  totalItemCount(): number {
    return this._items.reduce((acc, item) => acc + item.quantity, 0);
  }

  complete(): void {
    this.ensureActive();
    this.status = 'COMPLETED';
    this.endedAt = new Date();
  }

  discard(): void {
    this.ensureActive();
    this.status = 'DISCARDED';
    this.endedAt = new Date();
  }

  private ensureActive(): void {
    if (this.status !== 'ACTIVE') {
      throw new Error(`Cannot modify session: session is already ${this.status}`);
    }
  }
}
