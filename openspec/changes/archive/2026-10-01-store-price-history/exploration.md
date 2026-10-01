# Exploration: store-price-history

## Exploration: Store-by-Store Price History and Price Comparison

### Current State
CestaCuenta currently records shopping sessions and product prices through several decoupled domain entities and repositories:
- **`ShoppingSession` aggregate root (`src/domain/entities/ShoppingSession.ts`)**:
  - Captures `storeName?: string` (defaults to `"Mi Supermercado"` or edited by the user in `Header.tsx`).
  - Records `startedAt: Date` and `endedAt?: Date` (populated when the user completes the session via `complete()`).
  - Contains a collection of `CartItem` entities representing the purchased items.
  - Transitions through statuses: `'ACTIVE' | 'COMPLETED' | 'DISCARDED'`.
- **`CartItem` entity (`src/domain/entities/CartItem.ts`)**:
  - Tracks `barcode?: string`, `name: string`, `unitPrice: Money`, `quantity: number`, `isBulk: boolean`, and `discount: Money`.
  - Computes `subtotal(): Money = Math.max(0, (unitPrice.cents * quantity) - discount.cents)`.
- **`ProductReference` entity (`src/domain/entities/ProductReference.ts`)**:
  - Maintained in `ProductCatalogRepository` as a fast local cache of scanned items (`barcode`, `name`, `lastPrice: Money`, `updatedAt: Date`).
  - **Limitation**: `ProductReference` stores only a single global price per barcode with *no store context* and *no historical log of past prices*.
- **`ShoppingSessionRepository` (`src/domain/repositories/ShoppingSessionRepository.ts`)**:
  - Implemented for web via `LocalStorageShoppingSessionRepository` (`src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts`) and SQLite via `SqliteShoppingSessionRepository` (`src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts`).
  - Provides `listHistory(limit?: number, offset?: number)` which returns all completed and discarded sessions.
  - In `LocalStorageShoppingSessionRepository`, past completed purchases are serialized into `cestacuenta_history` in browser `localStorage`.
- **`ProductLookupService` (`src/domain/services/ProductLookupService.ts`)**:
  - Queries local catalog by barcode, then falls back to Open Food Facts API and scale barcode parsing.
  - Suggests `lastPrice` from the global catalog, but has no store-awareness (e.g., cannot suggest the price last seen at the specific store the user is currently visiting).
- **UI Components (`src/ui/components/`)**:
  - `ScanPricePromptModal.tsx`: When a barcode is scanned, prompts the user to verify/enter the shelf price. Shows provenance badges (`Catálogo local`, `Open Food Facts`, `Balanza`), but provides zero historical store context, no comparison with previous visits, and no inflation indicator when the user enters a higher price.
  - `CartList.tsx`: Displays items with unit price, quantity controls, and subtotal. Tapping the unit price triggers `EditPriceModal`. No trend badges, savings indicators, or store price comparisons are shown.
  - `EditPriceModal.tsx`: Allows modifying unit price in-place, without showing previous store prices or price change deltas.
  - `HistoryModal.tsx`: Lists past sessions with expandable line-item breakdowns and CSV export, but does not provide product-level price tracking across stores.

---

### Affected Areas

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Domain Layer                              │
│                                                                        │
│  ┌──────────────────────────────────┐  ┌────────────────────────────┐  │
│  │    StorePriceHistoryService      │  │    ProductLookupService    │  │
│  │    (Indexing, Trends, Deltas)    │  │    (Store-aware lookup)    │  │
│  └──────────────────────────────────┘  └────────────────────────────┘  │
│                   ▲                                                    │
└───────────────────┼────────────────────────────────────────────────────┘
                    │
