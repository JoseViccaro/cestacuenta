import { ShoppingList } from '../entities/ShoppingList.js';

export interface ShoppingListRepository {
  getActiveList(): Promise<ShoppingList | null>;
  save(list: ShoppingList): Promise<void>;
  getAllLists(): Promise<ShoppingList[]>;
  deleteList(id: string): Promise<void>;
}
