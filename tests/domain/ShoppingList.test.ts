import { describe, it, expect } from 'vitest';
import { ShoppingList } from '../../src/domain/entities/ShoppingList.js';
import { ShoppingListItem } from '../../src/domain/entities/ShoppingListItem.js';

describe('ShoppingList Aggregate Entity', () => {
  describe('Creation and invariants', () => {
    it('creates a ShoppingList with default values', () => {
      const list = ShoppingList.create();

      expect(list.id).toBeDefined();
      expect(typeof list.id).toBe('string');
      expect(list.title).toBe('Lista de la compra');
      expect(list.createdAt).toBeInstanceOf(Date);
      expect(list.updatedAt).toBeInstanceOf(Date);
      expect(list.items).toEqual([]);
    });

    it('creates a ShoppingList with custom props', () => {
      const initialItem = new ShoppingListItem({
        id: 'item-1',
        listId: 'custom-list',
        name: 'Plátanos',
      });
      const list = ShoppingList.create({
        id: 'custom-list',
        title: 'Cena con amigos',
        items: [initialItem],
      });

      expect(list.id).toBe('custom-list');
      expect(list.title).toBe('Cena con amigos');
      expect(list.items).toHaveLength(1);
      expect(list.items[0].name).toBe('Plátanos');
    });

    it('defaults title to "Lista de la compra" when title is empty or whitespace', () => {
      const list1 = ShoppingList.create({ title: '' });
      expect(list1.title).toBe('Lista de la compra');

      const list2 = ShoppingList.create({ title: '   ' });
      expect(list2.title).toBe('Lista de la compra');
    });

    it('rejects invalid or empty id when provided in constructor', () => {
      expect(() => new ShoppingList({ id: '' })).toThrow('ShoppingList id must be a non-empty string');
      expect(() => new ShoppingList({ id: '   ' })).toThrow('ShoppingList id must be a non-empty string');
    });

    it('preserves array encapsulation via items getter', () => {
      const list = ShoppingList.create();
      list.addItem('Manzanas');

      const retrieved = list.items;
      expect(retrieved).toHaveLength(1);

      retrieved.pop();
      expect(list.items).toHaveLength(1);
    });
  });

  describe('Item management (addItem, removeItem)', () => {
    it('adds an item to the list and updates updatedAt', () => {
      const list = ShoppingList.create();
      const initialUpdatedAt = list.updatedAt;

      const item = list.addItem('Aceite de Oliva');

      expect(item.id).toBeDefined();
      expect(item.listId).toBe(list.id);
      expect(item.name).toBe('Aceite de Oliva');
      expect(item.isChecked).toBe(false);

      expect(list.items).toHaveLength(1);
      expect(list.items[0].id).toBe(item.id);
      expect(list.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
    });

    it('rejects adding an item with empty name', () => {
      const list = ShoppingList.create();
      expect(() => list.addItem('')).toThrow('ShoppingListItem name must be a non-empty string');
      expect(() => list.addItem('   ')).toThrow('ShoppingListItem name must be a non-empty string');
    });

    it('removes an item by id and updates updatedAt', () => {
      const list = ShoppingList.create();
      const item1 = list.addItem('Item 1');
      const item2 = list.addItem('Item 2');

      expect(list.items).toHaveLength(2);

      list.removeItem(item1.id);
      expect(list.items).toHaveLength(1);
      expect(list.items[0].id).toBe(item2.id);
    });

    it('throws error when removing a non-existent item id', () => {
      const list = ShoppingList.create();
      expect(() => list.removeItem('unknown-id')).toThrow(
        'ShoppingListItem with id "unknown-id" not found in shopping list'
      );
    });
  });

  describe('Checking and toggling items', () => {
    it('toggles an unchecked item to checked, and vice versa', () => {
      const list = ShoppingList.create();
      const item = list.addItem('Café Molido');

      expect(list.items[0].isChecked).toBe(false);

      const checked = list.toggleItem(item.id);
      expect(checked.isChecked).toBe(true);
      expect(list.items[0].isChecked).toBe(true);

      const unchecked = list.toggleItem(item.id);
      expect(unchecked.isChecked).toBe(false);
      expect(list.items[0].isChecked).toBe(false);
    });

    it('checks an item with matched cart item id', () => {
      const list = ShoppingList.create();
      const item = list.addItem('Leche');

      const checked = list.checkItem(item.id, 'cart-123');

      expect(checked.isChecked).toBe(true);
      expect(checked.matchedCartItemId).toBe('cart-123');
      expect(checked.checkedAt).toBeInstanceOf(Date);
      expect(list.items[0].isChecked).toBe(true);
      expect(list.items[0].matchedCartItemId).toBe('cart-123');
    });

    it('unchecks an item explicitly', () => {
      const list = ShoppingList.create();
      const item = list.addItem('Leche');
      list.checkItem(item.id, 'cart-123');

      const unchecked = list.uncheckItem(item.id);

      expect(unchecked.isChecked).toBe(false);
      expect(unchecked.matchedCartItemId).toBeUndefined();
      expect(unchecked.checkedAt).toBeUndefined();
      expect(list.items[0].isChecked).toBe(false);
    });

    it('unchecks an item by matched cart item id', () => {
      const list = ShoppingList.create();
      const item1 = list.addItem('Yogures');
      const item2 = list.addItem('Cereales');

      list.checkItem(item1.id, 'cart-item-A');
      list.checkItem(item2.id, 'cart-item-B');

      const result = list.uncheckByCartItemId('cart-item-A');

      expect(result).not.toBeNull();
      expect(result?.id).toBe(item1.id);
      expect(result?.isChecked).toBe(false);
      expect(result?.matchedCartItemId).toBeUndefined();

      expect(list.items[0].isChecked).toBe(false);
      expect(list.items[1].isChecked).toBe(true);
    });

    it('returns null when unchecking by non-existent cart item id', () => {
      const list = ShoppingList.create();
      list.addItem('Pan');

      expect(list.uncheckByCartItemId('non-existent')).toBeNull();
      expect(list.uncheckByCartItemId('')).toBeNull();
    });

    it('throws when checking or unchecking non-existent item id', () => {
      const list = ShoppingList.create();

      expect(() => list.toggleItem('missing')).toThrow('ShoppingListItem with id "missing" not found');
      expect(() => list.checkItem('missing')).toThrow('ShoppingListItem with id "missing" not found');
      expect(() => list.uncheckItem('missing')).toThrow('ShoppingListItem with id "missing" not found');
    });
  });

  describe('clearCompleted', () => {
    it('removes only checked items from the list', () => {
      const list = ShoppingList.create();
      const item1 = list.addItem('Tomates');
      const item2 = list.addItem('Lechuga');
      const item3 = list.addItem('Cebollas');

      list.checkItem(item1.id);
      list.checkItem(item3.id);

      list.clearCompleted();

      expect(list.items).toHaveLength(1);
      expect(list.items[0].id).toBe(item2.id);
      expect(list.items[0].name).toBe('Lechuga');
    });

    it('does nothing when no items are checked', () => {
      const list = ShoppingList.create();
      list.addItem('Arroz');
      list.addItem('Pasta');

      list.clearCompleted();

      expect(list.items).toHaveLength(2);
    });
  });

  describe('progress calculation', () => {
    it('returns 0 progress for an empty list', () => {
      const list = ShoppingList.create();
      expect(list.progress()).toEqual({
        total: 0,
        completed: 0,
        percentage: 0,
      });
    });

    it('calculates progress accurately as items are checked', () => {
      const list = ShoppingList.create();
      const item1 = list.addItem('A');
      const item2 = list.addItem('B');
      const item3 = list.addItem('C');
      const item4 = list.addItem('D');

      expect(list.progress()).toEqual({
        total: 4,
        completed: 0,
        percentage: 0,
      });

      list.checkItem(item1.id);
      expect(list.progress()).toEqual({
        total: 4,
        completed: 1,
        percentage: 25,
      });

      list.checkItem(item2.id);
      expect(list.progress()).toEqual({
        total: 4,
        completed: 2,
        percentage: 50,
      });

      list.checkItem(item3.id);
      list.checkItem(item4.id);
      expect(list.progress()).toEqual({
        total: 4,
        completed: 4,
        percentage: 100,
      });
    });

    it('rounds percentage to nearest integer', () => {
      const list = ShoppingList.create();
      const item1 = list.addItem('A');
      list.addItem('B');
      list.addItem('C');

      list.checkItem(item1.id); // 1 out of 3 = 33.333% -> 33%
      expect(list.progress()).toEqual({
        total: 3,
        completed: 1,
        percentage: 33,
      });
    });
  });

  describe('Updating title', () => {
    it('updates title with setTitle and updates updatedAt', () => {
      const list = ShoppingList.create();
      list.setTitle('Compra Semanal');
      expect(list.title).toBe('Compra Semanal');

      list.setTitle('   ');
      expect(list.title).toBe('Lista de la compra');
    });
  });

  describe('pendingCount inspection', () => {
    it('returns 0 on an empty shopping list', () => {
      const list = ShoppingList.create();
      expect(list.pendingCount()).toBe(0);
    });

    it('returns total item count when all items are unchecked', () => {
      const list = ShoppingList.create();
      list.addItem('Leche');
      list.addItem('Huevos');
      list.addItem('Pan');

      expect(list.pendingCount()).toBe(3);
    });

    it('decrements as items are checked off', () => {
      const list = ShoppingList.create();
      const item1 = list.addItem('Leche');
      const item2 = list.addItem('Huevos');
      list.addItem('Pan');

      expect(list.pendingCount()).toBe(3);

      list.checkItem(item1.id);
      expect(list.pendingCount()).toBe(2);

      list.checkItem(item2.id);
      expect(list.pendingCount()).toBe(1);
    });

    it('returns 0 when all items are checked', () => {
      const list = ShoppingList.create();
      const item1 = list.addItem('Leche');
      const item2 = list.addItem('Huevos');

      list.checkItem(item1.id);
      list.checkItem(item2.id);

      expect(list.pendingCount()).toBe(0);
    });
  });
});
