# Tasks: Store Price History (`store-price-history`)

## Overview & Delivery Strategy

- **Change ID**: `store-price-history`
- **Delivery Strategy**: `single-pr` (Cohesive, atomic delivery across Domain, UI Components, Modal Integration, and Styles with zero database schema migrations)
- **TDD Requirement**: Strict TDD (`[RED]` failing unit/component tests $\rightarrow$ `[GREEN]` minimal implementation $\rightarrow$ `[REFACTOR]` cleanup and verification)

---

## Review Workload Forecast

| Component / File | Type | Est. Prod LoC | Est. Test LoC | Complexity | Risk |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `src/domain/entities/PriceObservation.ts` | New Models / Types | +70 | - | Low | Low |
| `src/domain/services/StorePriceHistoryService.ts` | New Domain Service | +190 | - | Medium | Low |
| `tests/domain/StorePriceHistoryService.test.ts` | New Test Suite | - | +240 | Medium | Low |
| `src/domain/services/ProductLookupService.ts` | Modification | +25 | - | Low | Low |
| `tests/domain/ProductLookupService.test.ts` | Test Additions | - | +40 | Low | Low |
| `src/domain/index.ts` | Export Additions | +5 | - | Very Low | None |
| `src/ui/components/PriceTrendBadge.tsx` | New Component | +80 | - | Low | Low |
| `tests/ui/PriceTrendBadge.test.tsx` | New Component Tests | - | +110 | Low | Low |
| `src/ui/components/ProductPriceHistoryModal.tsx` | New Modal Sheet | +170 | - | Medium | Low |
| `tests/ui/ProductPriceHistoryModal.test.tsx` | New Component Tests | - | +120 | Medium | Low |
| `src/ui/components/CartList.tsx` | Integration Modification | +35 | - | Low | Low |
| `tests/ui/CartList.test.tsx` | New Integration Tests | - | +80 | Low | Low |
| `src/ui/components/ScanPricePromptModal.tsx` | Integration Modification | +55 | - | Medium | Low |
| `tests/ui/ScanPricePromptModal.test.tsx` | New Integration Tests | - | +90 | Medium | Low |
| `src/ui/components/EditPriceModal.tsx` | Integration Modification | +35 | - | Low | Low |
| `src/ui/App.tsx` | State & Lifecycle Wiring | +45 | - | Medium | Low |
| `src/ui/styles.css` | Stylesheet Additions | +150 | - | Low | Low |
| **Total Forecast** | | **~665 LoC** | **~680 LoC** | **Overall: Medium** | **Overall: Low** |

---

## Suggested Work Units

1. **Work Unit 1: Domain - Price Observation Models & Store Price History Service**
   - Pure domain business logic with zero React/DOM or storage driver dependencies.
   - Define strongly typed data contracts: `PriceObservation`, `TrendDirection` (`'UP' | 'DOWN' | 'EQUAL'`), `PriceDelta` (with signed cents arithmetic and non-negative `Money` invariants), `StorePriceComparison`, `ProductPriceComparisonResult`, and `ProductPriceHistory`.
   - Implement `StorePriceHistoryService` with dual in-memory hash maps (`byBarcode` and `byNormalizedName`) loaded exclusively from completed shopping sessions (`status === 'COMPLETED'`).
   - Implement store name normalization (`storeName.trim().toLowerCase()`) with latest display casing preservation.
   - Implement strict matching hierarchy: Exact Barcode ($O(1)$) $\rightarrow$ Exact Normalized Name ($O(1)$ with diacritic stripping) $\rightarrow$ `null`.
   - Calculate same-store price deltas, relative percentages, localized Spanish formats (`+X,XX €`, `-X,XX €`, `0,00 €`), all-time best price detection, and store comparison rankings.
   - Implement incremental indexing via `indexSession(session)` for instant updates on session completion.
   - Extend `ProductLookupService` to accept store context and suggest store-specific historical prices.

2. **Work Unit 2: UI Components - PriceTrendBadge & ProductPriceHistoryModal**
   - Accessible micro-badge `PriceTrendBadge` rendering visual indicators for inflation (`▲ +0,10 €`), savings (`▼ -0,15 €`), best price (`★ Mejor precio`), stable price (`= Mismo precio`), and first store visit (`ℹ Primera vez`).
   - Touch target compliance (minimum 48px) and descriptive Spanish `aria-label` attributes.
   - Detailed bottom sheet `ProductPriceHistoryModal` displaying summary header with current store price and same-store delta, cross-store comparison ranking table, chronological price timeline at current store, and potential savings alert.
   - Comprehensive component tests using `renderToString` verifying rendering, classes, and accessibility attributes.

