# Capability: price-history

## Purpose
The `price-history` capability tracks, indexes, and compares product prices across shopping sessions and supermarket chains in CestaCuenta. It empowers supermarket shoppers to make informed purchasing decisions by detecting same-store price inflation or deflation, identifying all-time best historical prices, and providing store-by-store comparison rankings directly in cart rows and scanning prompts without requiring internet connectivity or external pricing APIs.

---

## Requirements

### 1. Historical Purchase Indexing & Dual Lookup Strategy

- **1.1 Session Source & State Filtering**:
  - The indexing engine MUST extract historical purchases exclusively from completed shopping sessions (`status === 'COMPLETED'`) provided by `ShoppingSessionRepository.listHistory()`.
  - Active (`'ACTIVE'`) or discarded (`'DISCARDED'`) sessions MUST NOT be included in the historical index.
- **1.2 Observation Normalization**:
  - For each `CartItem` in a completed session, the system MUST construct a `PriceObservation` record containing:
    - `price`: Item's `unitPrice` (linear unit shelf price as `Money`).
    - `date`: Session completion timestamp `endedAt` (or `startedAt` as fallback if `endedAt` is undefined).
    - `storeName`: Session `storeName` trimmed, or `'Supermercado'` if undefined or whitespace-only.
    - `sessionId`: Associated `ShoppingSession.id`.
    - `productName`: Item `name` trimmed.
    - `barcode`: Item `barcode` trimmed, if present.
    - `isPromotional`: Boolean flag indicating whether `discount.cents > 0`.
- **1.3 Dual In-Memory Index Architecture**:
  - The domain service `StorePriceHistoryService` MUST maintain two primary in-memory hash maps:
    1. `byBarcode: Map<string, PriceObservation[]>` keyed by trimmed barcode string.
    2. `byNormalizedName: Map<string, PriceObservation[]>` keyed by normalized product name string.
  - The lookup in both maps MUST execute in $O(1)$ constant time.
- **1.4 Chronological Observation Ordering**:
  - Within each index bucket (`PriceObservation[]`), observations MUST be ordered chronologically descending (most recent observation at index 0).
- **1.5 Incremental Session Indexing**:
  - The service MUST provide an `indexSession(session: ShoppingSession)` method to append new observations from a newly completed session directly into the in-memory maps without re-reading or re-indexing the entire historical database.
- **1.6 Store Name Grouping & Normalization**:
  - The service MUST group observations by store using a normalized store key (`storeName.trim().toLowerCase()`).
  - The service MUST preserve the latest user-entered casing for display purposes in the UI.
- **1.7 Product Lookup Hierarchy**:
  - When querying price history for a product:
    1. **Primary Lookup**: If a valid barcode is supplied, the service MUST query `byBarcode`. If matching observations are found, they MUST be returned immediately.
    2. **Secondary Lookup**: If no barcode is provided, or if the barcode yields no observations, the service MUST normalize the target product name via `normalizeText(name)` and query `byNormalizedName`.
    3. If neither produces a match, the service MUST return `null`.
- **1.8 Strict Normalized Name Sanitization**:
  - Name normalization MUST strip accents/diacritics (`normalize('NFD').replace(/[\u0300-\u036f]/g, '')`), convert to lower case, replace non-alphanumeric characters with spaces, trim leading/trailing whitespace, and collapse multiple spaces into a single space.
  - Fuzzy substring matching or token-subset matching MUST NOT be used for price history lookup to prevent false positive inflation alerts across distinct product variants (e.g. whole milk vs skimmed milk).

---

### 2. Same-Store Price Trend & Delta Calculation

- **2.1 Current Store Historical Comparison**:
  - When evaluating an item with `currentPrice` at `currentStore`, the service MUST identify the most recent historical observation at the same store ($P_{prev}$) matching the normalized store key.
- **2.2 First-Time Purchase at Store**:
  - If no historical observation exists for the product at `currentStore`, the same-store delta MUST be reported as `null`.
- **2.3 Signed Price Difference Calculation**:
  - The price difference in cents MUST be computed as:
    $$\text{diffCents} = P_{curr}.\text{cents} - P_{prev}.\text{cents}$$
- **2.4 Strict `Money` Invariant Compliance**:
  - To respect the domain invariant that `Money` instances cannot hold negative values, the `PriceDelta` data contract MUST represent magnitude as a non-negative `Money` object (`absoluteDiff = Money.fromCents(Math.abs(diffCents))`) and preserve the signed direction via `TrendDirection`.
