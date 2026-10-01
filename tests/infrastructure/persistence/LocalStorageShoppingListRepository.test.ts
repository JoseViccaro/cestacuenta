import { describe, it, expect, beforeEach } from 'vitest';
import { ShoppingList } from '../../../src/domain/entities/ShoppingList.js';
import { ShoppingListItem } from '../../../src/domain/entities/ShoppingListItem.js';
import {
  LocalStorageShoppingListRepository,
  InMemoryStorage,
} from '../../../src/infrastructure/persistence/web/LocalStorageShoppingListRepository.js';

describe('LocalStorageShoppingListRepository', () => {
  let storage: InMemoryStorage;
  let repository: LocalStorageShoppingListRepository;

  beforeEach(() => {
    storage = new InMemoryStorage();
    repository = new LocalStorageShoppingListRepository(storage);
  });

  describe('getActiveList', () => {
    it('returns null when storage is completely empty', async () => {
      const active = await repository.getActiveList();
      expect(active).toBeNull();
    });

    it('returns active list when one is saved', async () => {
      const list = ShoppingList.create({ title: 'Compra semanal Mercadona' });
      list.addItem('Leche Entera');
      list.addItem('Huevos Camperos');

      await repository.save(list);

      const retrieved = await repository.getActiveList();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(list.id);
      expect(retrieved!.title).toBe('Compra semanal Mercadona');
      expect(retrieved!.items).toHaveLength(2);
      expect(retrieved!.items[0].name).toBe('Leche Entera');
      expect(retrieved!.items[1].name).toBe('Huevos Camperos');
    });

    it('returns null if active list key has corrupted JSON', async () => {
      storage.setItem(LocalStorageShoppingListRepository.ACTIVE_LIST_KEY, 'corrupted{json');
      const retrieved = await repository.getActiveList();
      expect(retrieved).toBeNull();
    });

    it('returns null if active list key has invalid non-object or missing id', async () => {
      storage.setItem(LocalStorageShoppingListRepository.ACTIVE_LIST_KEY, JSON.stringify({}));
      const retrieved = await repository.getActiveList();
      expect(retrieved).toBeNull();
    });
  });

  describe('save & date / property hydration', () => {
    it('preserves item properties, checked status, cart item match and dates correctly', async () => {
      const list = ShoppingList.create({ title: 'Cena Fin de Semana' });
      const item1 = list.addItem('Vino Tinto');
      const item2 = list.addItem('Queso Manchego');

      list.checkItem(item1.id, 'cart-wine-uuid');

      await repository.save(list);

      const retrieved = await repository.getActiveList();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.createdAt).toBeInstanceOf(Date);
      expect(retrieved!.updatedAt).toBeInstanceOf(Date);

      const retrievedItem1 = retrieved!.items.find((i) => i.id === item1.id)!;
      expect(retrievedItem1).toBeDefined();
      expect(retrievedItem1.name).toBe('Vino Tinto');
      expect(retrievedItem1.isChecked).toBe(true);
      expect(retrievedItem1.matchedCartItemId).toBe('cart-wine-uuid');
      expect(retrievedItem1.checkedAt).toBeInstanceOf(Date);

      const retrievedItem2 = retrieved!.items.find((i) => i.id === item2.id)!;
      expect(retrievedItem2).toBeDefined();
      expect(retrievedItem2.name).toBe('Queso Manchego');
      expect(retrievedItem2.isChecked).toBe(false);
      expect(retrievedItem2.matchedCartItemId).toBeUndefined();
      expect(retrievedItem2.checkedAt).toBeUndefined();
    });

    it('saves to active list key and upserts into lists history', async () => {
      const list = ShoppingList.create({ title: 'Lista 1' });
      await repository.save(list);

      // Verify active key set
      const activeRaw = storage.getItem(LocalStorageShoppingListRepository.ACTIVE_LIST_KEY);
      expect(activeRaw).not.toBeNull();

      // Verify history set
      const history = await repository.getAllLists();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(list.id);

      // Update and save same list again -> should NOT duplicate in history
      list.addItem('Café');
      await repository.save(list);

      const historyAfterUpdate = await repository.getAllLists();
      expect(historyAfterUpdate).toHaveLength(1);
      expect(historyAfterUpdate[0].items).toHaveLength(1);
      expect(historyAfterUpdate[0].items[0].name).toBe('Café');
    });
  });

  describe('getAllLists', () => {
    it('returns empty array when there are no lists', async () => {
      const lists = await repository.getAllLists();
      expect(lists).toEqual([]);
    });

    it('returns lists sorted by updatedAt descending', async () => {
      const list1 = new ShoppingList({
        id: 'list-1',
        title: 'Primera',
        updatedAt: new Date('2026-09-01T10:00:00Z'),
      });
      const list2 = new ShoppingList({
        id: 'list-2',
        title: 'Segunda',
        updatedAt: new Date('2026-09-20T10:00:00Z'),
      });
      const list3 = new ShoppingList({
        id: 'list-3',
        title: 'Tercera',
        updatedAt: new Date('2026-09-10T10:00:00Z'),
      });

      await repository.save(list1);
      await repository.save(list2);
      await repository.save(list3);

      const all = await repository.getAllLists();
      expect(all).toHaveLength(3);
      expect(all[0].id).toBe('list-2'); // 2026-09-20
      expect(all[1].id).toBe('list-3'); // 2026-09-10
      expect(all[2].id).toBe('list-1'); // 2026-09-01
    });

    it('handles corrupted history JSON gracefully', async () => {
      storage.setItem(LocalStorageShoppingListRepository.LISTS_HISTORY_KEY, 'not-valid-json');
      const all = await repository.getAllLists();
      expect(all).toEqual([]);
    });
  });

  describe('getById', () => {
    it('retrieves active list by id', async () => {
      const list = ShoppingList.create({ title: 'Activa' });
      await repository.save(list);

      const found = await repository.getById(list.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(list.id);
      expect(found!.title).toBe('Activa');
    });

    it('retrieves inactive list from history by id', async () => {
      const list1 = ShoppingList.create({ title: 'Lista 1' });
      const list2 = ShoppingList.create({ title: 'Lista 2' });

      await repository.save(list1);
      // Now list2 is active
      await repository.save(list2);

      // list1 is in history
      const found = await repository.getById(list1.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(list1.id);
      expect(found!.title).toBe('Lista 1');
    });

    it('returns null for non-existent id', async () => {
      const found = await repository.getById('missing-id');
      expect(found).toBeNull();
    });
  });

  describe('deleteList', () => {
    it('deletes active list from history and removes active list key', async () => {
      const list = ShoppingList.create({ title: 'Lista a borrar' });
      await repository.save(list);

      expect(await repository.getActiveList()).not.toBeNull();
      expect((await repository.getAllLists())).toHaveLength(1);

      await repository.deleteList(list.id);

      expect(await repository.getActiveList()).toBeNull();
      expect((await repository.getAllLists())).toHaveLength(0);
      expect(storage.getItem(LocalStorageShoppingListRepository.ACTIVE_LIST_KEY)).toBeNull();
    });

    it('deletes an inactive list from history while keeping active list intact', async () => {
      const list1 = ShoppingList.create({ title: 'Lista Inactiva' });
      const list2 = ShoppingList.create({ title: 'Lista Activa' });

      await repository.save(list1);
      await repository.save(list2); // list2 is now active

      await repository.deleteList(list1.id);

      const active = await repository.getActiveList();
      expect(active).not.toBeNull();
      expect(active!.id).toBe(list2.id);

      const all = await repository.getAllLists();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(list2.id);
    });

    it('handles deleting a non-existent or empty id gracefully', async () => {
      await expect(repository.deleteList('non-existent')).resolves.not.toThrow();
      await expect(repository.deleteList('')).resolves.not.toThrow();
    });
  });

  describe('in-memory fallback when window is undefined', () => {
    it('instantiates repository with InMemory fallback in Node environment', async () => {
      const fallbackRepo = new LocalStorageShoppingListRepository();
      const list = ShoppingList.create({ title: 'Fallback Test' });
      list.addItem('Pan');

      await fallbackRepo.save(list);
      const retrieved = await fallbackRepo.getActiveList();

      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe('Fallback Test');
      expect(retrieved!.items).toHaveLength(1);
    });
  });
});
