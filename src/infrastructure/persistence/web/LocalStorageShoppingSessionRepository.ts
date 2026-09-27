import {
  ShoppingSession,
  SessionStatus,
  CartItem,
  Money,
  ShoppingSessionRepository,
} from '../../../domain/index.js';

export interface SerializedCartItem {
  id: string;
  sessionId: string;
  barcode?: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  isBulk?: boolean;
  discountCents?: number;
}

export interface SerializedShoppingSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: SessionStatus;
  storeName?: string;
  items: SerializedCartItem[];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear?(): void;
}

export class InMemoryStorage implements KeyValueStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

function getAvailableStorage(): KeyValueStorage {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const testKey = '__cestacuenta_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      return new InMemoryStorage();
    }
  }
  return new InMemoryStorage();
}

export class LocalStorageShoppingSessionRepository implements ShoppingSessionRepository {
  public static readonly ACTIVE_SESSION_KEY = 'cestacuenta_active_session';
  public static readonly HISTORY_KEY = 'cestacuenta_history';

  private readonly storage: KeyValueStorage;

  constructor(customStorage?: KeyValueStorage) {
    this.storage = customStorage ?? getAvailableStorage();
  }

  async getActiveSession(): Promise<ShoppingSession | null> {
    const raw = this.storage.getItem(LocalStorageShoppingSessionRepository.ACTIVE_SESSION_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as SerializedShoppingSession;
      if (!parsed || parsed.status !== 'ACTIVE') {
        return null;
      }
      return this.deserializeSession(parsed);
    } catch {
      return null;
    }
  }

  async save(session: ShoppingSession): Promise<void> {
    const serialized = this.serializeSession(session);

    if (session.status === 'ACTIVE') {
      this.storage.setItem(
        LocalStorageShoppingSessionRepository.ACTIVE_SESSION_KEY,
        JSON.stringify(serialized)
      );
      return;
    }

    // Session is COMPLETED or DISCARDED
    const activeRaw = this.storage.getItem(LocalStorageShoppingSessionRepository.ACTIVE_SESSION_KEY);
    if (activeRaw) {
      try {
        const parsedActive = JSON.parse(activeRaw) as SerializedShoppingSession;
        if (parsedActive?.id === session.id) {
          this.storage.removeItem(LocalStorageShoppingSessionRepository.ACTIVE_SESSION_KEY);
        }
      } catch {
        // If active session was corrupted, clean it
        this.storage.removeItem(LocalStorageShoppingSessionRepository.ACTIVE_SESSION_KEY);
      }
    }

    // Upsert into history
    const history = this.readHistoryRaw();
    const existingIndex = history.findIndex((item) => item.id === session.id);

    if (existingIndex !== -1) {
      history[existingIndex] = serialized;
    } else {
      history.unshift(serialized);
    }

    // Keep history sorted by startedAt descending
    history.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    this.storage.setItem(
      LocalStorageShoppingSessionRepository.HISTORY_KEY,
      JSON.stringify(history)
    );
  }

  async getById(id: string): Promise<ShoppingSession | null> {
    // Check active session first
    const active = await this.getActiveSession();
    if (active && active.id === id) {
      return active;
    }

    // Check history
    const history = this.readHistoryRaw();
    const match = history.find((s) => s.id === id);
    if (!match) {
      return null;
    }

    return this.deserializeSession(match);
  }

  async listHistory(limit = 20, offset = 0): Promise<ShoppingSession[]> {
    const history = this.readHistoryRaw();
    // Ensure sorted by startedAt descending
    history.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    const safeOffset = Math.max(0, offset);
    const safeLimit = Math.max(0, limit);
    const slice = history.slice(safeOffset, safeOffset + safeLimit);

    return slice.map((item) => this.deserializeSession(item));
  }

  private readHistoryRaw(): SerializedShoppingSession[] {
    const raw = this.storage.getItem(LocalStorageShoppingSessionRepository.HISTORY_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as SerializedShoppingSession[];
      }
      return [];
    } catch {
      return [];
    }
  }

  private serializeSession(session: ShoppingSession): SerializedShoppingSession {
    return {
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : undefined,
      status: session.status,
      storeName: session.storeName,
      items: session.items.map((item) => ({
        id: item.id,
        sessionId: item.sessionId,
        barcode: item.barcode,
        name: item.name,
        unitPriceCents: item.unitPrice.cents,
        quantity: item.quantity,
        isBulk: item.isBulk,
        discountCents: item.discount.cents,
      })),
    };
  }

  private deserializeSession(data: SerializedShoppingSession): ShoppingSession {
    const items = (data.items || []).map((item) => {
      const unitPriceCents =
        typeof item.unitPriceCents === 'number'
          ? item.unitPriceCents
          : (item as unknown as { unitPrice?: { cents?: number } }).unitPrice?.cents ?? 0;

      const discountCents =
        typeof item.discountCents === 'number'
          ? item.discountCents
          : (item as unknown as { discount?: { cents?: number } }).discount?.cents ?? 0;

      return new CartItem({
        id: item.id,
        sessionId: item.sessionId,
        barcode: item.barcode ?? undefined,
        name: item.name,
        unitPrice: Money.fromCents(unitPriceCents),
        quantity: item.quantity,
        isBulk: Boolean(item.isBulk),
        discount: Money.fromCents(discountCents),
      });
    });

    return new ShoppingSession({
      id: data.id,
      startedAt: new Date(data.startedAt),
      endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
      status: data.status,
      storeName: data.storeName ?? undefined,
      items,
    });
  }
}