- **2.5 Trend Direction Classification**:
  - The trend direction MUST be classified as:
    - `'UP'` when $\text{diffCents} > 0$ (Price increase / Inflation alert).
    - `'DOWN'` when $\text{diffCents} < 0$ (Price drop / Savings).
    - `'EQUAL'` when $\text{diffCents} == 0$ (Identical price / Stable).
- **2.6 Percentage Change Calculation**:
  - The percentage change MUST be calculated relative to $P_{prev}$:
    $$\text{percentage} = \text{Math.round}\left(\frac{\text{diffCents}}{P_{prev}.\text{cents}} \times 1000\right) / 10$$
  - When $P_{prev}.\text{cents} == 0$, `percentage` MUST be `0.0`.
- **2.7 Localized Formatting**:
  - `formattedDiff` MUST format signed currency according to Spanish conventions:
    - `+X,XX €` for `'UP'`
    - `-X,XX €` for `'DOWN'`
    - `0,00 €` for `'EQUAL'`
  - `formattedPercent` MUST format signed percentage:
    - `+X,X %` for `'UP'`
    - `-X,X %` for `'DOWN'`
    - `0,0 %` for `'EQUAL'`

---

### 3. Cross-Store Comparison & Best Historical Price Identification

- **3.1 All-Time Best Price Detection**:
  - The service MUST inspect all historical observations across all stores for the matching product to determine the minimum recorded price:
    $$P_{best} = \min_{obs \in observations}(obs.\text{price}.\text{cents})$$
- **3.2 Current Best Price Qualification**:
  - If $P_{curr}.\text{cents} \le P_{best}$, the service MUST set `isCurrentBest = true`.
  - If $P_{curr}.\text{cents} > P_{best}$, the service MUST set `isCurrentBest = false`.
- **3.3 Potential Savings Calculation**:
  - When `isCurrentBest` is `false`, the service MUST calculate potential savings vs the historical minimum:
    $$\text{savingsCents} = P_{curr}.\text{cents} - P_{best}$$
    $$\text{potentialSavings} = \text{Money.fromCents}(\text{savingsCents})$$
  - The service MUST identify the store name and observation date associated with $P_{best}$.
- **3.4 Store-by-Store Aggregation & Ranking**:
  - The service MUST aggregate price observations across unique stores, extracting the latest observation for each store.
  - The resulting store ranking array MUST be sorted with:
    1. The `currentStore` as the first item (if recorded or present).
    2. All remaining stores sorted by latest price in ascending order (cheapest store first).
  - For each store in the ranking, the service MUST compute `diffVsCurrent`:
    $$\text{diffVsCurrentCents} = obs.\text{price}.\text{cents} - P_{curr}.\text{cents}$$
    providing the relative difference compared to what the user is currently paying.

---

### 4. Contextual Price Badges & Breakdown Presentation

- **4.1 Cart Item Price Trend Badge (`PriceTrendBadge`)**:
  - Each item card in `CartList` MUST render a `PriceTrendBadge` beside the unit price when historical data is available.
  - The badge MUST reflect one of the following prioritized states:
    1. **Inflation Alert (`▲ +0,10 €` / `+8.3%`)**: Warm red chip rendered when same-store trend is `'UP'`.
    2. **Savings / Price Drop (`▼ -0,15 €` / `-12.0%`)**: Fresh emerald green chip rendered when same-store trend is `'DOWN'`.
    3. **Best Historical Price (`★ Mejor precio`)**: Amber/gold chip rendered when `isCurrentBest` is `true` and either trend is `'EQUAL'` or no same-store history exists.
    4. **Stable Price (`= Mismo precio`)**: Neutral slate chip rendered when trend is `'EQUAL'` and price is not uniquely the historical best.
    5. **First Time at Store (`ℹ Primera vez`)**: Cyan chip rendered when the product has history at other stores, but no prior purchases exist at `currentStore`.
  - When an item has zero historical purchases across all stores, the badge MUST NOT render, keeping cart cards clean and uncluttered.
- **4.2 Badge Ergonomics & Accessibility**:
  - The badge element MUST have a minimum interactive touch target dimension of 48px or be nested inside a touch target meeting mobile accessibility guidelines.
  - The badge MUST include an explicit `aria-label` describing the full context in Spanish (e.g., *"Precio 0,10 € más caro que la última vez en este supermercado"*).
