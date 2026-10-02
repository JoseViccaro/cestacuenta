# Apply Progress: Live Budget Control (`live-budget-control`)

## Execution Summary

- **Change ID**: `live-budget-control`
- **Execution Role**: `sdd-apply`
- **TDD Mode**: Strict TDD (`[RED]` failing test $\rightarrow$ `[GREEN]` minimal code $\rightarrow$ `[REFACTOR]` verification)
- **Status**: Complete (`success`)
- **Overall Verification**:
  - `vitest run`: **35/35 test files passed (429/429 tests)**
  - `tsc --noEmit`: **0 errors**
  - `npm run build`: **Built successfully (PWA service worker + client bundles)**

---

## Strict TDD Execution Table

| Work Unit | Subtask / Component | Test File | Prod File | TDD Cycle | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **WU 1: Domain** | 1.1 - 1.2 `ShoppingSession` budget props, invariants & metrics | `tests/domain/ShoppingSession.test.ts` | `src/domain/entities/ShoppingSession.ts` | RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR | 10 new tests passed (50/50 total in file) |
| **WU 1: Domain** | 1.3 - 1.4 `ShoppingList.pendingCount()` | `tests/domain/ShoppingList.test.ts` | `src/domain/entities/ShoppingList.ts` | RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR | 4 new tests passed (19/19 total in file) |
| **WU 1: Domain** | 1.5 Domain exports re-export verification | - | `src/domain/index.ts` | VERIFY | Re-exported `BudgetStatus`, `BudgetMetrics` |
| **WU 2: Infrastructure** | 2.1 - 2.2 `LocalStorageShoppingSessionRepository` serialization & hydration | `tests/infrastructure/persistence/LocalStorageShoppingSessionRepository.test.ts` | `src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts` | RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR | 3 new tests passed (20/20 total in file) |
| **WU 2: Infrastructure** | 2.3 - 2.4 `SqliteShoppingSessionRepository` schema migration & hydration | `tests/infrastructure/persistence/SqliteShoppingSessionRepository.test.ts` | `src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts` | RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR | 3 new tests passed (22/22 total in file) |
| **WU 2: Infrastructure** | 2.5 - 2.6 `Haptics` budget warning & exceeded multi-pulse / dual-tone | `tests/infrastructure/device/Haptics.test.ts` | `src/infrastructure/device/Haptics.ts` | RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR | 2 new tests passed (11/11 total in file) |
| **WU 3: UI** | 3.1 - 3.2 `SetBudgetModal` component | `tests/ui/SetBudgetModal.test.tsx` | `src/ui/components/SetBudgetModal.tsx` | RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR | 5 new tests passed (5/5 total in file) |
| **WU 3: UI** | 3.3 - 3.4 `StickyBottomBar` progress gauge & chips | `tests/ui/StickyBottomBar.test.tsx` | `src/ui/components/StickyBottomBar.tsx` | RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR | 5 new tests passed (5/5 total in file) |
| **WU 3: UI** | 3.5 - 3.6 `Header` budget pill button | `tests/ui/Header.test.tsx` | `src/ui/components/Header.tsx` | RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR | 3 new tests passed (3/3 total in file) |
| **WU 3: UI** | 3.7 - 3.8 `App.tsx` state, edge transitions & modal | `tests/ui/App.test.tsx` | `src/ui/App.tsx` | RED $\rightarrow$ GREEN $\rightarrow$ REFACTOR | 6 new tests passed (6/6 total in file) |
| **WU 4: Styles & Build** | 4.1 Responsive styles & touch targets | - | `src/ui/styles.css` | IMPLEMENT | Gauge, chips, pill button, modal |
| **WU 4: Styles & Build** | 4.2 - 4.4 Full suite, typecheck & build | - | - | VERIFY | 429/429 tests, 0 TS errors, clean build |

---

## Detailed Implementation Notes

