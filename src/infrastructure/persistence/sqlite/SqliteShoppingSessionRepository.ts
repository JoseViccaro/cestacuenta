import { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  ShoppingSession,
  SessionStatus,
  CartItem,
  Money,
  ShoppingSessionRepository,
} from '../../../domain/index.js';

interface ShoppingSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  store_name: string | null;
  budget_limit_cents: number | null;
}

interface CartItemRow {
  id: string;
  session_id: string;
  barcode: string | null;
  name: string;
  unit_price_cents: number;
  quantity: number;
  is_bulk: number;
  discount_cents: number;
}

export class SqliteShoppingSessionRepository implements ShoppingSessionRepository {
  private readonly db: DatabaseSync;
  private readonly isMemory: boolean;

  private upsertSessionStmt!: StatementSync;
  private deleteCartItemsStmt!: StatementSync;
  private insertCartItemStmt!: StatementSync;
  private selectActiveSessionStmt!: StatementSync;
  private selectSessionByIdStmt!: StatementSync;
  private selectCartItemsStmt!: StatementSync;
  private selectHistoryStmt!: StatementSync;

  constructor(dbOrPath: DatabaseSync | string = ':memory:') {
    if (typeof dbOrPath === 'string') {
      this.db = new DatabaseSync(dbOrPath);
      this.isMemory = dbOrPath === ':memory:';
    } else {
      this.db = dbOrPath;
      this.isMemory = typeof dbOrPath.location === 'function' ? dbOrPath.location() === null : false;
    }

    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (!this.isMemory) {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shopping_sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        store_name TEXT,
        budget_limit_cents INTEGER
      );

      CREATE TABLE IF NOT EXISTS cart_items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES shopping_sessions(id) ON DELETE CASCADE,
        barcode TEXT,
        name TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        is_bulk INTEGER NOT NULL,
        discount_cents INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_cart_items_session_id ON cart_items(session_id);
    `);

    // Safe idempotent column migration for existing databases
    try {
      this.db.exec('ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER;');
    } catch {
      // Column already exists or table was just created with the column
    }

    this.upsertSessionStmt = this.db.prepare(`
      INSERT INTO shopping_sessions (id, started_at, ended_at, status, store_name, budget_limit_cents)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        status = excluded.status,
        store_name = excluded.store_name,
        budget_limit_cents = excluded.budget_limit_cents
    `);

    this.deleteCartItemsStmt = this.db.prepare(`
      DELETE FROM cart_items WHERE session_id = ?
    `);

    this.insertCartItemStmt = this.db.prepare(`
      INSERT INTO cart_items (
        id, session_id, barcode, name, unit_price_cents, quantity, is_bulk, discount_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectActiveSessionStmt = this.db.prepare(`
      SELECT id, started_at, ended_at, status, store_name, budget_limit_cents
      FROM shopping_sessions
      WHERE status = 'ACTIVE'
      ORDER BY started_at DESC
      LIMIT 1
    `);

    this.selectSessionByIdStmt = this.db.prepare(`
      SELECT id, started_at, ended_at, status, store_name, budget_limit_cents
      FROM shopping_sessions
      WHERE id = ?
    `);

    this.selectCartItemsStmt = this.db.prepare(`
      SELECT id, session_id, barcode, name, unit_price_cents, quantity, is_bulk, discount_cents
      FROM cart_items
      WHERE session_id = ?
      ORDER BY rowid ASC
    `);

    this.selectHistoryStmt = this.db.prepare(`
      SELECT id, started_at, ended_at, status, store_name, budget_limit_cents
      FROM shopping_sessions
      WHERE status != 'ACTIVE'
      ORDER BY started_at DESC, rowid DESC
      LIMIT ? OFFSET ?
    `);
  }

  async save(session: ShoppingSession): Promise<void> {
    this.db.exec('BEGIN');
    try {
      this.upsertSessionStmt.run(
        session.id,
        session.startedAt.toISOString(),
        session.endedAt ? session.endedAt.toISOString() : null,
        session.status,
        session.storeName ?? null,
        session.budgetLimit?.cents ?? null
      );

      this.deleteCartItemsStmt.run(session.id);

      for (const item of session.items) {
        this.insertCartItemStmt.run(
          item.id,
          session.id,
          item.barcode ?? null,
          item.name,
          item.unitPrice.cents,
          item.quantity,
          item.isBulk ? 1 : 0,
          item.discount.cents
        );
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async getActiveSession(): Promise<ShoppingSession | null> {
    const row = this.selectActiveSessionStmt.get() as unknown as ShoppingSessionRow | undefined;
    if (!row) {
      return null;
    }
    return this.hydrateSession(row);
  }

  async getById(id: string): Promise<ShoppingSession | null> {
    const row = this.selectSessionByIdStmt.get(id) as unknown as ShoppingSessionRow | undefined;
    if (!row) {
      return null;
    }
    return this.hydrateSession(row);
  }

  async listHistory(limit?: number, offset?: number): Promise<ShoppingSession[]> {
    const safeLimit = limit !== undefined ? limit : 20;
    const safeOffset = offset !== undefined ? offset : 0;
    const rows = this.selectHistoryStmt.all(safeLimit, safeOffset) as unknown as ShoppingSessionRow[];
    return rows.map((row) => this.hydrateSession(row));
  }

  close(): void {
    this.db.close();
  }

  private hydrateSession(sessionRow: ShoppingSessionRow): ShoppingSession {
    const itemRows = this.selectCartItemsStmt.all(sessionRow.id) as unknown as CartItemRow[];

    const items = itemRows.map(
      (itemRow) =>
        new CartItem({
          id: itemRow.id,
          sessionId: itemRow.session_id,
          barcode: itemRow.barcode ?? undefined,
          name: itemRow.name,
          unitPrice: Money.fromCents(Number(itemRow.unit_price_cents)),
          quantity: Number(itemRow.quantity),
          isBulk: Boolean(itemRow.is_bulk),
          discount: Money.fromCents(Number(itemRow.discount_cents)),
        })
    );

    const budgetLimit =
      sessionRow.budget_limit_cents !== null && sessionRow.budget_limit_cents !== undefined
        ? Money.fromCents(Number(sessionRow.budget_limit_cents))
        : undefined;

    return new ShoppingSession({
      id: sessionRow.id,
      startedAt: new Date(sessionRow.started_at),
      endedAt: sessionRow.ended_at ? new Date(sessionRow.ended_at) : undefined,
      status: sessionRow.status as SessionStatus,
      storeName: sessionRow.store_name ?? undefined,
      items,
      budgetLimit,
    });
  }
}