- **4.3 Product Price History Modal (`ProductPriceHistoryModal`)**:
  - Tapping any `PriceTrendBadge` in `CartList` MUST open the `ProductPriceHistoryModal`.
  - The modal MUST present:
    1. **Header Section**: Product name, barcode (if present), current store, and current unit price with same-store delta.
    2. **Savings Banner**: When cheaper at another store, a highlighted banner stating the best price, store name, and potential savings.
    3. **Store Comparison Table**: A table of all stores with columns for *Establecimiento*, *Último precio*, *Fecha*, and *Diferencia*.
    4. **Price Evolution Timeline**: A chronological list of past purchases at the current store showing date, price, and whether a promotional discount was applied.
  - The modal MUST support keyboard dismissal (`Escape`) and accessible backdrop tap to close.
- **4.4 Scanner Price Prompt Modal (`ScanPricePromptModal`) Integration**:
  - When scanning a barcode, `ScanPricePromptModal` MUST display the last recorded price at the current store if available (e.g., *"Última vez en Mercadona: 1,15 € (hace 10 días)"*).
  - As the user modifies the price in the input field, the modal MUST render a dynamic live difference chip showing immediate inflation/savings feedback relative to the previous purchase.
  - If the product was historically cheaper at another supermarket, the modal MUST display a best-price hint (e.g., *"Mínimo histórico: 1,05 € en Carrefour"*).
- **4.5 Price Edit Modal (`EditPriceModal`) Integration**:
  - When editing the unit price of an existing cart item, `EditPriceModal` MUST render the last purchase price at the current store and a dynamic live difference indicator updating on every keystroke.

---

### 5. Edge Cases & Robustness

- **5.1 Zero Previous Purchases (Cold Start)**:
  - If a product has never been recorded in completed sessions, all history methods MUST return `null` or empty lists without throwing runtime exceptions.
  - UI components MUST cleanly suppress trend chips.
- **5.2 Identical Current and Previous Price**:
  - When $P_{curr}.\text{cents} == P_{prev}.\text{cents}$, $\text{diffCents}$ MUST be `0`, `percentage` MUST be `0.0`, and direction MUST be `'EQUAL'`.
- **5.3 Single Store Session History**:
  - When all historical sessions are from the current store, cross-store comparison tables MUST cleanly display the single store without errors or empty state crashes.
- **5.4 Non-Barcode Items (Produce / Bulk / Bakery)**:
  - Items without barcodes MUST be matched via normalized product name.
  - Case differences (`"PLÁTANOS DE CANARIAS"` vs `"Plátanos de Canarias"`), diacritics (`"café"` vs `"cafe"`), and surrounding punctuation MUST resolve to the identical product history bucket.
- **5.5 Store Name Variations**:
  - Variations in store name casing or trailing spaces (e.g. `"Mercadona"`, `"mercadona "`, `"MERCADONA"`) MUST map to the same store bucket.
  - Undefined, null, or blank store names MUST be normalized to `"Supermercado"`.
- **5.6 Promotional Purchases**:
  - If an item in historical sessions had `discount.cents > 0`, its base observation price MUST remain its `unitPrice`, with `isPromotional = true` recorded so the history timeline can annotate *"Descuento aplicado"*.

---

## Scenarios

### Scenario 1: Indexing Completed Shopping Sessions on Initialization
- **Given** a `ShoppingSessionRepository` containing 2 completed sessions and 1 active session:
  - Session 1 (Completed, store `"Mercadona"`, date `2026-09-15`):
    - Item A: barcode `"8410000001"`, name `"Leche Entera 1L"`, price `0,95 €`
  - Session 2 (Completed, store `"Carrefour"`, date `2026-09-20`):
    - Item A: barcode `"8410000001"`, name `"Leche Entera 1L"`, price `0,90 €`
  - Session 3 (Active, store `"Dia"`):
    - Item A: barcode `"8410000001"`, name `"Leche Entera 1L"`, price `1,05 €`
- **When** `StorePriceHistoryService` is initialized with the repository history
- **Then** `byBarcode.get("8410000001")` MUST contain exactly 2 observations (from Sessions 1 and 2)
- **And** observations from Session 3 MUST NOT be included
- **And** the observations MUST be sorted chronologically descending: `2026-09-20` (Carrefour) followed by `2026-09-15` (Mercadona).

---