3. **Work Unit 3: Integration - CartList, ScanPricePromptModal, EditPriceModal & App.tsx**
   - Integrate `PriceTrendBadge` into `CartList` item cards with tap handler opening `ProductPriceHistoryModal`.
   - Enhance `ScanPricePromptModal` with previous purchase context banner at current store, dynamic live delta chip updating as user types shelf price, cross-store best price alert, and shortcut to price history sheet.
   - Enhance `EditPriceModal` with same-store last purchase context and live difference chip on keystroke.
   - Wire `StorePriceHistoryService` lifecycle in `App.tsx`: startup hydration from `repository.listHistory()`, incremental indexing inside `handleConfirmFinish`, and modal state coordination.
   - Component integration tests verifying reactive props, live delta updates, and modal dispatchers.

4. **Work Unit 4: Styles & Full Verification**
   - Dedicated styling in `src/ui/styles.css` for trend badges, dynamic difference chips, store comparison tables, timeline lists, and modal transitions following existing color tokens and design patterns.
   - Full test suite run (`vitest run`) across all domain, infrastructure, and UI test suites.
   - Strict TypeScript validation (`tsc --noEmit`) and production bundle build verification.

---

## Phased Implementation Tasks

### Phase 1: Domain Layer (Models, Service, Lookup Extension & Unit Tests)

- [x] 1.1 **[RED]** Create unit test suite `tests/domain/StorePriceHistoryService.test.ts`
  - Test session indexing source filtering:
    - Indexes items from `COMPLETED` sessions.
    - Excludes items from `ACTIVE` and `DISCARDED` sessions.
  - Test dual in-memory index maps and chronological ordering:
    - Items indexed in `byBarcode` and `byNormalizedName` maps.
    - Multiple observations ordered chronologically descending (newest at index 0).
    - Preserves `isPromotional = true` when item discount cents > 0.
  - Test matching hierarchy:
    - Primary lookup by exact barcode returns immediately.
    - Secondary fallback lookup by normalized product name matches bulk/produce items without barcode.
    - Name normalization strips diacritics/accents, converts to lowercase, ignores extra whitespace, and discards punctuation.
    - Returns `null` when product has no historical purchases anywhere.
  - Test store name normalization and casing preservation:
    - Variations in store name casing or trailing spaces (`"Mercadona"`, `"mercadona "`, `"MERCADONA"`) map to the same store bucket.
    - Blank or undefined store names normalize to `"Supermercado"`.
    - Preserves latest user-entered casing for presentation.
  - Test delta calculations (`computeDelta`):
    - Price increase: `diffCents > 0`, `direction: 'UP'`, `+X,XX €`, `+X,X %`.
    - Price drop: `diffCents < 0`, `direction: 'DOWN'`, `-X,XX €`, `-X,X %`, positive `absoluteDiff`.
    - Identical price: `diffCents === 0`, `direction: 'EQUAL'`, `0,00 €`, `0,0 %`.
    - Zero previous price edge case handles `percentage: 0.0` safely without `NaN` or division by zero.
  - Test same-store comparison (`comparePrice`):
    - Computes same-store delta when previous purchase exists at current store.
    - Returns `sameStoreDelta: null` when product was never bought at current store (first visit).
  - Test cross-store comparison and best historical price:
    - Identifies all-time lowest price across all stores.
    - Sets `isCurrentBest = true` and `potentialSavings = Money.zero()` when current price $\le$ best historical.
    - Sets `isCurrentBest = false` and calculates `potentialSavings` when current price > best historical.
    - Ranks stores with current store first, followed by remaining stores sorted by price ascending.
  - Test incremental indexing (`indexSession`):
    - Adding completed session updates maps without reading from repository.
    - Subsequent lookups immediately reflect newly added session observations.
  - Test utility methods:
    - `getLastPriceAtStore` returns newest observation at target store or `null`.
    - `getBestPrice` returns lowest historical observation or `null`.