┌───────────────────┼────────────────────────────────────────────────────┐
│                   │              UI Layer                              │
│  ┌────────────────┴─────────────────┐  ┌────────────────────────────┐  │
│  │           App.tsx                │  │    PriceTrendBadge         │  │
│  │   (Index state & orchestration)  │  │    (▲/▼/★ micro-badges)    │  │
│  └────────┬──────────────────────┬──┘  └─────────────┬──────────────┘  │
│           │                      │                   │                 │
│           ▼                      ▼                   ▼                 │
│  ┌──────────────────┐  ┌───────────────────┐  ┌─────────────────────┐  │
│  │     CartList     │  │ScanPricePrompt    │  │ProductPriceHistory  │  │
│  │  (Trend badges)  │  │Modal (Inflation)  │  │Modal (Breakdown)    │  │
│  └──────────────────┘  └───────────────────┘  └─────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Domain Layer (`src/domain/`)**:
   - `src/domain/entities/PriceObservation.ts` *(new)*:
     - Pure domain data structures representing a historical price point: `PriceObservation`, `PriceTrend`, `PriceDelta`, `StorePriceComparison`, and `ProductPriceHistory`.
   - `src/domain/services/StorePriceHistoryService.ts` *(new)*:
     - Pure domain service that aggregates and indexes past sessions from `ShoppingSessionRepository.listHistory()`.
     - Indexes price points by barcode (primary) and normalized product name (secondary fallback).
     - Computes same-store inflation/deflation deltas ($\Delta_{cents}$ and $\Delta_{\%}$).
     - Calculates best historical price across all stores and identifies savings opportunities.
     - Produces store-by-store comparison rankings.
   - `src/domain/services/ProductLookupService.ts`:
     - Optional extension to accept `currentStore?: string` and suggest store-specific historical prices when available, improving shelf price entry speed.
   - `src/domain/index.ts`:
     - Export new types, entities, and services.

2. **UI Layer (`src/ui/`)**:
   - `src/ui/components/PriceTrendBadge.tsx` *(new)*:
     - Compact visual indicator chip displayed on cart item rows and scanner modals.
     - Displays price changes:
       - **Inflation** (`▲ +0,10 €` / `+8.3%`, warm red badge).
       - **Savings / Discount** (`▼ -0,15 €` / `-12.0%`, fresh emerald badge).
       - **Equal** (`= Mismo precio`, subtle neutral slate badge).
       - **Best Historical Price** (`★ Mejor precio`, amber/gold badge).
       - **First Time at Store** (`ℹ Primera vez`, cyan badge).
     - Fully accessible with descriptive `aria-label`s and screen-reader context.
   - `src/ui/components/ProductPriceHistoryModal.tsx` *(new)*:
     - Modal sheet showing a detailed store-by-store breakdown for a specific product when the user taps a trend badge.
     - Displays:
       1. Store comparison table (latest price at Mercadona, Carrefour, Lidl, Dia, etc., with date).
       2. Inflation timeline at the current store (chronological price evolution).
       3. Potential savings vs best historical store.
   - `src/ui/components/ScanPricePromptModal.tsx`:
     - Integrates historical context when scanning a barcode:
       - Displays previous price at this store (e.g., *"Última vez en Mercadona: 1,15 € el 18 sep"*).
       - As user enters a price, dynamically shows live inflation/savings feedback.
       - Displays cross-store best price chip (e.g., *"Mejor precio: 1,05 € en Carrefour"*).
   - `src/ui/components/CartList.tsx`:
     - Renders `PriceTrendBadge` in the item header next to the unit price.
     - Tapping the badge opens `ProductPriceHistoryModal`.
   - `src/ui/components/EditPriceModal.tsx`:
     - Shows the same-store historical price and difference indicator as the user adjusts the unit price.
   - `src/ui/App.tsx`:
     - Instantiates `StorePriceHistoryService` and builds the index from repository history.
     - Updates/re-indexes when an active session is completed via `handleConfirmFinish`.
     - Passes historical comparison data to `CartList`, `ScanPricePromptModal`, and `EditPriceModal`.
   - `src/ui/styles.css`:
     - CSS styles for `PriceTrendBadge` variants, price difference chips, store comparison tables, and modal animations.

3. **Testing Suite (`tests/`)**:
   - `tests/domain/StorePriceHistoryService.test.ts` *(new)*:
     - Unit tests verifying indexing, multi-store aggregation, barcode vs name matching, same-store inflation delta calculation, all-store best price identification, date sorting, and edge cases (no history, identical prices, negative deltas).
   - `tests/ui/PriceTrendBadge.test.tsx` *(new)*:
     - Component unit tests for rendering badges, color schemes, and accessibility attributes.
   - `tests/ui/ProductPriceHistoryModal.test.tsx` *(new)*:
     - Component unit tests for modal rendering, store rankings, and keyboard navigation.
   - Regression tests for `CartList.test.tsx`, `ScanPricePromptModal.test.tsx`, and `EditPriceModal.test.tsx`.

---

### Technical Investigation

#### 1. Historical Lookup Service & Aggregation Strategy
CestaCuenta stores completed shopping sessions in `ShoppingSessionRepository.listHistory()`. Each session has:
- `storeName?: string`
- `endedAt?: Date` (or `startedAt: Date` as fallback)
- `items: CartItem[]` with `barcode?: string`, `name: string`, `unitPrice: Money`