### 1. Domain Layer (`src/domain/entities/ShoppingSession.ts` & `ShoppingList.ts`)
- **Types**: Added `BudgetStatus = 'NONE' | 'NORMAL' | 'WARNING' | 'EXCEEDED'` and `BudgetMetrics` interface.
- **Invariants**:
  - `setBudgetLimit(limit)` guarantees session is active (`ensureActive()`), asserts `limit` is a `Money` instance, and validates positive cents (`limit.cents > 0`).
  - Passing `null` or `undefined` safely resets budget to `undefined`.
- **Calculations & Defensive Arithmetic**:
  - Exact threshold boundaries: `< 80%` $\rightarrow$ `NORMAL`, `80% - 100%` $\rightarrow$ `WARNING`, `> 100%` $\rightarrow$ `EXCEEDED`.
  - Avoided negative cents subtraction crashes: when `total > limit`, `remaining` is pinned to `Money.zero()` and `overBudget = total.subtract(limit)`.
  - Dynamic pending item margin: calculates `Math.floor(remaining.cents / pendingItemCount)` when pending items exist, or returns `Money.zero()` when over budget.
  - Added `ShoppingList.pendingCount()` counting items with `!item.checked`.

### 2. Infrastructure Layer (`src/infrastructure/`)
- **LocalStorage (`LocalStorageShoppingSessionRepository.ts`)**:
  - Extended DTO with optional `budgetLimitCents?: number | null`.
  - Deserializer safely hydrates legacy sessions missing the field to `undefined`.
- **SQLite (`SqliteShoppingSessionRepository.ts`)**:
  - Schema upgraded with `budget_limit_cents INTEGER` (nullable).
  - Added idempotent `ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER;` in `initDatabase()` wrapped in try/catch to absorb already-existing column errors.
  - Updated `upsertSession`, `selectActiveSession`, `selectSessionById`, `selectHistory`, and `hydrateSession`.
- **Sensory Feedback (`Haptics.ts`)**:
  - Implemented `triggerBudgetWarning()`: vibration `[120, 80, 120]`, attention tone 660 Hz $\rightarrow$ 587 Hz via Web Audio API.
  - Implemented `triggerBudgetExceeded()`: urgent vibration `[200, 100, 200, 100, 200]`, alert tone 440 Hz $\rightarrow$ 330 Hz.
  - Safe fallbacks for Node/Vitest environments, SSR, and browsers lacking Web Audio or vibration capabilities.

### 3. Presentation Layer (`src/ui/`)
- **`SetBudgetModal.tsx`**:
  - Accessible bottom sheet dialog with quick preset chips (`20 €`, `30 €`, `50 €`, `75 €`, `100 €`).
  - Controlled custom numeric entry with decimal sanitization.
  - Live preview box displaying current cart total, headroom / over-budget projection, and per-pending-item margin.
  - Clear budget danger button when a budget is currently active.
  - $\ge 48\text{px}$ touch targets.
- **`StickyBottomBar.tsx`**:
  - Compact visual progress bar gauge with WAI-ARIA `progressbar` attributes (`aria-valuenow`, `aria-valuemin`, `aria-valuemax`).
  - Status modifiers: `.budget-gauge--normal`, `.budget-gauge--warning`, `.budget-gauge--exceeded`.
  - Click handler triggers `onOpenBudgetModal`.
- **`Header.tsx`**:
  - Compact budget pill button (`.budget-pill-btn`) showing `+ Presupuesto` (when empty) or formatted cap amount with colored status dot (`.budget-status-dot`).
  - Click handler triggers `onOpenBudgetModal`.
- **`App.tsx`**:
  - Added `isBudgetModalOpen` state and `lastBudgetStatusRef` transition tracker.
  - Implemented edge-triggered threshold transition detector: sensory haptics and toast alerts fire strictly on upward crossings (`< WARNING` $\rightarrow$ `WARNING`, `< EXCEEDED` $\rightarrow$ `EXCEEDED`).
  - Subsequent item additions within the same status remain silent (no duplicate alerts).
  - Downward transitions (item deletions) update state silently without triggering sensory cues.
  - Cloned sessions in `commitSession` preserve `budgetLimit`.

