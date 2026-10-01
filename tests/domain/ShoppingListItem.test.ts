import { describe, it, expect } from 'vitest';
import { ShoppingListItem } from '../../src/domain/entities/ShoppingListItem.js';

describe('ShoppingListItem Entity', () => {
  const defaultProps = {
    id: 'item-1',
    listId: 'list-1',
    name: 'Leche entera',
  };

  describe('Creation and invariant validation', () => {
    it('creates a valid ShoppingListItem with default values', () => {
      const item = new ShoppingListItem(defaultProps);

      expect(item.id).toBe('item-1');
      expect(item.listId).toBe('list-1');
      expect(item.name).toBe('Leche entera');
      expect(item.isChecked).toBe(false);
      expect(item.matchedCartItemId).toBeUndefined();
      expect(item.checkedAt).toBeUndefined();
      expect(Object.isFrozen(item)).toBe(true);
    });

    it('trims whitespace from name, id, and listId', () => {
      const item = new ShoppingListItem({
        id: '  item-99  ',
        listId: '  list-42  ',
        name: '  Pan de molde integral  ',
      });

      expect(item.id).toBe('item-99');
      expect(item.listId).toBe('list-42');
      expect(item.name).toBe('Pan de molde integral');
    });

    it('creates an item with existing checked state and cart match', () => {
      const checkedDate = new Date('2026-10-01T12:00:00Z');
      const item = new ShoppingListItem({
        ...defaultProps,
        isChecked: true,
        matchedCartItemId: 'cart-item-123',
        checkedAt: checkedDate,
      });

      expect(item.isChecked).toBe(true);
      expect(item.matchedCartItemId).toBe('cart-item-123');
      expect(item.checkedAt).toEqual(checkedDate);
    });

    it('rejects empty or invalid id', () => {
      expect(() => new ShoppingListItem({ ...defaultProps, id: '' })).toThrow(
        'ShoppingListItem id must be a non-empty string'
      );
      expect(() => new ShoppingListItem({ ...defaultProps, id: '   ' })).toThrow(
        'ShoppingListItem id must be a non-empty string'
      );
      expect(() => new ShoppingListItem({ ...defaultProps, id: null as unknown as string })).toThrow(
        'ShoppingListItem id must be a non-empty string'
      );
    });

    it('rejects empty or invalid listId', () => {
      expect(() => new ShoppingListItem({ ...defaultProps, listId: '' })).toThrow(
        'ShoppingListItem listId must be a non-empty string'
      );
      expect(() => new ShoppingListItem({ ...defaultProps, listId: '   ' })).toThrow(
        'ShoppingListItem listId must be a non-empty string'
      );
      expect(() => new ShoppingListItem({ ...defaultProps, listId: undefined as unknown as string })).toThrow(
        'ShoppingListItem listId must be a non-empty string'
      );
    });

    it('rejects empty or invalid name', () => {
      expect(() => new ShoppingListItem({ ...defaultProps, name: '' })).toThrow(
        'ShoppingListItem name must be a non-empty string'
      );
      expect(() => new ShoppingListItem({ ...defaultProps, name: '   ' })).toThrow(
        'ShoppingListItem name must be a non-empty string'
      );
      expect(() => new ShoppingListItem({ ...defaultProps, name: null as unknown as string })).toThrow(
        'ShoppingListItem name must be a non-empty string'
      );
    });

    it('prevents direct mutation due to Object.freeze', () => {
      const item = new ShoppingListItem(defaultProps);
      expect(() => {
        (item as unknown as { name: string }).name = 'Mutation Attempt';
      }).toThrow();
    });

    it('supports static create factory', () => {
      const item = ShoppingListItem.create({
        listId: 'list-1',
        name: 'Huevos Camperos',
      });

      expect(item.id).toBeDefined();
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.listId).toBe('list-1');
      expect(item.name).toBe('Huevos Camperos');
      expect(item.isChecked).toBe(false);
    });
  });

  describe('Check and uncheck state transitions (immutability)', () => {
    it('checks an item without matched cart item', () => {
      const original = new ShoppingListItem(defaultProps);
      const checked = original.check();

      expect(checked).not.toBe(original);
      expect(checked.isChecked).toBe(true);
      expect(checked.checkedAt).toBeInstanceOf(Date);
      expect(checked.matchedCartItemId).toBeUndefined();

      // Original remains unchanged
      expect(original.isChecked).toBe(false);
      expect(original.checkedAt).toBeUndefined();
    });

    it('checks an item with a matched cart item id', () => {
      const original = new ShoppingListItem(defaultProps);
      const checked = original.check('cart-uuid-456');

      expect(checked).not.toBe(original);
      expect(checked.isChecked).toBe(true);
      expect(checked.matchedCartItemId).toBe('cart-uuid-456');
      expect(checked.checkedAt).toBeInstanceOf(Date);
      expect(original.isChecked).toBe(false);
    });

    it('unchecks a previously checked item', () => {
      const checked = new ShoppingListItem({
        ...defaultProps,
        isChecked: true,
        matchedCartItemId: 'cart-123',
        checkedAt: new Date(),
      });

      const unchecked = checked.uncheck();

      expect(unchecked).not.toBe(checked);
      expect(unchecked.isChecked).toBe(false);
      expect(unchecked.matchedCartItemId).toBeUndefined();
      expect(unchecked.checkedAt).toBeUndefined();

      // Original checked instance is not modified
      expect(checked.isChecked).toBe(true);
      expect(checked.matchedCartItemId).toBe('cart-123');
      expect(checked.checkedAt).toBeDefined();
    });
  });
});
