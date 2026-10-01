import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '../../../src/domain/value-objects/Money.js';
import { ShoppingSession } from '../../../src/domain/entities/ShoppingSession.js';
import { CartItem } from '../../../src/domain/entities/CartItem.js';
import {
  StorePriceHistoryService,
} from '../../../src/domain/services/StorePriceHistoryService.js';
import {
  PriceObservation,
  PriceDelta,
} from '../../../src/domain/entities/PriceObservation.js';

describe('StorePriceHistoryService', () => {
  const dateSep10 = new Date('2026-09-10T10:00:00Z');
  const dateSep15 = new Date('2026-09-15T10:00:00Z');
  const dateSep20 = new Date('2026-09-20T10:00:00Z');
  const dateSep25 = new Date('2026-09-25T10:00:00Z');

  describe('1. Session Source Filtering & Index Building', () => {
    it('indexes observations only from COMPLETED sessions, ignoring ACTIVE and DISCARDED', () => {
      const completedSession = new ShoppingSession({
        id: 'session-1',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep15,
        items: [
          new CartItem({
            id: 'item-1',
            sessionId: 'session-1',
            barcode: '8410000001',
            name: 'Leche Entera 1L',
            unitPrice: Money.fromCents(95),
            quantity: 2,
          }),
        ],
      });

      const activeSession = new ShoppingSession({
        id: 'session-2',
        status: 'ACTIVE',
        storeName: 'Carrefour',
        items: [
          new CartItem({
            id: 'item-2',
            sessionId: 'session-2',
            barcode: '8410000001',
            name: 'Leche Entera 1L',
            unitPrice: Money.fromCents(89),
            quantity: 1,
          }),
        ],
      });

      const discardedSession = new ShoppingSession({
        id: 'session-3',
        status: 'DISCARDED',
        storeName: 'Dia',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'item-3',
            sessionId: 'session-3',
            barcode: '8410000001',
            name: 'Leche Entera 1L',
            unitPrice: Money.fromCents(80),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([completedSession, activeSession, discardedSession]);
      const history = service.getHistory({ barcode: '8410000001', name: 'Leche Entera 1L' });

      expect(history).not.toBeNull();
      expect(history!.observations).toHaveLength(1);
      expect(history!.observations[0].sessionId).toBe('session-1');
      expect(history!.observations[0].storeName).toBe('Mercadona');
      expect(history!.observations[0].price.cents).toBe(95);
    });

    it('indexes chronologically descending (newest observation at index 0)', () => {
      const session1 = new ShoppingSession({
        id: 's-1',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-1',
            barcode: '8410000001',
            name: 'Leche Entera 1L',
            unitPrice: Money.fromCents(95),
            quantity: 1,
          }),
        ],
      });

      const session2 = new ShoppingSession({
        id: 's-2',
        status: 'COMPLETED',
        storeName: 'Carrefour',
        endedAt: dateSep20,
        items: [
          new CartItem({
            id: 'i-2',
            sessionId: 's-2',
            barcode: '8410000001',
            name: 'Leche Entera 1L',
            unitPrice: Money.fromCents(90),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session1, session2]);
      const history = service.getHistory({ barcode: '8410000001', name: 'Leche Entera 1L' });

      expect(history).not.toBeNull();
      expect(history!.observations).toHaveLength(2);
      expect(history!.observations[0].date).toEqual(dateSep20);
      expect(history!.observations[0].storeName).toBe('Carrefour');
      expect(history!.observations[1].date).toEqual(dateSep10);
      expect(history!.observations[1].storeName).toBe('Mercadona');
      expect(history!.latestObservation.storeName).toBe('Carrefour');
    });

    it('records isPromotional = true when item discount is greater than 0', () => {
      const session = new ShoppingSession({
        id: 's-promo',
        status: 'COMPLETED',
        storeName: 'Lidl',
        endedAt: dateSep15,
        items: [
          new CartItem({
            id: 'i-promo',
            sessionId: 's-promo',
            barcode: '8410000005',
            name: 'Café Molido',
            unitPrice: Money.fromCents(250),
            quantity: 2,
            discount: Money.fromCents(50),
          }),
        ],
      });

      const service = new StorePriceHistoryService([session]);
      const history = service.getHistory({ barcode: '8410000005', name: 'Café Molido' });

      expect(history).not.toBeNull();
      expect(history!.observations[0].price.cents).toBe(250);
      expect(history!.observations[0].isPromotional).toBe(true);
    });

    it('falls back to startedAt if endedAt is missing in completed session', () => {
      const session = new ShoppingSession({
        id: 's-fallback-date',
        status: 'COMPLETED',
        storeName: 'Alcampo',
        startedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-fallback-date',
            barcode: '8410000009',
            name: 'Arroz Redondo',
            unitPrice: Money.fromCents(120),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session]);
      const history = service.getHistory({ barcode: '8410000009', name: 'Arroz' });
      expect(history!.observations[0].date).toEqual(dateSep10);
    });
  });

  describe('2. Product Matching Hierarchy & Name Normalization', () => {
    it('prioritizes exact barcode match over product name', () => {
      const session = new ShoppingSession({
        id: 's-barcode',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep15,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-barcode',
            barcode: '8410000001',
            name: 'Leche Entera 1L',
            unitPrice: Money.fromCents(95),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session]);
      // Search with barcode and totally different name
      const history = service.getHistory({ barcode: '8410000001', name: 'Nombre Desconocido' });
      expect(history).not.toBeNull();
      expect(history!.observations[0].productName).toBe('Leche Entera 1L');
    });

    it('matches produce/bulk items without barcode via diacritic-insensitive normalized name', () => {
      const session = new ShoppingSession({
        id: 's-bulk',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep15,
        items: [
          new CartItem({
            id: 'i-bulk',
            sessionId: 's-bulk',
            name: 'Plátano de Canarias',
            unitPrice: Money.fromCents(199),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session]);

      // Query with erratic whitespace, uppercase, missing accent
      const history = service.getHistory({ name: '  PLATANO   DE CANARIAS  ' });
      expect(history).not.toBeNull();
      expect(history!.observations[0].price.cents).toBe(199);
      expect(history!.observations[0].productName).toBe('Plátano de Canarias');
    });

    it('returns null when product has no historical purchases anywhere', () => {
      const service = new StorePriceHistoryService([]);
      const history = service.getHistory({ barcode: '8499999999', name: 'Inexistente' });
      expect(history).toBeNull();

      const comparison = service.comparePrice({
        barcode: '8499999999',
        name: 'Inexistente',
        currentPrice: Money.fromCents(200),
        currentStore: 'Mercadona',
      });
      expect(comparison).toBeNull();
    });
  });

  describe('3. Store Name Normalization & Grouping', () => {
    it('normalizes store names with varying casing and whitespace while preserving latest casing for display', () => {
      const session1 = new ShoppingSession({
        id: 's-1',
        status: 'COMPLETED',
        storeName: 'mercadona  ',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-1',
            barcode: '8410000001',
            name: 'Pan de Molde',
            unitPrice: Money.fromCents(100),
            quantity: 1,
          }),
        ],
      });

      const session2 = new ShoppingSession({
        id: 's-2',
        status: 'COMPLETED',
        storeName: '  MERCADONA ',
        endedAt: dateSep20,
        items: [
          new CartItem({
            id: 'i-2',
            sessionId: 's-2',
            barcode: '8410000001',
            name: 'Pan de Molde',
            unitPrice: Money.fromCents(110),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session1, session2]);
      const comparison = service.comparePrice({
        barcode: '8410000001',
        name: 'Pan de Molde',
        currentPrice: Money.fromCents(120),
        currentStore: 'Mercadona',
      });

      expect(comparison).not.toBeNull();
      // Should match the same store and calculate sameStoreDelta vs session2 (110 cents)
      expect(comparison!.sameStoreDelta).not.toBeNull();
      expect(comparison!.sameStoreDelta!.diffCents).toBe(10); // 120 - 110 = 10
      expect(comparison!.sameStoreDelta!.direction).toBe('UP');
    });

    it('defaults undefined or blank store names to "Supermercado"', () => {
      const session = new ShoppingSession({
        id: 's-blank-store',
        status: 'COMPLETED',
        storeName: '   ',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-blank-store',
            barcode: '8410000001',
            name: 'Agua 5L',
            unitPrice: Money.fromCents(80),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session]);
      const lastPrice = service.getLastPriceAtStore({
        barcode: '8410000001',
        name: 'Agua 5L',
        storeName: 'Supermercado',
      });

      expect(lastPrice).not.toBeNull();
      expect(lastPrice!.storeName).toBe('Supermercado');
    });
  });

  describe('4. StorePriceHistoryService.computeDelta', () => {
    it('calculates price increase (UP) with positive diff, percentage and formatted values', () => {
      const delta = StorePriceHistoryService.computeDelta(
        Money.fromCents(115),
        Money.fromCents(100)
      );

      expect(delta.diffCents).toBe(15);
      expect(delta.direction).toBe('UP');
      expect(delta.percentage).toBe(15.0);
      expect(delta.absoluteDiff.cents).toBe(15);
      expect(delta.formattedDiff).toBe('+0,15 €');
      expect(delta.formattedPercent).toBe('+15,0 %');
    });

    it('calculates price drop (DOWN) with negative diff, percentage, positive absoluteDiff and formatted values', () => {
      const delta = StorePriceHistoryService.computeDelta(
        Money.fromCents(220),
        Money.fromCents(250)
      );

      expect(delta.diffCents).toBe(-30);
      expect(delta.direction).toBe('DOWN');
      expect(delta.percentage).toBe(-12.0);
      expect(delta.absoluteDiff.cents).toBe(30);
      expect(delta.formattedDiff).toBe('-0,30 €');
      expect(delta.formattedPercent).toBe('-12,0 %');
    });

    it('calculates equal price (EQUAL) with 0 diff, 0.0 percentage and formatted values', () => {
      const delta = StorePriceHistoryService.computeDelta(
        Money.fromCents(150),
        Money.fromCents(150)
      );

      expect(delta.diffCents).toBe(0);
      expect(delta.direction).toBe('EQUAL');
      expect(delta.percentage).toBe(0.0);
      expect(delta.absoluteDiff.cents).toBe(0);
      expect(delta.formattedDiff).toBe('0,00 €');
      expect(delta.formattedPercent).toBe('0,0 %');
    });

    it('handles zero previous price safely without division by zero NaN', () => {
      const delta = StorePriceHistoryService.computeDelta(
        Money.fromCents(100),
        Money.fromCents(0)
      );

      expect(delta.percentage).toBe(0.0);
      expect(delta.direction).toBe('UP');
    });
  });

  describe('5. Same-Store Price Delta Calculation (comparePrice)', () => {
    it('computes same-store inflation delta when previous purchase exists at current store', () => {
      const session = new ShoppingSession({
        id: 's-1',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-1',
            barcode: '8410000001',
            name: 'Leche Entera 1L',
            unitPrice: Money.fromCents(100),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session]);
      const comparison = service.comparePrice({
        barcode: '8410000001',
        name: 'Leche Entera 1L',
        currentPrice: Money.fromCents(115),
        currentStore: 'Mercadona',
      });

      expect(comparison).not.toBeNull();
      expect(comparison!.sameStoreDelta).not.toBeNull();
      expect(comparison!.sameStoreDelta!.diffCents).toBe(15);
      expect(comparison!.sameStoreDelta!.direction).toBe('UP');
      expect(comparison!.sameStoreDelta!.formattedDiff).toBe('+0,15 €');
      expect(comparison!.sameStoreDelta!.formattedPercent).toBe('+15,0 %');
      expect(comparison!.sameStoreObservations).toHaveLength(1);
    });

    it('returns sameStoreDelta = null when product is purchased for the first time at current store', () => {
      const session = new ShoppingSession({
        id: 's-carrefour',
        status: 'COMPLETED',
        storeName: 'Carrefour',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-carrefour',
            barcode: '8410000004',
            name: 'Detergente Lavadora',
            unitPrice: Money.fromCents(850),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session]);
      const comparison = service.comparePrice({
        barcode: '8410000004',
        name: 'Detergente Lavadora',
        currentPrice: Money.fromCents(890),
        currentStore: 'Mercadona',
      });

      expect(comparison).not.toBeNull();
      expect(comparison!.sameStoreDelta).toBeNull();
      expect(comparison!.isCurrentBest).toBe(false);
      expect(comparison!.potentialSavings.cents).toBe(40); // 890 - 850 = 40
      expect(comparison!.bestHistoricalObservation.storeName).toBe('Carrefour');
      expect(comparison!.sameStoreObservations).toHaveLength(0);
    });
  });

  describe('6. Cross-Store Comparison & Historical Best Price', () => {
    it('identifies historical best price across multiple stores and calculates potential savings', () => {
      const session1 = new ShoppingSession({
        id: 's-1',
        status: 'COMPLETED',
        storeName: 'Carrefour',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-1',
            barcode: '8410000010',
            name: 'Aceite de Oliva 1L',
            unitPrice: Money.fromCents(799),
            quantity: 1,
          }),
        ],
      });

      const session2 = new ShoppingSession({
        id: 's-2',
        status: 'COMPLETED',
        storeName: 'Lidl',
        endedAt: dateSep15,
        items: [
          new CartItem({
            id: 'i-2',
            sessionId: 's-2',
            barcode: '8410000010',
            name: 'Aceite de Oliva 1L',
            unitPrice: Money.fromCents(749),
            quantity: 1,
          }),
        ],
      });

      const session3 = new ShoppingSession({
        id: 's-3',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep20,
        items: [
          new CartItem({
            id: 'i-3',
            sessionId: 's-3',
            barcode: '8410000010',
            name: 'Aceite de Oliva 1L',
            unitPrice: Money.fromCents(820),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session1, session2, session3]);

      // When current price at Mercadona is 8.50 €
      const resultHigher = service.comparePrice({
        barcode: '8410000010',
        name: 'Aceite de Oliva 1L',
        currentPrice: Money.fromCents(850),
        currentStore: 'Mercadona',
      });

      expect(resultHigher!.isCurrentBest).toBe(false);
      expect(resultHigher!.bestHistoricalObservation.storeName).toBe('Lidl');
      expect(resultHigher!.bestHistoricalObservation.price.cents).toBe(749);
      expect(resultHigher!.potentialSavings.cents).toBe(101); // 850 - 749 = 101 cents (1,01 €)

      // Store comparison ranking: current store first, then sorted by price ascending
      expect(resultHigher!.storeComparisons).toHaveLength(3);
      expect(resultHigher!.storeComparisons[0].storeName).toBe('Mercadona');
      expect(resultHigher!.storeComparisons[0].isCurrentStore).toBe(true);

      expect(resultHigher!.storeComparisons[1].storeName).toBe('Lidl');
      expect(resultHigher!.storeComparisons[1].latestPrice.cents).toBe(749);
      expect(resultHigher!.storeComparisons[1].isCheapest).toBe(true);
      expect(resultHigher!.storeComparisons[1].diffVsCurrent!.diffCents).toBe(-101); // 749 - 850

      expect(resultHigher!.storeComparisons[2].storeName).toBe('Carrefour');
      expect(resultHigher!.storeComparisons[2].latestPrice.cents).toBe(799);
      expect(resultHigher!.storeComparisons[2].diffVsCurrent!.diffCents).toBe(-51); // 799 - 850
    });

    it('sets isCurrentBest = true and potentialSavings = zero when current price is <= all historical prices', () => {
      const session1 = new ShoppingSession({
        id: 's-1',
        status: 'COMPLETED',
        storeName: 'Carrefour',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-1',
            barcode: '8410000011',
            name: 'Atún Claro 3x80g',
            unitPrice: Money.fromCents(280),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session1]);
      const result = service.comparePrice({
        barcode: '8410000011',
        name: 'Atún Claro 3x80g',
        currentPrice: Money.fromCents(250), // Cheaper than 2.80
        currentStore: 'Mercadona',
      });

      expect(result!.isCurrentBest).toBe(true);
      expect(result!.potentialSavings.cents).toBe(0);
      expect(result!.storeComparisons[0].isCheapest).toBe(true);
    });

    it('handles single store history without errors', () => {
      const session = new ShoppingSession({
        id: 's-1',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-1',
            barcode: '8410000020',
            name: 'Yogur Natural',
            unitPrice: Money.fromCents(120),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session]);
      const result = service.comparePrice({
        barcode: '8410000020',
        name: 'Yogur Natural',
        currentPrice: Money.fromCents(120),
        currentStore: 'Mercadona',
      });

      expect(result).not.toBeNull();
      expect(result!.storeComparisons).toHaveLength(1);
      expect(result!.storeComparisons[0].storeName).toBe('Mercadona');
    });
  });

  describe('7. Incremental Session Indexing (indexSession)', () => {
    it('appends completed session items to index maps immediately without reloading from repository', () => {
      const service = new StorePriceHistoryService([]);
      expect(service.getHistory({ barcode: '8410000030', name: 'Galletas María' })).toBeNull();

      const newSession = new ShoppingSession({
        id: 's-new',
        status: 'COMPLETED',
        storeName: 'Dia',
        endedAt: dateSep25,
        items: [
          new CartItem({
            id: 'i-new',
            sessionId: 's-new',
            barcode: '8410000030',
            name: 'Galletas María',
            unitPrice: Money.fromCents(140),
            quantity: 2,
          }),
        ],
      });

      service.indexSession(newSession);

      const history = service.getHistory({ barcode: '8410000030', name: 'Galletas María' });
      expect(history).not.toBeNull();
      expect(history!.observations).toHaveLength(1);
      expect(history!.observations[0].price.cents).toBe(140);
      expect(history!.observations[0].storeName).toBe('Dia');
    });

    it('ignores non-completed sessions passed to indexSession', () => {
      const service = new StorePriceHistoryService([]);
      const activeSession = new ShoppingSession({
        id: 's-active',
        status: 'ACTIVE',
        storeName: 'Dia',
        items: [
          new CartItem({
            id: 'i-active',
            sessionId: 's-active',
            barcode: '8410000031',
            name: 'Mantequilla',
            unitPrice: Money.fromCents(210),
            quantity: 1,
          }),
        ],
      });

      service.indexSession(activeSession);
      expect(service.getHistory({ barcode: '8410000031', name: 'Mantequilla' })).toBeNull();
    });
  });

  describe('8. Query Helper Methods', () => {
    it('getLastPriceAtStore returns newest observation at target store', () => {
      const session1 = new ShoppingSession({
        id: 's-1',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-1',
            barcode: '8410000040',
            name: 'Huevos L',
            unitPrice: Money.fromCents(230),
            quantity: 1,
          }),
        ],
      });

      const session2 = new ShoppingSession({
        id: 's-2',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep20,
        items: [
          new CartItem({
            id: 'i-2',
            sessionId: 's-2',
            barcode: '8410000040',
            name: 'Huevos L',
            unitPrice: Money.fromCents(245),
            quantity: 1,
          }),
        ],
      });

      const session3 = new ShoppingSession({
        id: 's-3',
        status: 'COMPLETED',
        storeName: 'Carrefour',
        endedAt: dateSep25,
        items: [
          new CartItem({
            id: 'i-3',
            sessionId: 's-3',
            barcode: '8410000040',
            name: 'Huevos L',
            unitPrice: Money.fromCents(250),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session1, session2, session3]);

      const lastMercadona = service.getLastPriceAtStore({
        storeName: 'Mercadona',
        barcode: '8410000040',
        name: 'Huevos L',
      });
      expect(lastMercadona).not.toBeNull();
      expect(lastMercadona!.price.cents).toBe(245);
      expect(lastMercadona!.date).toEqual(dateSep20);

      const lastLidl = service.getLastPriceAtStore({
        storeName: 'Lidl',
        barcode: '8410000040',
        name: 'Huevos L',
      });
      expect(lastLidl).toBeNull();
    });

    it('getBestPrice returns lowest observation across all stores', () => {
      const session1 = new ShoppingSession({
        id: 's-1',
        status: 'COMPLETED',
        storeName: 'Mercadona',
        endedAt: dateSep10,
        items: [
          new CartItem({
            id: 'i-1',
            sessionId: 's-1',
            barcode: '8410000050',
            name: 'Café Grano',
            unitPrice: Money.fromCents(450),
            quantity: 1,
          }),
        ],
      });

      const session2 = new ShoppingSession({
        id: 's-2',
        status: 'COMPLETED',
        storeName: 'Lidl',
        endedAt: dateSep15,
        items: [
          new CartItem({
            id: 'i-2',
            sessionId: 's-2',
            barcode: '8410000050',
            name: 'Café Grano',
            unitPrice: Money.fromCents(399),
            quantity: 1,
          }),
        ],
      });

      const service = new StorePriceHistoryService([session1, session2]);
      const best = service.getBestPrice({ barcode: '8410000050', name: 'Café Grano' });

      expect(best).not.toBeNull();
      expect(best!.price.cents).toBe(399);
      expect(best!.storeName).toBe('Lidl');
    });
  });
});
