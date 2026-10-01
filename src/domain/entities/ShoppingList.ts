import { ShoppingListItem } from './ShoppingListItem.js';

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

export interface ShoppingListProps {
  id?: string;
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
  items?: ShoppingListItem[];
}

export class ShoppingList {
  readonly id: string;
  title: string;
  readonly createdAt: Date;
  updatedAt: Date;
  private _items: ShoppingListItem[];

  constructor(props?: ShoppingListProps) {
    if (props?.id !== undefined) {
      if (typeof props.id !== 'string' || props.id.trim().length === 0) {
        throw new Error('ShoppingList id must be a non-empty string');
      }
      this.id = props.id.trim();
    } else {
      this.id = generateUUID();
    }

    const trimmedTitle = props?.title?.trim();
    this.title = trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : 'Lista de la compra';

    this.createdAt = props?.createdAt ?? new Date();
    this.updatedAt = props?.updatedAt ?? this.createdAt;
    this._items = props?.items ? [...props.items] : [];
  }

  static create(props?: { id?: string; title?: string; items?: ShoppingListItem[] }): ShoppingList {
    const now = new Date();
    return new ShoppingList({
      id: props?.id,
      title: props?.title,
      createdAt: now,
      updatedAt: now,
      items: props?.items,
    });
  }

  get items(): ShoppingListItem[] {
    return [...this._items];
  }

  setTitle(title: string): void {
    const trimmed = title?.trim();
    this.title = trimmed && trimmed.length > 0 ? trimmed : 'Lista de la compra';
    this.updatedAt = new Date();
  }

  addItem(name: string): ShoppingListItem {
    const newItem = ShoppingListItem.create({
      listId: this.id,
      name,
    });
    this._items.push(newItem);
    this.updatedAt = new Date();
    return newItem;
  }

  removeItem(itemId: string): void {
    const index = this._items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new Error(`ShoppingListItem with id "${itemId}" not found in shopping list`);
    }
    this._items.splice(index, 1);
    this.updatedAt = new Date();
  }

  toggleItem(itemId: string): ShoppingListItem {
    const index = this._items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new Error(`ShoppingListItem with id "${itemId}" not found in shopping list`);
    }
    const current = this._items[index];
    const updated = current.isChecked ? current.uncheck() : current.check();
    this._items[index] = updated;
    this.updatedAt = new Date();
    return updated;
  }

  checkItem(itemId: string, cartItemId?: string): ShoppingListItem {
    const index = this._items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new Error(`ShoppingListItem with id "${itemId}" not found in shopping list`);
    }
    const updated = this._items[index].check(cartItemId);
    this._items[index] = updated;
    this.updatedAt = new Date();
    return updated;
  }

  uncheckItem(itemId: string): ShoppingListItem {
    const index = this._items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new Error(`ShoppingListItem with id "${itemId}" not found in shopping list`);
    }
    const updated = this._items[index].uncheck();
    this._items[index] = updated;
    this.updatedAt = new Date();
    return updated;
  }

  uncheckByCartItemId(cartItemId: string): ShoppingListItem | null {
    if (!cartItemId || typeof cartItemId !== 'string') {
      return null;
    }
    const index = this._items.findIndex((item) => item.matchedCartItemId === cartItemId);
    if (index === -1) {
      return null;
    }
    const updated = this._items[index].uncheck();
    this._items[index] = updated;
    this.updatedAt = new Date();
    return updated;
  }

  clearCompleted(): void {
    this._items = this._items.filter((item) => !item.isChecked);
    this.updatedAt = new Date();
  }

  progress(): { total: number; completed: number; percentage: number } {
    const total = this._items.length;
    const completed = this._items.filter((item) => item.isChecked).length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return {
      total,
      completed,
      percentage,
    };
  }
}
