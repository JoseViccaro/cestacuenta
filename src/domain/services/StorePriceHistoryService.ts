import { Money } from '../value-objects/Money.js';
import { ShoppingSession } from '../entities/ShoppingSession.js';
import { normalizeText } from './ShoppingListMatcherService.js';
import {
  PriceObservation,
  PriceDelta,
  StorePriceComparison,
  ProductPriceComparisonResult,
  ProductPriceHistory,
  TrendDirection,
} from '../entities/PriceObservation.js';

export interface ComparePriceParams {
  currentPrice: Money;
  currentStore?: string;
  barcode?: string;
  name: string;
}

export interface QueryHistoryParams {
  barcode?: string;
  name: string;
}

export class StorePriceHistoryService {
  private readonly byBarcode = new Map<string, PriceObservation[]>();
  private readonly byNormalizedName = new Map<string, PriceObservation[]>();
  private readonly storeDisplayNames = new Map<string, string>();

  constructor(sessions?: ShoppingSession[]) {
    if (sessions && Array.isArray(sessions)) {
      this.buildIndex(sessions);
    }
  }

  /**
   * Replaces all internal index maps with observations from the provided completed sessions.
   */
  buildIndex(sessions: ShoppingSession[]): void {
    this.byBarcode.clear();
    this.byNormalizedName.clear();
    this.storeDisplayNames.clear();

    for (const session of sessions) {
      if (session.status === 'COMPLETED') {
        this.indexSession(session);
      }
    }
  }

  /**
   * Incrementally indexes items from a completed session into existing maps.
   */
  indexSession(session: ShoppingSession): void {
    if (session.status !== 'COMPLETED') {
      return;
    }

    const storeName = this.normalizeStoreDisplayName(session.storeName);
    const storeKey = this.normalizeStoreName(storeName);
    this.storeDisplayNames.set(storeKey, storeName);

    const date = session.endedAt ?? session.startedAt ?? new Date();

    for (const item of session.items) {
      const observation: PriceObservation = {
        price: item.unitPrice,
        date,
        storeName,
        sessionId: session.id,
        productName: item.name.trim(),
        barcode: item.barcode?.trim() || undefined,
        isPromotional: (item.discount?.cents ?? 0) > 0,
      };

      if (observation.barcode) {
        let barcodeList = this.byBarcode.get(observation.barcode);
        if (!barcodeList) {
          barcodeList = [];
          this.byBarcode.set(observation.barcode, barcodeList);
        }
        this.insertSorted(barcodeList, observation);
      }

      const normalizedName = normalizeText(observation.productName);
      if (normalizedName) {
        let nameList = this.byNormalizedName.get(normalizedName);
        if (!nameList) {
          nameList = [];
          this.byNormalizedName.set(normalizedName, nameList);
        }
        this.insertSorted(nameList, observation);
      }
    }
  }

  /**
   * Computes a signed PriceDelta between two Money values.
   */
  static computeDelta(currentPrice: Money, previousPrice: Money): PriceDelta {
    const diffCents = currentPrice.cents - previousPrice.cents;
    const absoluteDiff = Money.fromCents(Math.abs(diffCents));

    let direction: TrendDirection;
    if (diffCents > 0) {
      direction = 'UP';
    } else if (diffCents < 0) {
      direction = 'DOWN';
    } else {
      direction = 'EQUAL';
    }

    const percentage =
      previousPrice.cents === 0
        ? 0.0
        : Math.round((diffCents / previousPrice.cents) * 1000) / 10;

    let formattedDiff: string;
    if (direction === 'UP') {
      formattedDiff = `+${absoluteDiff.toFormattedString()}`;
    } else if (direction === 'DOWN') {
      formattedDiff = `-${absoluteDiff.toFormattedString()}`;
    } else {
      formattedDiff = '0,00 €';
    }

    const formattedPercentNumber = percentage.toFixed(1).replace('.', ',');
    let formattedPercent: string;
    if (direction === 'UP') {
      formattedPercent = `+${formattedPercentNumber} %`;
    } else if (direction === 'DOWN') {
      formattedPercent = `${formattedPercentNumber} %`;
    } else {
      formattedPercent = '0,0 %';
    }

    return {
      diffCents,
      absoluteDiff,
      percentage,
      direction,
      formattedDiff,
      formattedPercent,
    };
  }

  /**
   * Retrieves all historical observations for a product matching barcode or normalized name.
   */
  getHistory(params: QueryHistoryParams): ProductPriceHistory | null {
    let observations: PriceObservation[] | undefined;

    const barcode = params.barcode?.trim();
    if (barcode) {
      observations = this.byBarcode.get(barcode);
    }

    if (!observations || observations.length === 0) {
      const normalized = normalizeText(params.name);
      if (normalized) {
        observations = this.byNormalizedName.get(normalized);
      }
    }

    if (!observations || observations.length === 0) {
      return null;
    }

    const latestObservation = observations[0];
    let bestObservation = observations[0];
    for (const obs of observations) {
      if (obs.price.cents < bestObservation.price.cents) {
        bestObservation = obs;
      }
    }

    return {
      observations: [...observations],
      latestObservation,
      bestObservation,
    };
  }