### 4. Stylesheet (`src/ui/styles.css`)
- Styled `.budget-gauge`, `.budget-progress-track`, `.budget-progress-fill`.
- Implemented transition animations for progress bar fills and status colors (normal green, warning amber, exceeded red).
- Styled `.budget-pill-btn`, `.budget-status-dot`, `.preset-chips-grid`, `.preset-chip`, `.budget-preview-box`, `.budget-danger-btn`.
- Verified mobile touch target ergonomics ($\ge 48\text{px}$).

---

## Verification Evidence

### 1. Test Suite Execution (`npx vitest run`)
```text
 Test Files  35 passed (35)
      Tests  429 passed (429)
   Start at  15:13:14
   Duration  4.28s
```

### 2. TypeScript Type Check (`npx tsc --noEmit`)
```text
Exit code: 0 (zero errors)
```

### 3. Production Build (`npm run build`)
```text
vite v8.3.1 building client environment for production...
✓ 1976 modules transformed.
rendering chunks (1)...
dist/registerSW.js                0.13 kB
dist/manifest.webmanifest         0.64 kB
dist/index.html                   1.20 kB │ gzip:   0.58 kB
dist/assets/index-DF4yPnyn.css   66.82 kB │ gzip:  10.84 kB
dist/assets/index-Dz177ywh.js   756.38 kB │ gzip: 226.11 kB
✓ built in 276ms

PWA v1.3.0
mode      generateSW
precache  15 entries (1958.83 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
Exit code: 0
```

---

## Artifacts Created & Modified

### Modified Files:
- [`src/domain/entities/ShoppingSession.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/domain/entities/ShoppingSession.ts)
- [`src/domain/entities/ShoppingList.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/domain/entities/ShoppingList.ts)
- [`src/infrastructure/device/Haptics.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/infrastructure/device/Haptics.ts)
- [`src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts)
- [`src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts)
- [`src/ui/App.tsx`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/ui/App.tsx)
- [`src/ui/components/Header.tsx`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/ui/components/Header.tsx)
- [`src/ui/components/StickyBottomBar.tsx`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/ui/components/StickyBottomBar.tsx)
- [`src/ui/styles.css`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/ui/styles.css)
- [`tests/domain/ShoppingSession.test.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/tests/domain/ShoppingSession.test.ts)
- [`tests/domain/ShoppingList.test.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/tests/domain/ShoppingList.test.ts)
- [`tests/infrastructure/device/Haptics.test.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/tests/infrastructure/device/Haptics.test.ts)
- [`tests/infrastructure/persistence/LocalStorageShoppingSessionRepository.test.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/tests/infrastructure/persistence/LocalStorageShoppingSessionRepository.test.ts)
- [`tests/infrastructure/persistence/SqliteShoppingSessionRepository.test.ts`](file:///Users/joseviccaro/Desktop/CestaCuenta/tests/infrastructure/persistence/SqliteShoppingSessionRepository.test.ts)
- [`openspec/changes/live-budget-control/tasks.md`](file:///Users/joseviccaro/Desktop/CestaCuenta/openspec/changes/live-budget-control/tasks.md)

### Created Files:
- [`src/ui/components/SetBudgetModal.tsx`](file:///Users/joseviccaro/Desktop/CestaCuenta/src/ui/components/SetBudgetModal.tsx)
- [`tests/ui/SetBudgetModal.test.tsx`](file:///Users/joseviccaro/Desktop/CestaCuenta/tests/ui/SetBudgetModal.test.tsx)
- [`tests/ui/StickyBottomBar.test.tsx`](file:///Users/joseviccaro/Desktop/CestaCuenta/tests/ui/StickyBottomBar.test.tsx)
- [`tests/ui/Header.test.tsx`](file:///Users/joseviccaro/Desktop/CestaCuenta/tests/ui/Header.test.tsx)
- [`tests/ui/App.test.tsx`](file:///Users/joseviccaro/Desktop/CestaCuenta/tests/ui/App.test.tsx)
- [`openspec/changes/live-budget-control/apply-progress.md`](file:///Users/joseviccaro/Desktop/CestaCuenta/openspec/changes/live-budget-control/apply-progress.md)
