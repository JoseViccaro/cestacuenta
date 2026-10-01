import {
  ShoppingList,
  ShoppingListItem,
  ShoppingListRepository,
} from '../../../domain/index.js';
import type { KeyValueStorage } from './LocalStorageShoppingSessionRepository.js';
import { InMemoryStorage } from './LocalStorageShoppingSessionRepository.js';

export type { KeyValueStorage };
export { InMemoryStorage };

export interface SerializedShoppingListItem {
  id: string;
  listId: string;
  name: string;
  isChecked: boolean;
  matchedCartItemId?: string;
  checkedAt?: string;
}

export interface SerializedShoppingList {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  items: SerializedShoppingListItem[];
}

function getAvailableStorage(): KeyValueStorage {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const testKey = '__cestacuenta_shopping_list_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      return new InMemoryStorage();
    }
  }
  return new InMemoryStorage();
}

export class LocalStorageShoppingListRepository implements ShoppingListRepository {
  public static readonly ACTIVE_LIST_KEY = 'cestacuenta_active_shopping_list';
  public static readonly LISTS_HISTORY_KEY = 'cestacuenta_shopping_lists';

  private readonly storage: KeyValueStorage;

  constructor(customStorage?: KeyValueStorage) {
    this.storage = customStorage ?? getAvailableStorage();
  }

  async getActiveList(): Promise<ShoppingList | null> {
    const raw = this.storage.getItem(LocalStorageShoppingListRepository.ACTIVE_LIST_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as SerializedShoppingList;
      if (!parsed || typeof parsed !== 'object' || !parsed.id) {
        return null;
      }
      return this.deserializeList(parsed);
    } catch {
      return null;
    }
  }

  async save(list: ShoppingList): Promise<void> {
    const serialized = this.serializeList(list);

    // Save to active list key
    this.storage.setItem(
      LocalStorageShoppingListRepository.ACTIVE_LIST_KEY,
      JSON.stringify(serialized)
    );

    // Upsert into lists history
    const history = this.readHistoryRaw();
    const existingIndex = history.findIndex((item) => item.id === list.id);

    if (existingIndex !== -1) {
      history[existingIndex] = serialized;
    } else {
      history.unshift(serialized);
    }

    // Keep history sorted by updatedAt descending
    history.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    this.storage.setItem(
      LocalStorageShoppingListRepository.LISTS_HISTORY_KEY,
      JSON.stringify(history)
    );
  }

  async getAllLists(): Promise<ShoppingList[]> {
    const history = this.readHistoryRaw();
    history.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return history.map((item) => this.deserializeList(item));
  }

  async getById(id: string): Promise<ShoppingList | null> {
    if (!id) return null;

    // Check active list first
    const active = await this.getActiveList();
    if (active && active.id === id) {
      return active;
    }

    // Check history
    const history = this.readHistoryRaw();
    const match = history.find((item) => item.id === id);
    if (!match) {
      return null;
    }

    return this.deserializeList(match);
  }

  async deleteList(id: string): Promise<void> {
    if (!id) return;

    // Remove from active list if this list is currently active
    const activeRaw = this.storage.getItem(LocalStorageShoppingListRepository.ACTIVE_LIST_KEY);
    if (activeRaw) {
      try {
        const parsed = JSON.parse(activeRaw) as SerializedShoppingList;
        if (parsed?.id === id) {
          this.storage.removeItem(LocalStorageShoppingListRepository.ACTIVE_LIST_KEY);
        }
      } catch {
        this.storage.removeItem(LocalStorageShoppingListRepository.ACTIVE_LIST_KEY);
      }
    }

    // Remove from history
    const history = this.readHistoryRaw();
    const filtered = history.filter((item) => item.id !== id);

    this.storage.setItem(
      LocalStorageShoppingListRepository.LISTS_HISTORY_KEY,
      JSON.stringify(filtered)
    );
  }

  private readHistoryRaw(): SerializedShoppingList[] {
    const raw = this.storage.getItem(LocalStorageShoppingListRepository.LISTS_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as SerializedShoppingList[];
      }
      return [];
    } catch {
      return [];
    }
  }

  private serializeItem(item: ShoppingListItem): SerializedShoppingListItem {
    return {
      id: item.id,
      listId: item.listId,
      name: item.name,
      isChecked: item.isChecked,
      matchedCartItemId: item.matchedCartItemId,
      checkedAt: item.checkedAt ? item.checkedAt.toISOString() : undefined,
    };
  }

  private serializeList(list: ShoppingList): SerializedShoppingList {
    return {
      id: list.id,
      title: list.title,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
      items: list.items.map((item) => this.serializeItem(item)),
    };
  }

  private deserializeItem(data: SerializedShoppingListItem): ShoppingListItem {
    return new ShoppingListItem({
      id: data.id,
      listId: data.listId,
      name: data.name,
      isChecked: Boolean(data.isChecked),
      matchedCartItemId: data.matchedCartItemId,
      checkedAt: data.checkedAt ? new Date(data.checkedAt) : undefined,
    });
  }

  private deserializeList(data: SerializedShoppingList): ShoppingList {
    const items = (data.items || []).map((item) => this.deserializeItem(item));
    return new ShoppingList({
      id: data.id,
      title: data.title,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      items,
    });
  }
}
