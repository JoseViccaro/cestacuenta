import { ShoppingSession } from '../entities/ShoppingSession.js';

export interface ShoppingSessionRepository {
  getActiveSession(): Promise<ShoppingSession | null>;
  save(session: ShoppingSession): Promise<void>;
  getById(id: string): Promise<ShoppingSession | null>;
  listHistory(limit?: number, offset?: number): Promise<ShoppingSession[]>;
}