### Scenario 2: Incremental Indexing When Session Completes
- **Given** an initialized `StorePriceHistoryService` with existing historical observations
- **When** the active shopping session is completed and `indexSession(completedSession)` is invoked
- **Then** the items from `completedSession` MUST be immediately added to `byBarcode` and `byNormalizedName`
- **And** the service MUST NOT reload or re-query `ShoppingSessionRepository.listHistory()`
- **And** subsequent queries for those items MUST immediately reflect the newly completed session data.

---

### Scenario 3: Calculating Same-Store Price Inflation (UP)
- **Given** a historical observation for barcode `"8410000001"` at store `"Mercadona"` with price `1,00 €` on `2026-09-10`
- **When** comparing a current item with barcode `"8410000001"`, current price `1,15 €`, and store `"Mercadona"`
- **Then** `sameStoreDelta` MUST NOT be `null`
- **And** `sameStoreDelta.diffCents` MUST be `15`
- **And** `sameStoreDelta.direction` MUST be `'UP'`
- **And** `sameStoreDelta.percentage` MUST be `15.0`
- **And** `sameStoreDelta.formattedDiff` MUST be `"+0,15 €"`
- **And** `sameStoreDelta.formattedPercent` MUST be `"+15,0 %"`.

---

### Scenario 4: Calculating Same-Store Price Savings (DOWN)
- **Given** a historical observation for barcode `"8410000002"` at store `"Lidl"` with price `2,50 €` on `2026-09-01`
- **When** comparing a current item with barcode `"8410000002"`, current price `2,20 €`, and store `"Lidl"`
- **Then** `sameStoreDelta` MUST NOT be `null`
- **And** `sameStoreDelta.diffCents` MUST be `-30`
- **And** `sameStoreDelta.direction` MUST be `'DOWN'`
- **And** `sameStoreDelta.percentage` MUST be `-12.0`
- **And** `sameStoreDelta.absoluteDiff.cents` MUST be `30`
- **And** `sameStoreDelta.formattedDiff` MUST be `"-0,30 €"`
- **And** `sameStoreDelta.formattedPercent` MUST be `"-12,0 %"`.

---

### Scenario 5: Stable Price at Same Store (EQUAL)
- **Given** a historical observation for barcode `"8410000003"` at store `"Dia"` with price `1,50 €`
- **When** comparing a current item with barcode `"8410000003"`, current price `1,50 €`, and store `"Dia"`
- **Then** `sameStoreDelta.diffCents` MUST be `0`
- **And** `sameStoreDelta.direction` MUST be `'EQUAL'`
- **And** `sameStoreDelta.percentage` MUST be `0.0`
- **And** `sameStoreDelta.formattedDiff` MUST be `"0,00 €"`
- **And** `sameStoreDelta.formattedPercent` MUST be `"0,0 %"`.

---

### Scenario 6: First Purchase of Product at Current Store (Present at Other Stores)
- **Given** historical observations for barcode `"8410000004"` exist only at `"Carrefour"` (`1,80 €`) and `"Alcampo"` (`1,75 €`)
- **When** evaluating an item with barcode `"8410000004"`, current price `1,90 €`, and current store `"Mercadona"`
- **Then** `sameStoreDelta` MUST be `null`
- **And** `isCurrentBest` MUST be `false`
- **And** `bestPrice.storeName` MUST be `"Alcampo"` with price `1,75 €`
- **And** `potentialSavings.cents` MUST be `15` (`0,15 €`)
- **And** the UI trend badge for this item MUST display the `"FIRST_VISIT"` variant (`ℹ Primera vez`).

---

### Scenario 7: Product with No Historical Purchases Anywhere (Cold Start)
- **Given** a newly scanned item with barcode `"8499999999"` and name `"Nuevo Producto"`
- **When** `comparePrice` is called for this item
- **Then** the method MUST return `null`
- **And** `PriceTrendBadge` rendered for this item MUST render nothing (`null`).

---

### Scenario 8: Fallback Lookup for Non-Barcode Item Using Diacritic-Insensitive Normalized Name
- **Given** a completed session at `"Mercadona"` containing a bulk produce item without barcode:
  - Name: `"Plátano de Canarias"`
  - Unit Price: `1,99 €`
- **When** evaluating an item in the active session at `"Mercadona"` with:
  - No barcode
  - Name: `"platano  de   canarias "` (different casing, missing accent, erratic whitespace)
  - Unit Price: `2,19 €`
- **Then** the service MUST match the item via `byNormalizedName`
- **And** `sameStoreDelta.diffCents` MUST be `20`
- **And** `sameStoreDelta.direction` MUST be `'UP'`
- **And** `sameStoreDelta.formattedDiff` MUST be `"+0,20 €"`.

