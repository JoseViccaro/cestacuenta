import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PriceTrendBadge } from '../../../src/ui/components/PriceTrendBadge.js';
import { Money } from '../../../src/domain/value-objects/Money.js';
import { ProductPriceComparisonResult } from '../../../src/domain/entities/PriceObservation.js';

describe('PriceTrendBadge Component', () => {
  const baseComparison: ProductPriceComparisonResult = {
    productName: 'Leche Entera 1L',
    barcode: '8410000001',
    currentStore: 'Mercadona',
    currentPrice: Money.fromCents(115),
    sameStoreDelta: {
      diffCents: 15,
      absoluteDiff: Money.fromCents(15),
      percentage: 15.0,
      direction: 'UP',
      formattedDiff: '+0,15 €',
      formattedPercent: '+15,0 %',
    },
    bestHistoricalObservation: {
      price: Money.fromCents(100),
      date: new Date('2026-09-10'),
      storeName: 'Mercadona',
      sessionId: 's-1',
      productName: 'Leche Entera 1L',
      barcode: '8410000001',
      isPromotional: false,
    },
    isCurrentBest: false,
    potentialSavings: Money.fromCents(15),
    storeComparisons: [],
    sameStoreObservations: [],
  };

  it('returns empty string / null when comparison is null', () => {
    const html = renderToString(<PriceTrendBadge comparison={null} />);
    expect(html).toBe('');
  });

  it('renders warm red alert badge with ▲ and formatted diff when trend is UP', () => {
    const html = renderToString(<PriceTrendBadge comparison={baseComparison} />);

    expect(html).toContain('trend-badge');
    expect(html).toContain('trend-badge--up');
    expect(html).toContain('+0,15 €');
    expect(html).toContain('aria-label="Precio 0,15 € más caro que la última vez en este supermercado"');
  });

  it('renders emerald green savings badge with ▼ and formatted diff when trend is DOWN', () => {
    const savingsComparison: ProductPriceComparisonResult = {
      ...baseComparison,
      currentPrice: Money.fromCents(85),
      sameStoreDelta: {
        diffCents: -15,
        absoluteDiff: Money.fromCents(15),
        percentage: -15.0,
        direction: 'DOWN',
        formattedDiff: '-0,15 €',
        formattedPercent: '-15,0 %',
      },
    };

    const html = renderToString(<PriceTrendBadge comparison={savingsComparison} />);

    expect(html).toContain('trend-badge--down');
    expect(html).toContain('-0,15 €');
    expect(html).toContain('aria-label="Precio 0,15 € más barato que la última vez en este supermercado"');
  });

  it('renders amber gold badge with ★ and "Mejor precio" when isCurrentBest is true and trend is EQUAL', () => {
    const bestComparison: ProductPriceComparisonResult = {
      ...baseComparison,
      isCurrentBest: true,
      potentialSavings: Money.zero(),
      sameStoreDelta: {
        diffCents: 0,
        absoluteDiff: Money.zero(),
        percentage: 0,
        direction: 'EQUAL',
        formattedDiff: '0,00 €',
        formattedPercent: '0,0 %',
      },
    };

    const html = renderToString(<PriceTrendBadge comparison={bestComparison} />);

    expect(html).toContain('trend-badge--best');
    expect(html).toContain('Mejor precio');
  });

  it('renders neutral slate badge with = and "Mismo precio" when trend is EQUAL and not uniquely best', () => {
    const equalComparison: ProductPriceComparisonResult = {
      ...baseComparison,
      isCurrentBest: false,
      sameStoreDelta: {
        diffCents: 0,
        absoluteDiff: Money.zero(),
        percentage: 0,
        direction: 'EQUAL',
        formattedDiff: '0,00 €',
        formattedPercent: '0,0 %',
      },
    };

    const html = renderToString(<PriceTrendBadge comparison={equalComparison} />);

    expect(html).toContain('trend-badge--equal');
    expect(html).toContain('Mismo precio');
  });

  it('renders cyan badge with ℹ and "Primera vez" on first visit to store with history elsewhere', () => {
    const firstVisitComparison: ProductPriceComparisonResult = {
      ...baseComparison,
      sameStoreDelta: null,
      isCurrentBest: false,
      bestHistoricalObservation: {
        price: Money.fromCents(90),
        date: new Date('2026-09-01'),
        storeName: 'Carrefour',
        sessionId: 's-c',
        productName: 'Leche Entera 1L',
        barcode: '8410000001',
        isPromotional: false,
      },
    };

    const html = renderToString(<PriceTrendBadge comparison={firstVisitComparison} />);

    expect(html).toContain('trend-badge--first');
    expect(html).toContain('Primera vez');
  });

  it('renders with button role and tabIndex when onClick is provided', () => {
    const html = renderToString(
      <PriceTrendBadge comparison={baseComparison} onClick={vi.fn()} />
    );

    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
  });

  it('applies compact styling when compact prop is true', () => {
    const html = renderToString(
      <PriceTrendBadge comparison={baseComparison} compact={true} />
    );

    expect(html).toContain('trend-badge--compact');
  });
});
