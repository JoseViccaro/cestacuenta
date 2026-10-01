import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { CartList } from '../../src/ui/components/CartList.js';
import { CartItem } from '../../src/domain/entities/CartItem.js';
import { Money } from '../../src/domain/value-objects/Money.js';
import { StorePriceHistoryService } from '../../src/domain/services/StorePriceHistoryService.js';
import { ShoppingSession } from '../../src/domain/entities/ShoppingSession.js';

describe('CartList Component - PriceTrendBadge Integration', () => {
  const itemWithHistory = new CartItem({
    id: 'item-1',
    sessionId: 'session-active',
    barcode: '8410000001',
    name: 'Leche Entera 1L',
    unitPrice: Money.fromCents(120),
    quantity: 2,
  });

  const itemWithoutHistory = new CartItem({
    id: 'item-2',
    sessionId: 'session-active',
    barcode: '8499999999',
    name: 'Producto Nuevo Raro',
    unitPrice: Money.fromCents(300),
    quantity: 1,
  });

  it('renders PriceTrendBadge when priceHistoryService has historical comparison', () => {
    // Session in history had price 100 cents at Mercadona
    const pastSession = new ShoppingSession({
      id: 'past-1',
      status: 'COMPLETED',
      storeName: 'Mercadona',
      endedAt: new Date('2026-09-01'),
      items: [
        new CartItem({
          id: 'past-item-1',
          sessionId: 'past-1',
          barcode: '8410000001',
          name: 'Leche Entera 1L',
          unitPrice: Money.fromCents(100),
          quantity: 1,
        }),
      ],
    });

    const service = new StorePriceHistoryService([pastSession]);

    const html = renderToString(
      <CartList
        items={[itemWithHistory]}
        currentStore="Mercadona"
        priceHistoryService={service}
        onIncrementQuantity={vi.fn()}
        onDecrementQuantity={vi.fn()}
        onDeleteItem={vi.fn()}
        onEditPrice={vi.fn()}
        onViewPriceHistory={vi.fn()}
      />
    );

    // Delta is +0.20 € (1.20 vs 1.00)
    expect(html).toContain('trend-badge');
    expect(html).toContain('trend-badge--up');
    expect(html).toContain('+0,20 €');
  });

  it('omits PriceTrendBadge when product has no historical records', () => {
    const service = new StorePriceHistoryService([]);

    const html = renderToString(
      <CartList
        items={[itemWithoutHistory]}
        currentStore="Mercadona"
        priceHistoryService={service}
        onIncrementQuantity={vi.fn()}
        onDecrementQuantity={vi.fn()}
        onDeleteItem={vi.fn()}
        onEditPrice={vi.fn()}
      />
    );

    expect(html).not.toContain('trend-badge');
  });

  it('renders empty cart message when items array is empty', () => {
    const html = renderToString(
      <CartList
        items={[]}
        onIncrementQuantity={vi.fn()}
        onDecrementQuantity={vi.fn()}
        onDeleteItem={vi.fn()}
        onEditPrice={vi.fn()}
      />
    );

    expect(html).toContain('cart-empty');
    expect(html).toContain('Cesta vacía');
  });
});