---

### Scenario 9: Store Name Normalization with Different Casings and Trailing Spaces
- **Given** a completed session at store `"mercadona  "` with price `1,00 €` for item `"Pan de Molde"`
- **When** evaluating an item with name `"Pan de Molde"` at store `"  MERCADONA "` with price `1,10 €`
- **Then** the service MUST identify both as the same store
- **And** `sameStoreDelta.diffCents` MUST be `10`
- **And** `sameStoreDelta.direction` MUST be `'UP'`.

---

### Scenario 10: Cross-Store Comparison and Identification of Historical Best Price
- **Given** historical observations for an item:
  - Store `"Carrefour"`: `1,20 €` on `2026-08-01`
  - Store `"Lidl"`: `1,10 €` on `2026-08-15`
  - Store `"Mercadona"`: `1,30 €` on `2026-09-01`
- **When** evaluating the item at current store `"Mercadona"` with current price `1,05 €`
- **Then** `isCurrentBest` MUST be `true`
- **And** `potentialSavings` MUST be `Money.zero()`
- **And** the store ranking list MUST list:
  1. `"Mercadona"` (current store, current price `1,05 €`)
  2. `"Lidl"` (latest historical price `1,10 €`, `diffVsCurrent: +0,05 €`)
  3. `"Carrefour"` (latest historical price `1,20 €`, `diffVsCurrent: +0,15 €`).

---

### Scenario 11: Rendering PriceTrendBadge in Cart Item and Opening History Modal
- **Given** an item in `CartList` has an inflation delta (`▲ +0,25 €`, `+12.5%`)
- **When** the item row is rendered in the cart
- **Then** the `PriceTrendBadge` MUST display `"▲ +0,25 €"` with red alert styling
- **And** the badge MUST have `aria-label="Precio 0,25 € más caro que la última vez en este supermercado"`
- **When** the user taps the badge
- **Then** `ProductPriceHistoryModal` MUST open displaying the store comparison ranking and chronological timeline for this item.

---

### Scenario 12: Real-Time Dynamic Price Delta Feedback in ScanPricePromptModal
- **Given** the user scans a barcode whose previous price at `"Mercadona"` was `1,50 €`
- **When** `ScanPricePromptModal` opens
- **Then** the modal MUST display a banner: `"Última vez en Mercadona: 1,50 €"`
- **When** the user changes the price input to `1,70 €`
- **Then** a dynamic chip MUST immediately display `"▲ +0,20 € (+13,3%) vs anterior"` in red
- **When** the user adjusts the price input to `1,40 €`
- **Then** the dynamic chip MUST immediately change to `"▼ -0,10 € (-6,7%) vs anterior"` in emerald green.

---

### Scenario 13: Live Price Delta Feedback in EditPriceModal
- **Given** a cart item currently priced at `3,00 €` with a previous purchase price of `2,80 €` at the current store
- **When** the user taps the unit price to open `EditPriceModal`
- **Then** the modal MUST show previous purchase context: `"Última vez en esta tienda: 2,80 €"`
- **When** the user edits the input to `2,50 €`
- **Then** the live feedback chip MUST display `"▼ -0,30 € (-10,7%)"`
- **When** the user clicks "Guardar"
- **Then** the item's unit price in `ShoppingSession` MUST update and the cart row trend badge MUST refresh.

---

### Scenario 14: Handling Promotional Discount Flag in History Timeline
- **Given** a historical session item had `unitPrice = 2,00 €`, `quantity = 2`, and `discount = 1,00 €` (promo applied)
- **When** the observation is indexed and viewed in `ProductPriceHistoryModal`
- **Then** the recorded observation price MUST be `2,00 €`
- **And** `isPromotional` MUST be `true`
- **And** the history timeline entry MUST display a visual badge: `"Promo aplicada"`.

---

## Data Contracts & Type Definitions

### 1. `PriceObservation.ts` (Domain Entity / Value Types)