To aggregate past purchases reliably:
1. **Product Identification Hierarchy**:
   - **Priority 1 (Exact Barcode Match)**: When `barcode` is available and matches `targetBarcode`, this guarantees 100% exact product identity across sessions.
   - **Priority 2 (Exact Normalized Name Match)**: For items without barcode (e.g. bulk produce, bakery, shelf-tag OCR items), match using `normalizeText(name)` from `ShoppingListMatcherService` (lowercased, diacritics stripped, non-alphanumeric removed, whitespace collapsed).
   - *Why avoid loose fuzzy/word-subset matching for price comparison?* Fuzzy matching can mistake "Leche Desnatada 1L" for "Leche Entera 1L" or "Tomate Frito 400g" for "Tomate Triturado 800g", which would present misleading inflation alerts. Exact normalized matching prevents false positives.
2. **Store Normalization**:
   - Store names entered by users can have minor casing or trailing space differences (e.g., `"Mercadona"`, `"mercadona "`, `"MERCADONA"`).
   - Normalize store names via `storeName.trim().toLowerCase()` for grouping while preserving the original user-facing casing for display.
   - Default fallback: If `storeName` is blank or undefined, label as `"Supermercado"`.
3. **Data Representation**:
   ```typescript
   export interface PriceObservation {
     price: Money;
     date: Date;
     storeName: string;
     sessionId: string;
     productName: string;
     barcode?: string;
   }
   ```

#### 2. Price Trends & Difference Calculations
The `Money` value object (`src/domain/value-objects/Money.ts`) strictly enforces non-negative cents:
```typescript
if (typeof cents !== 'number' || !Number.isInteger(cents) || cents < 0) {
  throw new Error(`Invalid cents amount: ${cents}. Cents must be a non-negative integer.`);
}
```
Furthermore, `Money.subtract` throws when the result is negative. Therefore, price deltas cannot be represented as simple `Money` objects without separating magnitude and sign.

We define a dedicated pure domain structure:
```typescript
export type TrendDirection = 'UP' | 'DOWN' | 'EQUAL';

export interface PriceDelta {
  diffCents: number;            // Signed integer (e.g. +10, -15, 0)
  absoluteDiff: Money;          // Positive Money instance for formatting
  percentage: number;           // e.g. +8.3, -12.5, 0.0
  direction: TrendDirection;    // 'UP' (inflation), 'DOWN' (savings), 'EQUAL'
  formattedDiff: string;        // "+0,10 €" or "-0,15 €" or "0,00 €"
  formattedPercent: string;     // "+8,3 %" or "-12,5 %" or "0,0 %"
}
```

Calculations:
- **Same-Store Comparison**:
  1. Retrieve all previous observations for this product at `currentStore`, sorted chronologically descending.
  2. The most recent previous observation is $P_{prev}$.
  3. $\text{diffCents} = P_{curr}.\text{cents} - P_{prev}.\text{cents}$.
  4. $\text{percentage} = \text{round}\left(\frac{\text{diffCents}}{P_{prev}.\text{cents}} \times 100, 1\right)$.
  5. Direction:
     - $\text{diffCents} > 0 \implies \text{UP}$ (Inflation alert).
     - $\text{diffCents} < 0 \implies \text{DOWN}$ (Savings / Discount).
     - $\text{diffCents} == 0 \implies \text{EQUAL}$ (Stable price).
- **Cross-Store Best Historical Price**:
  1. Find minimum price across all historical observations:
     $P_{best} = \min_{obs \in observations}(obs.\text{price}.\text{cents})$.
  2. If $P_{curr}.\text{cents} \le P_{best}$:
     - Current price is the best price ever recorded (or tied with the best).
     - Mark `isCurrentBest = true`.
  3. If $P_{curr}.\text{cents} > P_{best}$:
     - Mark `isCurrentBest = false`.
     - Compute potential savings: $P_{curr}.\text{cents} - P_{best}$.
     - Identify store and date where best price was observed (e.g. *"1,05 € en Carrefour hace 2 sem"*).
- **Store-by-Store Ranking**:
  - Group observations by store.
  - For each store, pick the latest recorded observation.
  - Sort stores: current store first, then remaining stores by price ascending (cheapest first).

#### 3. UI Presentation & Ergonomics
In-store grocery shopping has critical UX constraints: users hold a shopping basket/cart in one hand and their phone in the other. Information must be clear at a glance without cluttering the screen or requiring excessive tapping.

