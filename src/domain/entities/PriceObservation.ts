import { Money } from '../value-objects/Money.js';

export type TrendDirection = 'UP' | 'DOWN' | 'EQUAL';

export interface PriceObservation {
  readonly price: Money;
  readonly date: Date;
  readonly storeName: string;
  readonly sessionId: string;
  readonly productName: string;
  readonly barcode?: string;
  readonly isPromotional: boolean;
}

export interface PriceDelta {
  readonly diffCents: number;            // Signed difference in cents (e.g., +15, -30, 0)
  readonly absoluteDiff: Money;          // Non-negative Money instance for safe rendering
  readonly percentage: number;           // Rounded to 1 decimal place (e.g., 15.0, -12.5, 0.0)
  readonly direction: TrendDirection;    // 'UP' | 'DOWN' | 'EQUAL'
  readonly formattedDiff: string;        // Localized string e.g., "+0,15 €", "-0,30 €", "0,00 €"
  readonly formattedPercent: string;     // Localized string e.g., "+15,0 %", "-12,5 %", "0,0 %"
}

export interface StorePriceComparison {
  readonly storeName: string;
  readonly isCurrentStore: boolean;
  readonly latestPrice: Money;
  readonly latestDate: Date;
  readonly diffVsCurrent?: PriceDelta;   // Difference relative to current store's shelf price
  readonly isCheapest: boolean;
}

export interface ProductPriceComparisonResult {
  readonly productName: string;
  readonly barcode?: string;
  readonly currentStore: string;
  readonly currentPrice: Money;
  readonly sameStoreDelta: PriceDelta | null; // null if first purchase at current store
  readonly bestHistoricalObservation: PriceObservation;
  readonly isCurrentBest: boolean;
  readonly potentialSavings: Money;      // Money.zero() if isCurrentBest is true
  readonly storeComparisons: StorePriceComparison[];
  readonly sameStoreObservations: PriceObservation[]; // Chronological list at current store
}

export interface ProductPriceHistory {
  readonly observations: PriceObservation[];
  readonly latestObservation: PriceObservation;
  readonly bestObservation: PriceObservation;
}
