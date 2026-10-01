import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScanPricePromptModal } from '../../src/ui/components/ScanPricePromptModal.js';
import { Money } from '../../src/domain/value-objects/Money.js';
import { StorePriceHistoryService } from '../../src/domain/services/StorePriceHistoryService.js';
import { ShoppingSession } from '../../src/domain/entities/ShoppingSession.js';
import { CartItem } from '../../src/domain/entities/CartItem.js';

describe('ScanPricePromptModal Component - Price History Integration', () => {
  const pastSessionMercadona = new ShoppingSession({
    id: 's-mercadona',
    status: 'COMPLETED',
    storeName: 'Mercadona',
    endedAt: new Date('2026-09-10'),
    items: [
      new CartItem({
        id: 'i-1',
        sessionId: 's-mercadona',
        barcode: '8410000001',
        name: 'Leche Entera 1L',
        unitPrice: Money.fromCents(150),
        quantity: 1,
      }),
    ],
  });

  const pastSessionCarrefour = new ShoppingSession({
    id: 's-carrefour',
    status: 'COMPLETED',
    storeName: 'Carrefour',
    endedAt: new Date('2026-09-05'),
    items: [
      new CartItem({
        id: 'i-2',
        sessionId: 's-carrefour',
        barcode: '8410000001',
        name: 'Leche Entera 1L',
        unitPrice: Money.fromCents(105),
        quantity: 1,
      }),
    ],
  });

  it('renders previous purchase banner when product has history at current store', () => {
    const service = new StorePriceHistoryService([pastSessionMercadona]);

    const html = renderToString(
      <ScanPricePromptModal
        isOpen={true}
        barcode="8410000001"
        initialName="Leche Entera 1L"
        currentStore="Mercadona"
        priceHistoryService={service}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(html).toContain('Última vez en Mercadona: 1,50 €');
  });

  it('renders dynamic live delta chip when initial price is provided and differs from previous purchase', () => {
    const service = new StorePriceHistoryService([pastSessionMercadona]);

    // Initial price 1.70 € vs 1.50 € past price -> UP +0.20 € (+13.3%)
    const html = renderToString(
      <ScanPricePromptModal
        isOpen={true}
        barcode="8410000001"
        initialName="Leche Entera 1L"
        initialPrice={Money.fromCents(170)}
        currentStore="Mercadona"
        priceHistoryService={service}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(html).toContain('live-delta-chip');
    expect(html).toContain('+0,20 €');
    expect(html).toContain('+13,3 %');
  });

  it('renders cross-store best price alert when product was cheaper elsewhere', () => {
    const service = new StorePriceHistoryService([pastSessionMercadona, pastSessionCarrefour]);

    const html = renderToString(
      <ScanPricePromptModal
        isOpen={true}
        barcode="8410000001"
        initialName="Leche Entera 1L"
        initialPrice={Money.fromCents(150)}
        currentStore="Mercadona"
        priceHistoryService={service}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onViewPriceHistory={vi.fn()}
      />
    );

    expect(html).toContain('Mínimo histórico: 1,05 € en Carrefour');
    expect(html).toContain('Ver historial');
  });
});