1. **`ScanPricePromptModal` Flow**:
   - When the modal opens for a scanned barcode, query `StorePriceHistoryService`:
     - If the item was previously bought at this store, display a helpful context banner:
       *"Última compra en Mercadona: 1,15 € (hace 10 días)"*.
     - As the user types or adjusts the price, an interactive live chip updates in real time:
       - Entering `1,25 €` $\rightarrow$ `▲ +0,10 € (+8,7%) vs anterior` (red).
       - Entering `1,10 €` $\rightarrow$ `▼ -0,05 € (-4,3%) vs anterior` (green).
     - If cheaper elsewhere: *"Mínimo histórico: 1,05 € en Carrefour"*.
   - Option to tap a "Ver comparativa" link to open the breakdown sheet.
2. **`CartList` Item Card Integration**:
   - Each item row currently displays:
     ```
     [Name] [Bulk badge] [Barcode badge]
     [1,20 € / ud] ✎
     ```
   - Enhanced item row:
     ```
     [Name] [Bulk badge] [Barcode badge]
     [1,20 € / ud] ✎   [▲ +0,05 €] [★ Mínimo]
     ```
   - Micro-badges:
     - `PriceTrendBadge`:
       - `▲ +0,05 €` with red pill for inflation.
       - `▼ -0,10 €` with green pill for savings.
       - `★ Mínimo` with amber pill when price matches the historical best.
     - Tapping the badge opens `ProductPriceHistoryModal`.
3. **`ProductPriceHistoryModal` Sheet**:
   - Title: Product name & barcode.
   - Header summary: Current store & price vs previous purchase delta.
   - Comparison Table:
     | Establecimiento | Último Precio | Fecha | Dif. vs Actual |
     | :--- | :--- | :--- | :--- |
     | **Mercadona (actual)** | **1,20 €** | **Hoy** | — |
     | **Carrefour** | 1,05 € | hace 2 sem | -0,15 € (Ahorro) |
     | **Lidl** | 1,15 € | hace 1 mes | -0,05 € (Ahorro) |
     | **Dia** | 1,25 € | hace 2 meses | +0,05 € |
   - Timeline of same-store evolution: list of historical purchases at the current store showing inflation trajectory over time.
4. **`EditPriceModal` Integration**:
   - As the user changes the unit price, show the live difference vs the previous purchase at this store.

#### 4. Performance & Caching Considerations
- **The Problem**: A user may have 50-100 historical shopping sessions in `localStorage` or SQLite, with 20-40 items each (1,000-4,000 items total). If `CartList` re-scans all past sessions on every component render, keystroke, or quantity click, UI thread stuttering and frame drops will occur.
- **The Solution**: An in-memory indexed domain service `StorePriceHistoryService`:
  - When initialized, iterates through `history` once and builds two high-speed `Map` indexes:
    - `byBarcode: Map<string, PriceObservation[]>`
    - `byNormalizedName: Map<string, PriceObservation[]>`
  - Lookups for any item in `CartList` or `ScanPricePromptModal` take $O(1)$ constant time.
  - Updates: When a session is completed (`handleConfirmFinish`), the service updates its in-memory index with the new session's items without needing to reload or re-parse the entire history.
  - Memory usage: 4,000 lightweight observation objects consume $< 200 \text{ KB}$ of memory, completely negligible for modern mobile browsers.

---

### Approaches

#### Approach 1: On-Demand History Queries in React Components (No Indexing)
- **Concept**: Query `sessionRepository.listHistory()` directly inside `CartList` or `useEffect` whenever an item renders or modal opens.
- **Pros**:
  - No separate indexing service to maintain.
- **Cons**:
  - Severe performance bottleneck: $O(N \times S)$ where $N$ is cart items and $S$ is history sessions.
  - Unnecessary JSON deserialization on every cart update.
  - Code duplication across `CartList`, `ScanPricePromptModal`, and `EditPriceModal`.

#### Approach 2: Persistent Secondary Database Table for Price History
- **Concept**: Create a dedicated table in SQLite (`store_product_prices`) and secondary `localStorage` key (`cestacuenta_store_prices`) updated on every purchase.
- **Pros**:
  - Direct SQL queries with `GROUP BY store_name`.
- **Cons**:
  - Synchronization overhead: risk of divergence between session history and the price table if a session is edited, deleted, or cleared.
  - Requires migration scripts for existing user databases.
  - Adds schema complexity to both web (LocalStorage) and SQLite repository implementations.

#### Approach 3: In-Memory Domain Aggregator Service with Reactive Hook (Recommended)
- **Concept**:
  1. A pure domain service `StorePriceHistoryService` that receives history sessions and constructs fast indexed lookup maps (`byBarcode` and `byNormalizedName`).
  2. Initialized once at app startup in `App.tsx` (or via a custom React hook `useStorePriceHistory`).
  3. Incrementally updated when a session is finalized (`handleConfirmFinish`).
  4. Provides instantaneous $O(1)$ lookups for cart rows, scanner modals, and price editing modals.