- [x] 1.2 **[GREEN]** Implement pure domain models in `src/domain/entities/PriceObservation.ts`
  - Define type `TrendDirection = 'UP' | 'DOWN' | 'EQUAL'`.
  - Define interface `PriceObservation` (`price: Money`, `date: Date`, `storeName: string`, `sessionId: string`, `productName: string`, `barcode?: string`, `isPromotional: boolean`).
  - Define interface `PriceDelta` (`diffCents: number`, `absoluteDiff: Money`, `percentage: number`, `direction: TrendDirection`, `formattedDiff: string`, `formattedPercent: string`).
  - Define interface `StorePriceComparison` (`storeName: string`, `isCurrentStore: boolean`, `latestPrice: Money`, `latestDate: Date`, `diffVsCurrent?: PriceDelta`, `isCheapest: boolean`).
  - Define interface `ProductPriceComparisonResult` (`productName: string`, `barcode?: string`, `currentStore: string`, `currentPrice: Money`, `sameStoreDelta: PriceDelta | null`, `bestHistoricalObservation: PriceObservation`, `isCurrentBest: boolean`, `potentialSavings: Money`, `storeComparisons: StorePriceComparison[]`, `sameStoreObservations: PriceObservation[]`).
  - Define interface `ProductPriceHistory` (`observations: PriceObservation[]`, `latestObservation: PriceObservation`, `bestObservation: PriceObservation`).
- [x] 1.3 **[GREEN]** Implement `StorePriceHistoryService` in `src/domain/services/StorePriceHistoryService.ts`
  - Implement class with private maps `byBarcode` and `byNormalizedName` and store display casing map.
  - Implement constructor and `buildIndex(sessions: ShoppingSession[])`.
  - Implement `indexSession(session: ShoppingSession)` for incremental updates.
  - Implement static `computeDelta(currentPrice: Money, previousPrice: Money): PriceDelta` adhering strictly to non-negative `Money` invariants.
  - Implement `getHistory(params: QueryHistoryParams): ProductPriceHistory | null`.
  - Implement `comparePrice(params: ComparePriceParams): ProductPriceComparisonResult | null`.
  - Implement `getLastPriceAtStore(params: { storeName?: string; barcode?: string; name: string }): PriceObservation | null`.
  - Implement `getBestPrice(params: QueryHistoryParams): PriceObservation | null`.
  - Ensure zero external runtime dependencies and clean separation from React/DOM.
- [x] 1.4 **[RED]** Add unit tests in `tests/domain/ProductLookupService.test.ts` for store-aware lookup
  - Test `lookup(barcode, currentStore)` utilizes `priceHistoryService.getLastPriceAtStore` to suggest store-specific last price when available.
  - Test fallback to persistent catalog `lastPrice` when no store-specific price exists in history.
- [x] 1.5 **[GREEN]** Update `src/domain/services/ProductLookupService.ts`
  - Accept optional `StorePriceHistoryService` in constructor or lookup params.
  - Extend `lookup(barcode: string, currentStore?: string)` to check store-specific historical price before catalog default.
- [x] 1.6 **[GREEN]** Export entities and services in `src/domain/index.ts`
  - Export `* from './entities/PriceObservation.js'`.
  - Export `* from './services/StorePriceHistoryService.js'`.
- [x] 1.7 **[REFACTOR]** Run domain test suite (`npx vitest run tests/domain`) and ensure 100% pass rate with clean domain boundaries.

---

### Phase 2: UI Presentation Layer (Components & Render Tests)

- [x] 2.1 **[RED]** Create component test suite `tests/ui/PriceTrendBadge.test.tsx`
  - Test returns empty output / `null` when `comparison` is `null`.
  - Test renders warm red alert badge with `▲` icon and formatted difference when trend is `'UP'`.
  - Test renders emerald green savings badge with `▼` icon and formatted difference when trend is `'DOWN'`.
  - Test renders amber gold badge with `★` icon and `"Mejor precio"` when `isCurrentBest` is `true` and trend is `'EQUAL'` or null.
  - Test renders neutral slate badge with `=` icon and `"Mismo precio"` when trend is `'EQUAL'` and not uniquely best.
  - Test renders cyan badge with `ℹ` icon and `"Primera vez"` when product has history elsewhere but no prior purchases at current store.
  - Test accessibility attributes:
    - Element includes descriptive Spanish `aria-label` describing price difference and store context.
    - Role is button when `onClick` handler is passed, with `tabIndex={0}`.
  - Test compact mode styling when `compact={true}` prop is supplied.