```typescript
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
  readonly diffVsCurrent?: PriceDelta;   // Difference relative to current store's price
  readonly isCheapest: boolean;
}

export interface ProductPriceComparisonResult {
  readonly productName: string;
  readonly barcode?: string;
  readonly currentStore: string;
  readonly currentPrice: Money;
  readonly sameStoreDelta: PriceDelta | null; // null if first time at current store
  readonly bestHistoricalObservation: PriceObservation;
  readonly isCurrentBest: boolean;
  readonly potentialSavings: Money;      // zero if isCurrentBest is true
  readonly storeComparisons: StorePriceComparison[];
  readonly sameStoreObservations: PriceObservation[]; // Chronological list at current store
}

export interface ProductPriceHistory {
  readonly observations: PriceObservation[];
  readonly latestObservation: PriceObservation;
  readonly bestObservation: PriceObservation;
}
```

---

### 2. `StorePriceHistoryService.ts` (Domain Service Contract)

```typescript
import { Money } from '../value-objects/Money.js';
import { ShoppingSession } from '../entities/ShoppingSession.js';
import {
  PriceObservation,
  PriceDelta,
  ProductPriceComparisonResult,
  ProductPriceHistory,
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
  /**
   * Initializes the service and builds in-memory indexes from completed sessions.
   */
  constructor(sessions?: ShoppingSession[]);

  /**
   * Replaces all internal index maps with observations from the provided completed sessions.
   */
  buildIndex(sessions: ShoppingSession[]): void;

  /**
   * Incrementally indexes items from a newly completed session into existing maps.
   */
  indexSession(session: ShoppingSession): void;

  /**
   * Retrieves all historical observations for a product matching barcode or normalized name.
   * Returns null if no observations exist.
   */
  getHistory(params: QueryHistoryParams): ProductPriceHistory | null;

  /**
   * Computes same-store price delta, cross-store comparisons, and historical best price.
   * Returns null if no historical observations exist anywhere for this product.
   */
  comparePrice(params: ComparePriceParams): ProductPriceComparisonResult | null;

  /**
   * Computes a signed PriceDelta between two Money values.
   */
  static computeDelta(currentPrice: Money, previousPrice: Money): PriceDelta;

  /**
   * Retrieves the most recent price observation at a specific store.
   */
  getLastPriceAtStore(params: { storeName?: string; barcode?: string; name: string }): PriceObservation | null;

  /**
   * Retrieves the lowest price observation recorded across all stores.
   */
  getBestPrice(params: QueryHistoryParams): PriceObservation | null;
}
```

---

### 3. UI Component Props Contracts

#### `PriceTrendBadge.tsx`
```typescript
import { ProductPriceComparisonResult } from '../../domain/entities/PriceObservation.js';

export interface PriceTrendBadgeProps {
  readonly comparison: ProductPriceComparisonResult | null;
  readonly onClick?: () => void;
  readonly className?: string;
}
```

#### `ProductPriceHistoryModal.tsx`
```typescript
import { ProductPriceComparisonResult } from '../../domain/entities/PriceObservation.js';

export interface ProductPriceHistoryModalProps {
  readonly isOpen: boolean;
  readonly comparison: ProductPriceComparisonResult | null;
  readonly onClose: () => void;
}
```

---

## Non-Functional & Quality Requirements

- **Domain Isolation (Clean Architecture)**:
  - `StorePriceHistoryService` and `PriceObservation` MUST remain 100% pure TypeScript domain entities/services without dependencies on React, browser DOM APIs (`window`, `document`), or persistence drivers.
- **Zero Storage Migrations**:
  - The feature MUST operate as an in-memory projection derived from `ShoppingSessionRepository.listHistory()` without creating secondary tables in SQLite or separate `localStorage` keys, ensuring zero migration risks for existing users.
- **Constant-Time Lookup Performance**:
  - In-memory lookups via `byBarcode` and `byNormalizedName` MUST execute in $O(1)$ time (< 0.1ms per item), ensuring smooth 60fps scrolling and real-time keystroke responsiveness in cart and price inputs.
- **Domain Invariant Preservation**:
  - All price computations MUST preserve `Money` class constraints. Negative cent values MUST NEVER be passed to `Money.fromCents` or `new Money()`.
- **Accessibility Standards**:
  - All interactive badges and modals MUST adhere to WCAG 2.1 Level AA standards:
    - Minimum touch targets of 48px $\times$ 48px or compliant container padding.
    - Color alone MUST NOT be the only indicator of price direction (icons `▲`, `▼`, `=`, `★`, `ℹ` MUST accompany color coding).
    - Descriptive `aria-label` attributes MUST provide screen readers with complete textual context.
    - Modals MUST trap focus, close on `Escape` key, and restore focus upon dismissal.
- **Offline First**:
  - All indexing, delta calculations, and comparisons MUST execute 100% locally on device with zero network dependencies.
