# Proposal: store-price-history

## Intent

Empower CestaCuenta users to make informed purchasing decisions in supermarket aisles by tracking historical product prices across shopping sessions and stores. During shopping trips, users often face price fluctuations and inflation across different supermarket chains (e.g., Mercadona, Carrefour, Lidl, Dia) without clear recall of what they previously paid. 

This change introduces historical price tracking, same-store price delta calculation (inflation and savings alerts), all-time best price identification, and cross-store comparison breakdowns. When scanning or viewing items in the cart, compact visual indicators surface price trends at a glance, while an expandable modal provides full store-by-store price comparisons and chronological price evolution.

## Scope

### In Scope

- **Domain Layer**:
  - `PriceObservation` & Data Models (`src/domain/entities/PriceObservation.ts`):
    - Strongly typed interfaces: `PriceObservation`, `TrendDirection` (`'UP' | 'DOWN' | 'EQUAL'`), `PriceDelta`, `StorePriceComparison`, and `ProductPriceHistory`.
    - Handles signed price variations while strictly respecting `Money` value object non-negative constraints.
  - `StorePriceHistoryService` (`src/domain/services/StorePriceHistoryService.ts`):
    - Pure domain service that indexes completed shopping sessions from `ShoppingSessionRepository.listHistory()`.
    - Dual-index lookup strategy: Primary by barcode ($O(1)$) and secondary fallback by normalized product name ($O(1)$) using diacritic stripping.
    - Store name normalization for consistent grouping across sessions while preserving user-facing casing.
    - Same-store delta calculation: Computes price difference in cents, percentage change, and trend direction vs the most recent visit to the current store.
    - Cross-store best price detection: Identifies the lowest price ever observed across all stores and calculates potential savings.
    - Store-by-store ranking: Aggregates latest observation per store, sorted by current store first, followed by price ascending.
    - Incremental session updates to the in-memory index when a session is finalized.
  - `ProductLookupService` (`src/domain/services/ProductLookupService.ts`):
    - Optional extension to accept `currentStore` and suggest store-specific historical prices when available during barcode lookup.
- **UI & Interaction Layer**:
  - `PriceTrendBadge` (`src/ui/components/PriceTrendBadge.tsx`):
    - Accessible micro-badge displayed in `CartList` item cards and scanner modals.
    - Visual indicators for:
      - Inflation alert (`▲ +0,10 €` / `+8.3%`, warm red badge).
      - Savings / Discount (`▼ -0,15 €` / `-12.0%`, fresh emerald badge).
      - Stable price (`= Mismo precio`, subtle neutral badge).
      - Historical best price (`★ Mejor precio`, amber badge).
      - First time at store (`ℹ Primera vez`, cyan badge).
    - Descriptive `aria-label`s for screen readers.
  - `ProductPriceHistoryModal` (`src/ui/components/ProductPriceHistoryModal.tsx`):
    - Bottom sheet / modal dialog opened by tapping any price trend badge.
    - Displays:
      1. Summary header with current store price and same-store delta.
      2. Cross-store comparison ranking table (stores, latest recorded price, relative date, delta vs current).
      3. Chronological timeline of price evolution at the current store.
      4. Potential savings highlight if cheaper elsewhere.
  - `ScanPricePromptModal` (`src/ui/components/ScanPricePromptModal.tsx`):
    - Displays previous price at current store (e.g. *"Última vez en Mercadona: 1,15 € el 18 sep"*).
    - Dynamic live feedback chip as user adjusts the shelf price before adding to cart.
    - Best price notice across other stores if cheaper elsewhere.
    - Shortcut link to open the full price history modal.
  - `CartList` (`src/ui/components/CartList.tsx`):
    - Integrates `PriceTrendBadge` beside unit price on cart item cards.
    - Opens `ProductPriceHistoryModal` upon badge tap.
  - `EditPriceModal` (`src/ui/components/EditPriceModal.tsx`):
    - Displays same-store historical price and live delta feedback as user changes the item unit price.
  - `App` (`src/ui/App.tsx`):
    - Initializes and holds `StorePriceHistoryService` instance.
    - Hydrates index on startup from `sessionRepository.listHistory()`.
    - Automatically updates the index when active session completes (`handleConfirmFinish`).
    - Coordinates state for `ProductPriceHistoryModal`.
  - `styles.css` (`src/ui/styles.css`):
    - Styles for trend badges, dynamic difference chips, comparison tables, and modal transitions, following existing design tokens and 48px touch targets.
- **Testing**:
  - Unit tests for `StorePriceHistoryService` covering indexing, multi-store grouping, barcode matching, normalized name matching, same-store deltas, negative deltas, identical prices, cross-store best prices, and incremental updates.
  - Component tests for `PriceTrendBadge.test.tsx` and `ProductPriceHistoryModal.test.tsx`.
  - Integration/regression tests for `ScanPricePromptModal`, `CartList`, and `EditPriceModal`.

### Out of Scope

