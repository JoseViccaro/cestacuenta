import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ProductPriceHistoryModal } from '../../../src/ui/components/ProductPriceHistoryModal.js';
import { Money } from '../../../src/domain/value-objects/Money.js';
import { ProductPriceComparisonResult } from '../../../src/domain/entities/PriceObservation.js';

describe('ProductPriceHistoryModal Component', () => {
  const mockComparison: ProductPriceComparisonResult = {
    productName: 'Aceite de Oliva Virgen Extra 1L',
    barcode: '8410000010',
    currentStore: 'Mercadona',
    currentPrice: Money.fromCents(850),
    sameStoreDelta: {
      diffCents: 30,
      absoluteDiff: Money.fromCents(30),
      percentage: 3.7,
      direction: 'UP',
      formattedDiff: '+0,30 €',
      formattedPercent: '+3,7 %',
    },
    bestHistoricalObservation: {
      price: Money.fromCents(749),
      date: new Date('2026-09-15T12:00:00Z'),
      storeName: 'Lidl',
      sessionId: 's-lidl',
      productName: 'Aceite de Oliva Virgen Extra 1L',
      barcode: '8410000010',
      isPromotional: false,
    },
    isCurrentBest: false,
    potentialSavings: Money.fromCents(101),
    storeComparisons: [
      {
        storeName: 'Mercadona',
        isCurrentStore: true,
        latestPrice: Money.fromCents(850),
        latestDate: new Date('2026-09-20T10:00:00Z'),
        diffVsCurrent: undefined,
        isCheapest: false,
      },
      {
        storeName: 'Lidl',
        isCurrentStore: false,
        latestPrice: Money.fromCents(749),
        latestDate: new Date('2026-09-15T12:00:00Z'),
        diffVsCurrent: {
          diffCents: -101,
          absoluteDiff: Money.fromCents(101),
          percentage: -11.9,
          direction: 'DOWN',
          formattedDiff: '-1,01 €',
          formattedPercent: '-11,9 %',
        },
        isCheapest: true,
      },
      {
        storeName: 'Carrefour',
        isCurrentStore: false,
        latestPrice: Money.fromCents(799),
        latestDate: new Date('2026-09-10T15:00:00Z'),
        diffVsCurrent: {
          diffCents: -51,
          absoluteDiff: Money.fromCents(51),
          percentage: -6.0,
          direction: 'DOWN',
          formattedDiff: '-0,51 €',
          formattedPercent: '-6,0 %',
        },
        isCheapest: false,
      },
    ],
    sameStoreObservations: [
      {
        price: Money.fromCents(820),
        date: new Date('2026-09-01T09:00:00Z'),
        storeName: 'Mercadona',
        sessionId: 's-m1',
        productName: 'Aceite de Oliva Virgen Extra 1L',
        barcode: '8410000010',
        isPromotional: true,
      },
    ],
  };

  it('returns empty string when isOpen is false', () => {
    const html = renderToString(
      <ProductPriceHistoryModal
        isOpen={false}
        comparison={mockComparison}
        onClose={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('returns empty string when comparison is null', () => {
    const html = renderToString(
      <ProductPriceHistoryModal
        isOpen={true}
        comparison={null}
        onClose={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('renders modal dialog sheet with proper accessibility attributes', () => {
    const html = renderToString(
      <ProductPriceHistoryModal
        isOpen={true}
        comparison={mockComparison}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby=');
  });

  it('renders summary header with product name, barcode, current price and store', () => {
    const html = renderToString(
      <ProductPriceHistoryModal
        isOpen={true}
        comparison={mockComparison}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('Aceite de Oliva Virgen Extra 1L');
    expect(html).toContain('8410000010');
    expect(html).toContain('8,50 €');
    expect(html).toContain('Mercadona');
    expect(html).toContain('+0,30 €');
  });

  it('renders savings banner when potentialSavings > 0', () => {
    const html = renderToString(
      <ProductPriceHistoryModal
        isOpen={true}
        comparison={mockComparison}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('price-history-savings-banner');
    expect(html).toContain('Lidl');
    expect(html).toContain('7,49 €');
    expect(html).toContain('1,01 €');
  });

  it('suppresses savings banner when isCurrentBest is true', () => {
    const bestComparison: ProductPriceComparisonResult = {
      ...mockComparison,
      isCurrentBest: true,
      potentialSavings: Money.zero(),
    };

    const html = renderToString(
      <ProductPriceHistoryModal
        isOpen={true}
        comparison={bestComparison}
        onClose={vi.fn()}
      />
    );

    expect(html).not.toContain('price-history-savings-banner');
  });

  it('renders store comparison ranking table with all stores and relative deltas', () => {
    const html = renderToString(
      <ProductPriceHistoryModal
        isOpen={true}
        comparison={mockComparison}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('store-comparison-table');
    expect(html).toContain('Establecimiento');
    expect(html).toContain('Último precio');
    expect(html).toContain('Diferencia');

    // Current store
    expect(html).toContain('Mercadona');
    // Other stores
    expect(html).toContain('Lidl');
    expect(html).toContain('7,49 €');
    expect(html).toContain('-1,01 €');
    expect(html).toContain('Carrefour');
    expect(html).toContain('7,99 €');
    expect(html).toContain('-0,51 €');
  });

  it('renders chronological price evolution timeline at current store and shows promo tag', () => {
    const html = renderToString(
      <ProductPriceHistoryModal
        isOpen={true}
        comparison={mockComparison}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('price-timeline-list');
    expect(html).toContain('8,20 €');
    expect(html).toContain('Promo aplicada');
  });

  it('renders close button with accessible aria-label', () => {
    const html = renderToString(
      <ProductPriceHistoryModal
        isOpen={true}
        comparison={mockComparison}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Cerrar ventana"');
  });
});
