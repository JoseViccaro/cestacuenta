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

export interface ShoppingListItemProps {
  id: string;
  listId: string;
  name: string;
  isChecked?: boolean;
  matchedCartItemId?: string;
  checkedAt?: Date;
}

export class ShoppingListItem {
  readonly id: string;
  readonly listId: string;
  readonly name: string;
  readonly isChecked: boolean;
  readonly matchedCartItemId?: string;
  readonly checkedAt?: Date;

  constructor(props: ShoppingListItemProps) {
    if (!props.id || typeof props.id !== 'string' || props.id.trim().length === 0) {
      throw new Error('ShoppingListItem id must be a non-empty string');
    }
    if (!props.listId || typeof props.listId !== 'string' || props.listId.trim().length === 0) {
      throw new Error('ShoppingListItem listId must be a non-empty string');
    }
    if (!props.name || typeof props.name !== 'string' || props.name.trim().length === 0) {
      throw new Error('ShoppingListItem name must be a non-empty string');
    }

    this.id = props.id.trim();
    this.listId = props.listId.trim();
    this.name = props.name.trim();
    this.isChecked = props.isChecked ?? false;
    this.matchedCartItemId = props.matchedCartItemId?.trim() || undefined;
    this.checkedAt = props.checkedAt;

    Object.freeze(this);
  }

  static create(props: { id?: string; listId: string; name: string }): ShoppingListItem {
    return new ShoppingListItem({
      id: props.id ?? generateUUID(),
      listId: props.listId,
      name: props.name,
      isChecked: false,
    });
  }

  check(cartItemId?: string): ShoppingListItem {
    return new ShoppingListItem({
      id: this.id,
      listId: this.listId,
      name: this.name,
      isChecked: true,
      matchedCartItemId: cartItemId?.trim() || undefined,
      checkedAt: new Date(),
    });
  }

  uncheck(): ShoppingListItem {
    return new ShoppingListItem({
      id: this.id,
      listId: this.listId,
      name: this.name,
      isChecked: false,
      matchedCartItemId: undefined,
      checkedAt: undefined,
    });
  }
}