- [x] 2.2 **[GREEN]** Implement `PriceTrendBadge` in `src/ui/components/PriceTrendBadge.tsx`
  - Define `PriceTrendBadgeProps` (`comparison: ProductPriceComparisonResult | null`, `onClick?: () => void`, `className?: string`, `compact?: boolean`).
  - Render appropriate visual variant based on trend direction, `isCurrentBest`, and store visit state.
  - Embed accessible Lucide icons (`TrendingUp`, `TrendingDown`, `Minus`, `Award`, `Info`).
  - Support accessible keyboard activation (`Enter` / `Space`) when clickable.
- [x] 2.3 **[RED]** Create component test suite `tests/ui/ProductPriceHistoryModal.test.tsx`
  - Test returns empty string when `isOpen === false` or `comparison === null`.
  - Test renders modal dialog sheet with `aria-modal="true"`, `role="dialog"`, and `aria-labelledby`.
  - Test renders summary header with product name, barcode, current store name, current price, and same-store delta badge.
  - Test renders savings banner callout when `potentialSavings.cents > 0` with store name and savings amount.
  - Test suppresses savings banner when `isCurrentBest === true`.
  - Test renders store comparison ranking table with columns for *Establecimiento*, *Último precio*, *Fecha*, and *Diferencia*.
  - Test renders chronological price evolution timeline at current store with formatted dates and prices.
  - Test renders `"Promo aplicada"` tag for timeline entries with `isPromotional === true`.
  - Test renders close button with accessible `aria-label="Cerrar ventana"`.
- [x] 2.4 **[GREEN]** Implement `ProductPriceHistoryModal` in `src/ui/components/ProductPriceHistoryModal.tsx`
  - Define `ProductPriceHistoryModalProps` (`isOpen: boolean`, `comparison: ProductPriceComparisonResult | null`, `onClose: () => void`).
  - Render bottom sheet structure with backdrop, header, savings alert banner, store ranking table, and chronological timeline.
  - Add keyboard `Escape` listener and backdrop click handler for accessible dismissal.
  - Format relative Spanish dates (*"hace 3 días"*, *"el 15 sep"*, *"hace 2 meses"*).
- [x] 2.5 **[REFACTOR]** Run UI component tests (`npx vitest run tests/ui/PriceTrendBadge tests/ui/ProductPriceHistoryModal`) and verify render fidelity.

---

### Phase 3: Integration & Wiring Layer (CartList, ScanPricePromptModal, EditPriceModal & App.tsx)

- [x] 3.1 **[RED]** Create integration tests in `tests/ui/CartList.test.tsx`
  - Test cart item cards render `PriceTrendBadge` when `priceHistoryService` returns comparison data.
  - Test cart item cards omit `PriceTrendBadge` when product has no historical records.
  - Test tapping `PriceTrendBadge` fires `onViewPriceHistory` callback with the corresponding `ProductPriceComparisonResult`.
- [x] 3.2 **[GREEN]** Update `src/ui/components/CartList.tsx`
  - Extend `CartListProps` with `currentStore?: string`, `priceHistoryService?: StorePriceHistoryService`, and `onViewPriceHistory?: (comparison: ProductPriceComparisonResult) => void`.
  - In each cart item card, invoke `priceHistoryService.comparePrice()` and render `PriceTrendBadge` alongside unit price.
  - Attach click handler to badge triggering `onViewPriceHistory`.
- [x] 3.3 **[RED]** Create integration tests in `tests/ui/ScanPricePromptModal.test.tsx`
  - Test renders last purchase price banner at current store when barcode has history (e.g., *"Última vez en Mercadona: 1,15 €"*).
  - Test dynamic live delta chip updates as user enters/edits shelf price input:
    - Inputting higher price displays inflation chip (`▲ +0,20 € (+13,3%) vs anterior`).
    - Inputting lower price displays savings chip (`▼ -0,10 € (-6,7%) vs anterior`).
  - Test renders cross-store best price alert when product was cheaper at another store.
  - Test clicking "Ver historial de precios" opens the full price history modal.