- Cloud synchronization, central crowdsourced price sharing between different users, or remote backend database servers (operates 100% locally and offline-first).
- Persistent secondary database tables or secondary localStorage keys for price points (uses lightweight in-memory projection from canonical session history to avoid sync divergence and schema migrations).
- Automatic web scraping or third-party supermarket pricing APIs.
- Machine learning or predictive price forecasting.

## Capabilities

### New Capabilities

- `price-history`: Historical price tracking, same-store price delta calculation, and cross-store best price comparisons.
  - Builds high-speed in-memory indexes from completed shopping sessions by exact barcode and normalized product name.
  - Computes same-store inflation/deflation deltas (signed cents, percentage change, and trend direction) while respecting non-negative domain invariants.
  - Identifies all-time best price across all visited stores, calculates potential savings, and generates store-by-store comparison rankings.
  - Surfaces subtle micro-badges on cart rows, dynamic feedback chips in price input modals, and a detailed store comparison sheet.

### Modified Capabilities

- *None*

## Approach

1. **Domain Projection Architecture (Zero Storage Migrations)**:
   - Rather than creating a secondary database table or localStorage store that risks falling out of sync with past sessions, `StorePriceHistoryService` derives all observations directly from completed sessions in `ShoppingSessionRepository.listHistory()`.
   - Works immediately with existing user data on both Web (`LocalStorageShoppingSessionRepository`) and SQLite (`SqliteShoppingSessionRepository`) without schema migrations.
2. **In-Memory Indexing for Maximum Mobile Responsiveness**:
   - A typical user with 50-100 sessions has 1,000-4,000 historical items. Re-scanning raw history arrays on every component render or keystroke would introduce UI stuttering.
   - `StorePriceHistoryService` processes historical sessions once at startup into two hash maps:
     - `byBarcode: Map<string, PriceObservation[]>`
     - `byNormalizedName: Map<string, PriceObservation[]>`
   - All lookups for cart rows and scanner modals are instantaneous $O(1)$ operations (< 0.1ms).
   - Incremental updates: When a shopping session is completed, new observations are added to the existing in-memory maps without re-reading the entire storage history.
3. **Product Matching Hierarchy**:
   - **Priority 1 (Exact Barcode Match)**: When a barcode is present and matches, it guarantees 100% exact product identity.
   - **Priority 2 (Exact Normalized Name Match)**: For items without barcode (fresh produce, bulk bakery, manual entries), items are matched using normalized text (lowercased, diacritics stripped, non-alphanumeric removed, whitespace collapsed).
   - Loose fuzzy/word-subset matching is deliberately avoided for price history to prevent false positive inflation alerts (e.g. confusing 1L whole milk with 1L skimmed milk).
4. **Strict `Money` Invariant Compliance**:
   - CestaCuenta's `Money` value object forbids negative cents and throws if `subtract()` yields a negative value.
   - Price differences can be negative when a product is cheaper than in the past. To maintain domain integrity, `PriceDelta` separates the signed magnitude (`diffCents: number`) from the absolute display representation (`absoluteDiff: Money`), accompanied by an explicit `direction: 'UP' | 'DOWN' | 'EQUAL'`.
5. **Ergonomic In-Store UX**:
   - In-store shoppers have one hand occupied with a shopping cart or basket. Visual indicators must be readable at a glance.
   - `PriceTrendBadge` uses clear color coding (emerald for savings, warm red for inflation, amber for best price) with concise text (`▲ +0,10 €` / `▼ -0,15 €`).
   - Dynamic real-time feedback in `ScanPricePromptModal` and `EditPriceModal` informs the user of price shifts as they type the shelf price.
   - Tapping any badge opens the `ProductPriceHistoryModal` bottom sheet for deeper store comparisons.

## Affected Areas

| Area | Path | Changes |
| :--- | :--- | :--- |
| **Domain** | `src/domain/entities/PriceObservation.ts` | **New**: Pure domain interfaces for historical price points, deltas, trends, and store comparisons. |
| **Domain** | `src/domain/services/StorePriceHistoryService.ts` | **New**: Service for building in-memory indexes, computing same-store deltas, and cross-store rankings. |
| **Domain** | `src/domain/services/ProductLookupService.ts` | **Modify**: Accept store context to suggest store-specific last price. |
| **Domain** | `src/domain/index.ts` | **Modify**: Export new entities, interfaces, and service. |
| **UI Components** | `src/ui/components/PriceTrendBadge.tsx` | **New**: Visual trend badge chip for cart items and scanner modal. |
| **UI Components** | `src/ui/components/ProductPriceHistoryModal.tsx` | **New**: Detailed store comparison breakdown and price timeline modal. |
| **UI Components** | `src/ui/components/ScanPricePromptModal.tsx` | **Modify**: Add store last price context, dynamic live delta chip, and best price alert. |
| **UI Components** | `src/ui/components/EditPriceModal.tsx` | **Modify**: Add live same-store delta indicator while editing unit price. |
| **UI Components** | `src/ui/components/CartList.tsx` | **Modify**: Render `PriceTrendBadge` in item header and handle click to open history modal. |
| **UI Components** | `src/ui/App.tsx` | **Modify**: Initialize `StorePriceHistoryService`, hydrate on startup, update on finish, manage modal state. |
| **UI Styles** | `src/ui/styles.css` | **Modify**: CSS rules for badges, dynamic chips, store comparison tables, and animations. |
| **Tests** | `tests/domain/StorePriceHistoryService.test.ts` | **New**: Unit tests for indexing, delta calculation, store ranking, and edge cases. |
| **Tests** | `tests/ui/PriceTrendBadge.test.tsx` | **New**: Component tests for badge variants, colors, and accessibility. |
| **Tests** | `tests/ui/ProductPriceHistoryModal.test.tsx` | **New**: Component tests for store ranking table, timeline, and accessibility. |
| **Tests** | `tests/ui/CartList.test.tsx` | **Modify**: Verify integration with trend badges and click handler. |
| **Tests** | `tests/ui/ScanPricePromptModal.test.tsx` | **Modify**: Verify historical price context and dynamic feedback chips. |