  /**
   * Retrieves the most recent price observation at a specific store.
   */
  getLastPriceAtStore(params: {
    storeName?: string;
    barcode?: string;
    name: string;
  }): PriceObservation | null {
    const history = this.getHistory({ barcode: params.barcode, name: params.name });
    if (!history) {
      return null;
    }

    const targetKey = this.normalizeStoreName(params.storeName);
    const match = history.observations.find(
      (obs) => this.normalizeStoreName(obs.storeName) === targetKey
    );

    return match ?? null;
  }

  /**
   * Retrieves the lowest price observation recorded across all stores.
   */
  getBestPrice(params: QueryHistoryParams): PriceObservation | null {
    const history = this.getHistory(params);
    return history?.bestObservation ?? null;
  }

  /**
   * Computes same-store price delta, cross-store comparisons, and historical best price.
   */
  comparePrice(params: ComparePriceParams): ProductPriceComparisonResult | null {
    const history = this.getHistory({ barcode: params.barcode, name: params.name });
    if (!history || history.observations.length === 0) {
      return null;
    }

    const currentStoreDisplay = this.normalizeStoreDisplayName(params.currentStore);
    const currentStoreKey = this.normalizeStoreName(currentStoreDisplay);

    const sameStoreObservations = history.observations.filter(
      (obs) => this.normalizeStoreName(obs.storeName) === currentStoreKey
    );

    const sameStoreDelta =
      sameStoreObservations.length > 0
        ? StorePriceHistoryService.computeDelta(
            params.currentPrice,
            sameStoreObservations[0].price
          )
        : null;

    const bestHistoricalObservation = history.bestObservation;
    const isCurrentBest = params.currentPrice.cents <= bestHistoricalObservation.price.cents;
    const potentialSavings = isCurrentBest
      ? Money.zero()
      : Money.fromCents(params.currentPrice.cents - bestHistoricalObservation.price.cents);

    // Group observations by store to build store comparisons
    const storeMap = new Map<string, PriceObservation[]>();
    for (const obs of history.observations) {
      const key = this.normalizeStoreName(obs.storeName);
      let list = storeMap.get(key);
      if (!list) {
        list = [];
        storeMap.set(key, list);
      }
      list.push(obs);
    }

    const comparisons: StorePriceComparison[] = [];

    // 1. Current store entry
    const currentStoreLatestDate =
      sameStoreObservations.length > 0 ? sameStoreObservations[0].date : new Date();

    const currentStoreComparison: StorePriceComparison = {
      storeName: this.storeDisplayNames.get(currentStoreKey) || currentStoreDisplay,
      isCurrentStore: true,
      latestPrice: params.currentPrice,
      latestDate: currentStoreLatestDate,
      diffVsCurrent: undefined,
      isCheapest: false,
    };
    comparisons.push(currentStoreComparison);

    // 2. Other stores sorted ascending by latest price
    const otherComparisons: StorePriceComparison[] = [];
    for (const [key, obsList] of storeMap.entries()) {
      if (key === currentStoreKey) {
        continue;
      }
      const latestObs = obsList[0];
      const displayName = this.storeDisplayNames.get(key) || latestObs.storeName;
      const diffVsCurrent = StorePriceHistoryService.computeDelta(
        latestObs.price,
        params.currentPrice
      );

      otherComparisons.push({
        storeName: displayName,
        isCurrentStore: false,
        latestPrice: latestObs.price,
        latestDate: latestObs.date,
        diffVsCurrent,
        isCheapest: false,
      });
    }

    otherComparisons.sort((a, b) => a.latestPrice.cents - b.latestPrice.cents);
    comparisons.push(...otherComparisons);

    // Identify cheapest store(s) among all comparisons
    let minPriceCents = comparisons[0].latestPrice.cents;
    for (const comp of comparisons) {
      if (comp.latestPrice.cents < minPriceCents) {
        minPriceCents = comp.latestPrice.cents;
      }
    }

    const finalStoreComparisons = comparisons.map((comp) => ({
      ...comp,
      isCheapest: comp.latestPrice.cents === minPriceCents,
    }));

    return {
      productName: params.name.trim(),
      barcode: params.barcode?.trim() || undefined,
      currentStore: currentStoreDisplay,
      currentPrice: params.currentPrice,
      sameStoreDelta,
      bestHistoricalObservation,
      isCurrentBest,
      potentialSavings,
      storeComparisons: finalStoreComparisons,
      sameStoreObservations,
    };
  }

  private insertSorted(list: PriceObservation[], item: PriceObservation): void {
    const itemTime = item.date.getTime();
    const index = list.findIndex((existing) => existing.date.getTime() < itemTime);
    if (index === -1) {
      list.push(item);
    } else {
      list.splice(index, 0, item);
    }
  }

  private normalizeStoreName(name?: string): string {
    const trimmed = name?.trim();
    return trimmed && trimmed.length > 0 ? trimmed.toLowerCase() : 'supermercado';
  }

  private normalizeStoreDisplayName(name?: string): string {
    const trimmed = name?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : 'Supermercado';
  }
}