- [x] 3.4 **[GREEN]** Update `src/ui/components/ScanPricePromptModal.tsx`
  - Extend `ScanPricePromptModalProps` with `currentStore?: string`, `priceHistoryService?: StorePriceHistoryService`, and `onViewPriceHistory?: (comparison: ProductPriceComparisonResult) => void`.
  - Fetch previous observation at `currentStore` using `priceHistoryService.getLastPriceAtStore()`.
  - Display previous store price banner under the barcode pill.
  - Calculate dynamic live delta using `StorePriceHistoryService.computeDelta()` inside `handlePriceChange` and render feedback chip below price input.
  - Display cross-store best price callout if cheaper elsewhere with button triggering `onViewPriceHistory`.
- [x] 3.5 **[GREEN]** Update `src/ui/components/EditPriceModal.tsx`
  - Extend `EditPriceModalProps` with `currentStore?: string` and `priceHistoryService?: StorePriceHistoryService`.
  - Query `getLastPriceAtStore()` for current item and store.
  - Display previous purchase context banner (*"Última vez en esta tienda: X,XX €"*).
  - Calculate dynamic live delta on keystroke and render live feedback chip.
- [x] 3.6 **[GREEN]** Wire `StorePriceHistoryService` and Modal State in `src/ui/App.tsx`
  - Instantiate and memoize `StorePriceHistoryService` instance.
  - Hydrate index on startup via `repository.listHistory()` in a `useEffect` hook.
  - Incrementally index session items in `handleConfirmFinish` via `storePriceHistoryService.indexSession(session)`.
  - Pass `currentStore={session.storeName}` and `priceHistoryService={storePriceHistoryService}` to:
    - `CartList`
    - `ScanPricePromptModal`
    - `EditPriceModal`
  - Add state `selectedPriceComparison: ProductPriceComparisonResult | null` and `isPriceHistoryModalOpen: boolean`.
  - Handle `handleViewPriceHistory(comparison)` to open `ProductPriceHistoryModal`.
  - Render `ProductPriceHistoryModal` at root level.
- [x] 3.7 **[REFACTOR]** Run all tests (`npx vitest run`) and verify full integration pass with 0 regressions.

---

### Phase 4: Styles, Full Verification & Build Validation

- [x] 4.1 **[GREEN]** Add stylesheet rules in `src/ui/styles.css`
  - Styles for `PriceTrendBadge`:
    - Base badge pill: `display: inline-flex`, `align-items: center`, `gap: 4px`, `font-size: 0.75rem`, `font-weight: 600`, `border-radius: var(--radius-full)`, `cursor: pointer`.
    - Variants: `.trend-badge--up` (danger red), `.trend-badge--down` (primary emerald), `.trend-badge--best` (amber gold), `.trend-badge--equal` (neutral slate), `.trend-badge--first` (cyan).
    - Minimum touch target dimension (48px or touch wrapper padding).
  - Styles for dynamic difference feedback chips in `ScanPricePromptModal` and `EditPriceModal`:
    - `.live-delta-chip`, `.live-delta-chip--up`, `.live-delta-chip--down`, `.live-delta-chip--equal`.
  - Styles for `ProductPriceHistoryModal`:
    - Modal sheet container `.price-history-modal-sheet`.
    - Header summary section with current price and delta badge.
    - Savings callout banner `.price-history-savings-banner` with highlighted badge and savings value.
    - Store comparison table `.store-comparison-table`: clean border, alternating row subtle background, tabular numerals, current store row highlight.
    - Price timeline list `.price-timeline-list`, timeline item dots, date labels, and `.promo-applied-badge`.
  - Tabular numerals application (`font-variant-numeric: tabular-nums`) across all price and percentage chips.
- [x] 4.2 **[VERIFY]** Run full Vitest test suite (`npx vitest run`)
  - Verify all domain tests pass.
  - Verify all infrastructure tests pass.
  - Verify all UI component and integration tests pass.
  - Confirm 100% test pass rate with 0 regressions.
- [x] 4.3 **[VERIFY]** Run strict TypeScript typecheck (`npx tsc --noEmit`)
  - Confirm 0 type errors across the entire codebase.
- [x] 4.4 **[VERIFY]** Production build validation (`npx vite build`)
  - Confirm clean bundle compilation and asset generation with 0 warnings or bundling errors.