## Dependencies

- **Domain Entities & Value Objects**:
  - `ShoppingSession`, `CartItem`, `Money`.
- **Domain Repositories**:
  - `ShoppingSessionRepository.listHistory()`.
- **Domain Services / Utilities**:
  - `normalizeText` (from `ShoppingListMatcherService` or extracted pure helper).
- **Libraries**:
  - `lucide-react`: UI icons (`TrendingUp`, `TrendingDown`, `Minus`, `Award`, `Info`, `Store`, `Clock`, `ArrowUpDown`, `ChevronRight`).
- **No external npm runtime dependencies required.**

## Risks & Mitigations

1. **Store Name Variations & Typos**:
   - *Risk*: Users may enter minor variations in store names (e.g., `"Mercadona"`, `"mercadona"`, `"Mercadona "`).
   - *Mitigation*: Group stores using trimmed lowercase string keys while storing the latest formatted user string for display.
2. **Missing Barcode on Bulk or Produce Items**:
   - *Risk*: Fresh fruits, vegetables, bakery items, or manual entries do not possess standard EAN barcodes.
   - *Mitigation*: Fall back to exact normalized product name matching (`normalizeText`) with diacritic removal. If no historical record matches, gracefully display no badge.
3. **`Money` Value Object Invariant**:
   - *Risk*: `Money` throws if instantiated with negative cents or when subtracting a larger amount.
   - *Mitigation*: `PriceDelta` uses a signed integer `diffCents` for calculation, accompanied by a non-negative `Money` object for formatted difference display and an explicit `TrendDirection` enum.
4. **Promotions & Multi-Buy Discounts**:
   - *Risk*: A previous session might have had a discount (e.g. 2nd unit -50%), which could distort nominal unit prices.
   - *Mitigation*: Index historical items using their nominal `unitPrice`. If an observation had a `discount > 0`, annotate the observation so the history modal can display a "Promo aplicada" tag.
5. **Cold Start (Empty History)**:
   - *Risk*: New users or first-time product purchases have no previous price data.
   - *Mitigation*: Graceful empty state: badges remain hidden when no previous purchase exists, keeping the cart clean and uncluttered.
6. **Performance with Large Session History**:
   - *Risk*: Reading hundreds of sessions on every keystroke could drop UI frames.
   - *Mitigation*: In-memory indexed maps (`byBarcode` and `byNormalizedName`) loaded once at startup and updated incrementally on session finish, guaranteeing $O(1)$ constant-time lookups.

## Rollback Plan

The store price history feature is purely additive and decoupled from existing data stores:
1. Reverting the commits will remove `StorePriceHistoryService`, `PriceObservation`, and the UI additions in `CartList`, `ScanPricePromptModal`, and `EditPriceModal`.
2. Existing shopping sessions, items, `localStorage` records, and SQLite databases remain 100% intact and functional with no data loss.
3. No database schema migrations or state structure transformations need to be reversed.

## Success Criteria

- [ ] `StorePriceHistoryService` indexes historical sessions by barcode and normalized name, computing same-store deltas, trend directions, and all-time best prices with 100% test coverage.
- [ ] Price deltas handle inflation (`UP`), savings (`DOWN`), and equality (`EQUAL`) without violating `Money` non-negative invariants.
- [ ] `PriceTrendBadge` renders appropriate visual chips (`▲`, `▼`, `=`, `★`, `ℹ`) with accessible labels in cart items.
- [ ] `ScanPricePromptModal` displays last price at current store and dynamic live inflation/savings feedback as price is adjusted.
- [ ] `ProductPriceHistoryModal` presents a store comparison ranking table, potential savings, and chronological price timeline.
- [ ] Lookups perform in $O(1)$ constant time with no UI thread lag.
- [ ] All existing and new tests pass without regressions (`npm test`).
- [ ] Zero TypeScript errors (`npx tsc --noEmit`).
