import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ShoppingListBanner } from '../../src/ui/components/ShoppingListBanner.js';
import { ShoppingList } from '../../src/domain/entities/ShoppingList.js';

describe('ShoppingListBanner Component', () => {
  it('renders clean empty state banner when shoppingList is null', () => {
    const html = renderToString(
      <ShoppingListBanner
        shoppingList={null}
        onOpenModal={vi.fn()}
        onToggleItem={vi.fn()}
      />
    );

    expect(html).toContain('shopping-list-banner--empty');
    expect(html).toContain('¿Tienes una lista para hoy?');
    expect(html).toContain('+ Crear o pegar lista de compra');
  });

  it('renders clean empty state banner when shoppingList has 0 items', () => {
    const list = ShoppingList.create({ title: 'Mi lista vacía' });
    const html = renderToString(
      <ShoppingListBanner
        shoppingList={list}
        onOpenModal={vi.fn()}
        onToggleItem={vi.fn()}
      />
    );

    expect(html).toContain('shopping-list-banner--empty');
    expect(html).toContain('+ Crear o pegar lista de compra');
  });

  it('renders active progress banner and pending chips when list has items', () => {
    const list = ShoppingList.create({ title: 'Compra Mercadona' });
    const item1 = list.addItem('Plátanos de Canarias');
    list.addItem('Leche Entera');
    list.addItem('Pan Artesano');

    // Mark 1 item as checked
    list.checkItem(item1.id, 'cart-123');

    const html = renderToString(
      <ShoppingListBanner
        shoppingList={list}
        onOpenModal={vi.fn()}
        onToggleItem={vi.fn()}
      />
    );

    expect(html).toContain('shopping-list-banner');
    expect(html).not.toContain('shopping-list-banner--empty');
    expect(html).toContain('Lista de compra');
    expect(html).toContain('1 de 3 comprados (33%)');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="33"');

    // Pending chips should show unchecked items
    expect(html).toContain('Leche Entera');
    expect(html).toContain('Pan Artesano');
    // Checked item should not be in pending chips
    expect(html).not.toContain('pending-chip-name">Plátanos de Canarias');
  });

  it('renders completion notice when all items are checked', () => {
    const list = ShoppingList.create({ title: 'Compra Lista' });
    const item1 = list.addItem('Café Molido');
    list.checkItem(item1.id);

    const html = renderToString(
      <ShoppingListBanner
        shoppingList={list}
        onOpenModal={vi.fn()}
        onToggleItem={vi.fn()}
      />
    );

    expect(html).toContain('1 de 1 comprados (100%)');
    expect(html).toContain('¡Todos los artículos de la lista comprados!');
    expect(html).not.toContain('pending-chips');
  });
});
