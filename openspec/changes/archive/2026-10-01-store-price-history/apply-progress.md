# Implementation Progress: Store Price History (`store-price-history`)

## Overview

- **Change ID**: `store-price-history`
- **Delivery Strategy**: `single-pr` (Atomic delivery across Domain and UI layers)
- **TDD Mode**: Strict TDD (`strict_tdd: true`)
- **Status**: Completed (100% Tasks Complete, 0 Regressions)

---

## TDD Implementation Cycles

| Work Unit | Task | Target File | Status | TDD Phase |
| :--- | :--- | :--- | :---: | :---: |
| **WU 1: Domain** | 1.1 | `tests/domain/services/StorePriceHistoryService.test.ts` | Complete | `[RED]` |
| **WU 1: Domain** | 1.2 | `src/domain/entities/PriceObservation.ts` | Complete | `[GREEN]` |
| **WU 1: Domain** | 1.3 | `src/domain/services/StorePriceHistoryService.ts` | Complete | `[GREEN]` |
| **WU 1: Domain** | 1.4 | `tests/domain/ProductLookupService.test.ts` | Complete | `[RED]` |
| **WU 1: Domain** | 1.5 | `src/domain/services/ProductLookupService.ts` | Complete | `[GREEN]` |
| **WU 1: Domain** | 1.6 | `src/domain/index.ts` | Complete | `[GREEN]` |
| **WU 1: Domain** | 1.7 | Domain Verification (`vitest run tests/domain`) | Complete | `[REFACTOR]` |
| **WU 2: UI Components** | 2.1 | `tests/ui/components/PriceTrendBadge.test.tsx` | Complete | `[RED]` |
| **WU 2: UI Components** | 2.2 | `src/ui/components/PriceTrendBadge.tsx` | Complete | `[GREEN]` |
| **WU 2: UI Components** | 2.3 | `tests/ui/components/ProductPriceHistoryModal.test.tsx` | Complete | `[RED]` |
| **WU 2: UI Components** | 2.4 | `src/ui/components/ProductPriceHistoryModal.tsx` | Complete | `[GREEN]` |
| **WU 2: UI Components** | 2.5 | UI Verification (`vitest run tests/ui/components`) | Complete | `[REFACTOR]` |
| **WU 3: Integration** | 3.1 | `tests/ui/CartList.test.tsx` | Complete | `[RED]` |
| **WU 3: Integration** | 3.2 | `src/ui/components/CartList.tsx` | Complete | `[GREEN]` |
| **WU 3: Integration** | 3.3 | `tests/ui/ScanPricePromptModal.test.tsx` | Complete | `[RED]` |
| **WU 3: Integration** | 3.4 | `src/ui/components/ScanPricePromptModal.tsx` | Complete | `[GREEN]` |
| **WU 3: Integration** | 3.5 | `src/ui/components/EditPriceModal.tsx` | Complete | `[GREEN]` |
| **WU 3: Integration** | 3.6 | `src/ui/App.tsx` | Complete | `[GREEN]` |
| **WU 3: Integration** | 3.7 | Integration Verification (`vitest run`) | Complete | `[REFACTOR]` |
| **WU 4: Styles & Build** | 4.1 | `src/ui/styles.css` | Complete | `[GREEN]` |
| **WU 4: Styles & Build** | 4.2 | Full Test Suite (`npm test`) | Complete | `[VERIFY]` |
| **WU 4: Styles & Build** | 4.3 | Strict Typecheck (`npm run typecheck`) | Complete | `[VERIFY]` |
| **WU 4: Styles & Build** | 4.4 | Production Build (`npm run build`) | Complete | `[VERIFY]` |

---

## Verification Evidence

### 1. Test Suite Execution (`vitest run`)
```
 Test Files  31 passed (31)
      Tests  384 passed (384)
   Duration  2.21s
```
- 0 failures, 0 flakiness, 0 regressions across all 31 test suites.
- 47 new tests added covering domain service, price trend badges, history modal, cart list, and scan prompt.

### 2. TypeScript Strict Typecheck (`tsc --noEmit`)
```
> CestaCuenta@1.0.0 typecheck
> tsc --noEmit
(Exit code: 0)
```
- 0 type errors across entire codebase.

### 3. Production Build Validation (`tsc && vite build`)
```
✓ 1975 modules transformed.
dist/registerSW.js                0.13 kB
dist/manifest.webmanifest         0.64 kB
dist/index.html                   1.20 kB │ gzip:   0.58 kB
dist/assets/index-CgKVsDFK.css   62.43 kB │ gzip:  10.23 kB
dist/assets/index-CN1smIyY.js   747.21 kB │ gzip: 224.16 kB
✓ built in 431ms
PWA v1.3.0 precache 15 entries (1945.58 KiB)
```

---

## Artifact Inventory

### Created Files
- `src/domain/entities/PriceObservation.ts`: Pure domain data models (`PriceObservation`, `TrendDirection`, `PriceDelta`, `StorePriceComparison`, `ProductPriceComparisonResult`, `ProductPriceHistory`).
- `src/domain/services/StorePriceHistoryService.ts`: Pure in-memory projection engine with dual indexing (`byBarcode`, `byNormalizedName`), incremental indexing, delta calculation, store ranking, and historical queries.
- `src/ui/components/PriceTrendBadge.tsx`: Visual 5-trend badge chip (`▲`, `▼`, `=`, `★`, `ℹ`) with WCAG AA accessibility attributes.
- `src/ui/components/ProductPriceHistoryModal.tsx`: Expandable bottom sheet dialog with store comparison ranking table, savings banner, and chronological price timeline.
- `tests/domain/services/StorePriceHistoryService.test.ts`: 22 unit tests for domain service indexing, delta arithmetic, matching hierarchy, and edge cases.
- `tests/ui/components/PriceTrendBadge.test.tsx`: 8 component render tests for all badge states and accessibility labels.
- `tests/ui/components/ProductPriceHistoryModal.test.tsx`: 9 component render tests for modal sheet, store ranking table, savings callout, and timeline.
- `tests/ui/CartList.test.tsx`: 3 integration tests for cart row trend badge rendering and modal dispatch.
- `tests/ui/ScanPricePromptModal.test.tsx`: 3 integration tests for previous price banner, live delta chips, and best price callouts.

### Modified Files
- `src/domain/services/ProductLookupService.ts`: Store-aware lookup extension checking `StorePriceHistoryService.getLastPriceAtStore`.
- `tests/domain/ProductLookupService.test.ts`: Added tests verifying store-specific suggested prices.
- `src/domain/index.ts`: Re-exported domain models and service.
- `src/ui/components/CartList.tsx`: Integrated `PriceTrendBadge` and `onViewPriceHistory` tap handler.
- `src/ui/components/ScanPricePromptModal.tsx`: Added store last price banner, dynamic live delta chip, and cross-store savings notice.
- `src/ui/components/EditPriceModal.tsx`: Added previous price banner and live delta feedback while editing price.
- `src/ui/App.tsx`: Initialized and hydrated `StorePriceHistoryService` from `repository.listHistory()`, incremental indexing in `handleConfirmFinish`, and modal state coordination.
- `src/ui/styles.css`: Complete styling rules for trend badges, dynamic chips, store ranking tables, and modal sheet animations.
- `openspec/changes/store-price-history/tasks.md`: Marked all 20 implementation tasks as `[x]`.