- **Pros**:
  - **Zero storage schema migration**: Works seamlessly with existing data in both `LocalStorageShoppingSessionRepository` and `SqliteShoppingSessionRepository`.
  - **Maximum UI performance**: Sub-millisecond $O(1)$ lookups ensure 60fps responsiveness during cart interaction and typing.
  - **Single Source of Truth**: Session history remains the canonical data source; the index is a lightweight projection that cannot drift.
  - **Clean Architecture**: Pure domain service with 100% testability independent of browser or database mocks.
- **Cons**:
  - In-memory index must be rebuilt on application startup (takes $< 5 \text{ ms}$ for typical grocery history).

---

### Recommendation

Adopt **Approach 3**:
1. **Domain Layer**:
   - Create `src/domain/entities/PriceObservation.ts` defining data types (`PriceObservation`, `PriceDelta`, `ProductPriceHistory`, `StorePriceComparison`).
   - Create `src/domain/services/StorePriceHistoryService.ts` containing the in-memory index builder, same-store inflation delta calculation, cross-store best price detection, and store ranking logic.
   - Update `src/domain/index.ts` to export these new capabilities.
2. **UI Layer**:
   - Create `src/ui/components/PriceTrendBadge.tsx` for micro-trend chips on cart items.
   - Create `src/ui/components/ProductPriceHistoryModal.tsx` for detailed store comparisons and inflation timelines.
   - Integrate comparison chips and dynamic feedback into `ScanPricePromptModal.tsx` and `EditPriceModal.tsx`.
   - Update `CartList.tsx` to render `PriceTrendBadge` and wire click-to-view history.
   - Wire `StorePriceHistoryService` in `App.tsx`, hydrating on startup and updating upon session completion.
   - Add styles to `src/ui/styles.css` adhering to CestaCuenta design tokens and mobile touch target guidelines (min 48px interactive areas).
3. **Testing**:
   - Write comprehensive unit tests in `tests/domain/StorePriceHistoryService.test.ts` covering all edge cases.
   - Write UI component tests for `PriceTrendBadge.test.tsx` and `ProductPriceHistoryModal.test.tsx`.

---

### Risks

1. **Store Name Variations & Typos**: Users might enter `"Mercadona"`, `"mercadona"`, or `"Mercadona Centro"`.
   - *Mitigation*: Normalize store names using trimmed lowercase for grouping and matching, while preserving the user's latest casing for UI display. Provide store name auto-suggestions based on past session store names in `Header.tsx`.
2. **Missing Barcode on Manual or Scale Items**: Fresh produce, bakery, and manual entries lack standardized EAN barcodes.
   - *Mitigation*: Fall back to normalized product name matching using `normalizeText()` with Spanish diacritics stripping. If neither barcode nor normalized name matches, gracefully display no comparison.
3. **`Money` Non-Negative Constraint**: Price differences can be negative when a product is cheaper than in the past, but `Money` throws if initialized with negative cents.
   - *Mitigation*: Structure `PriceDelta` with a signed integer `diffCents`, an absolute `Money` instance for rendering, and an explicit `direction: 'UP' | 'DOWN' | 'EQUAL'`.
4. **Promotion and Multi-Buy Distortions**: Special discounts (e.g. 2nd unit -50%) could skew unit price history if not recorded properly.
   - *Mitigation*: Base history on `unitPrice` (linear shelf price). If an item has a discount recorded in `CartItem.discount`, display the nominal unit price and optionally indicate that a discount applied.
5. **Cold Start (No Past Purchases)**: A new user has an empty history.
   - *Mitigation*: Graceful empty state: UI badges simply remain hidden until at least one past purchase for that product exists. No errors or visual clutter for new items.

---

### Ready for Proposal
- [x] Codebase and architecture explored.
- [x] Affected areas identified across Domain, Infrastructure, and UI layers.
- [x] Historical lookup aggregation strategy mapped out (Barcode primary, normalized name fallback).
- [x] Price trend and inflation calculation logic defined, addressing `Money` value object constraints.
- [x] UI presentation (micro-badges, scanner integration, detail modal) designed for mobile grocery shopping ergonomics.
- [x] Performance considerations evaluated and in-memory indexing strategy chosen.
- [x] Ready to proceed to `sdd-propose` phase for change `store-price-history`.
