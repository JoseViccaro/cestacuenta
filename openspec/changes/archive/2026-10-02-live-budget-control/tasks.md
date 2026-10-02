# Tasks: Live Budget Control (`live-budget-control`)

## Overview & Delivery Strategy

- **Change ID**: `live-budget-control`
- **Delivery Strategy**: `single-pr` (Cohesive, atomic delivery across Domain, Infrastructure, and UI layers with zero-downtime persistence migrations)
- **TDD Requirement**: Strict TDD (`[RED]` failing unit tests $\rightarrow$ `[GREEN]` minimal implementation $\rightarrow$ `[REFACTOR]` cleanup and verification)

---

## Review Workload Forecast

| Component / File | Type | Est. Prod LoC | Est. Test LoC | Complexity | Risk |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `src/domain/entities/ShoppingSession.ts` | Modification | +65 | - | Medium | Low |
| `tests/domain/ShoppingSession.test.ts` | Test Additions | - | +130 | Medium | Low |
| `src/domain/entities/ShoppingList.ts` | Modification | +8 | - | Low | Low |
| `tests/domain/ShoppingList.test.ts` | Test Additions | - | +25 | Low | Low |
| `src/domain/index.ts` | Export Additions | +2 | - | Very Low | None |
| `src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts` | Modification | +20 | - | Low | Low |
| `tests/infrastructure/persistence/LocalStorageShoppingSessionRepository.test.ts` | Test Additions | - | +65 | Low | Low |
| `src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts` | Modification | +35 | - | Medium | Medium |
| `tests/infrastructure/persistence/SqliteShoppingSessionRepository.test.ts` | Test Additions | - | +85 | Medium | Low |
| `src/infrastructure/device/Haptics.ts` | Modification | +85 | - | Medium | Low |
| `tests/infrastructure/device/Haptics.test.ts` | Test Additions | - | +55 | Low | Low |
| `src/ui/components/SetBudgetModal.tsx` | New Component | +180 | - | Medium | Low |
| `tests/ui/SetBudgetModal.test.tsx` | New Test Suite | - | +130 | Medium | Low |
| `src/ui/components/StickyBottomBar.tsx` | Modification | +45 | - | Low | Low |
| `tests/ui/StickyBottomBar.test.tsx` | New Test Suite | - | +85 | Low | Low |
| `src/ui/components/Header.tsx` | Modification | +35 | - | Low | Low |
| `tests/ui/Header.test.tsx` | New Test Suite | - | +75 | Low | Low |
| `src/ui/App.tsx` | Modification | +60 | - | Medium | Medium |
| `tests/ui/App.test.tsx` | New Test Suite | - | +120 | Medium | Low |
| `src/ui/styles.css` | Stylesheet Additions | +140 | - | Low | Low |
| **Total Forecast** | | **~675 LoC** | **~770 LoC** | **Overall: Medium** | **Overall: Low** |

---

## Suggested Work Units

1. **Work Unit 1: Domain - ShoppingSession Budget Properties, Invariants & Calculations**
   - Pure domain business logic with zero framework or platform dependencies.
   - Encapsulate optional `budgetLimit?: Money` in `ShoppingSession` aggregate root.
   - Add `setBudgetLimit(limit: Money | null | undefined): void` enforcing active session invariants (`ensureActive()`) and positive cents.
   - Implement `budgetStatus(): BudgetStatus` (`'NONE'`, `'NORMAL'`, `'WARNING'`, `'EXCEEDED'`) with exact threshold boundaries (<80% normal, 80%-100% warning, >100% exceeded).
   - Implement `budgetMetrics(pendingItemCount?: number): BudgetMetrics | null` with defensive money arithmetic avoiding negative cents subtraction crashes.
   - Add `pendingCount(): number` to `ShoppingList` for unchecked items, maintaining loose aggregate coupling via primitive numbers.
   - Re-export domain types in `src/domain/index.ts`.

2. **Work Unit 2: Infrastructure - Persistence Backward Compatibility & Haptics Sensory Feedback**
   - Add optional `budgetLimitCents?: number | null` to LocalStorage DTO and safely hydrate legacy sessions missing this field.
   - Add nullable column `budget_limit_cents INTEGER` to SQLite schema and execute safe, idempotent `ALTER TABLE` migration in `initDatabase()`.
   - Update SQLite statements (`upsertSession`, `selectActiveSession`, `selectSessionById`, `selectHistory`) and `hydrateSession`.
   - Implement `Haptics.triggerBudgetWarning()` (double pulse `[120, 80, 120]` and attention tone 660 Hz $\rightarrow$ 587 Hz).
   - Implement `Haptics.triggerBudgetExceeded()` (urgent triple pulse `[200, 100, 200, 100, 200]` and alert tone 440 Hz $\rightarrow$ 330 Hz).
   - Safe fallbacks for headless environments, SSR, and devices lacking vibration/audio APIs.

3. **Work Unit 3: UI - SetBudgetModal, StickyBottomBar Gauge, Header Budget Chip & App Edge-Triggered Transitions**
   - Create `SetBudgetModal` bottom sheet with quick preset chips (`20 €`, `30 €`, `50 €`, `75 €`, `100 €`), custom decimal entry, live headroom and pending item margin preview, and clear budget option.
   - Enhance `StickyBottomBar` with accessible progress bar gauge (`role="progressbar"`), color-coded tracks, headroom readout, pending item margin chip, and tap trigger.
   - Enhance `Header` with interactive budget pill action button displaying status dot and cap amount.
   - Update `App.tsx` state management: `isBudgetModalOpen`, session cloning in `commitSession` preserving `budgetLimit`, and `lastBudgetStatusRef` transition detector firing sensory cues strictly upon upward threshold crossing.

4. **Work Unit 4: Styles & Full Verification**
   - CSS styling in `src/ui/styles.css` adhering to existing design tokens, progress bar animations, status color coding, and 48px touch targets for mobile usability.
   - Run complete test suite (`vitest run`), strict TypeScript checking (`tsc --noEmit`), and production bundle build (`tsc && vite build`).

---

## Phased Implementation Tasks

### Phase 1: Domain Layer (Pure Invariants & Budget Calculations)

- [x] 1.1 **[RED]** Add unit tests in `tests/domain/ShoppingSession.test.ts` for budget management and metrics
  - Test `ShoppingSession` initializes with `budgetLimit === undefined` by default.
  - Test `ShoppingSession.create()` and `new ShoppingSession({ budgetLimit })` assign `budgetLimit` correctly.
  - Test `setBudgetLimit(limit: Money)` updates `budgetLimit` on an active session.
  - Test `setBudgetLimit(null)` and `setBudgetLimit(undefined)` clear `budgetLimit` to `undefined`.
  - Test active session invariant: `setBudgetLimit` throws `Error('Cannot modify session: session is already COMPLETED')` or `DISCARDED`.
  - Test non-positive validation: `setBudgetLimit(Money.fromCents(0))` throws `Error('Budget limit must be greater than zero')`.
  - Test type check: `setBudgetLimit('invalid' as unknown as Money)` throws `Error('budgetLimit must be an instance of Money')`.
  - Test `budgetStatus()` returns `'NONE'` when no budget is configured.
  - Test `budgetStatus()` returns `'NORMAL'` when cart total is strictly below 80% of budget.
  - Test exact threshold boundary: 100 € budget with 79,99 € total returns `'NORMAL'`.
  - Test exact threshold boundary: 100 € budget with 80,00 € total returns `'WARNING'`.
  - Test exact threshold boundary: 100 € budget with 100,00 € total returns `'WARNING'`.
  - Test exact threshold boundary: 100 € budget with 100,01 € total returns `'EXCEEDED'`.
  - Test `budgetMetrics()` returns `null` when no budget limit is configured.
  - Test `budgetMetrics()` percentage integer calculation: `Math.round((total.cents / budgetLimit.cents) * 100)`.
  - Test defensive arithmetic: when cart total > budget limit, `remaining` is `Money.zero()` and `overBudget = total.subtract(limit)` without throwing negative money subtraction errors.
  - Test dynamic pending item margin: 30,00 € remaining with 4 pending items yields `7,50 €/ítem` (`Math.floor(3000 / 4) = 750`).
  - Test dynamic pending item margin: exceeded budget with pending items yields `0,00 €/ítem` (`Money.zero()`).
  - Test dynamic pending item margin: 0 pending items or undefined count yields `null`.
- [x] 1.2 **[GREEN]** Implement budget properties and calculation methods in `src/domain/entities/ShoppingSession.ts`
  - Define and export `BudgetStatus = 'NONE' | 'NORMAL' | 'WARNING' | 'EXCEEDED'`.
  - Define and export `BudgetMetrics` interface (`limit`, `total`, `remaining`, `overBudget`, `percentage`, `status`, `marginPerPendingItem`).
  - Extend `ShoppingSessionProps` with `budgetLimit?: Money`.
  - Add private `_budgetLimit?: Money` field and `get budgetLimit(): Money | undefined` getter.
  - Implement `setBudgetLimit(limit: Money | null | undefined): void` enforcing `ensureActive()`, instance check, and `cents > 0`.
  - Implement `budgetStatus(): BudgetStatus` evaluating total cents against limit cents and 80% warning threshold.
  - Implement `budgetMetrics(pendingItemCount?: number): BudgetMetrics | null` with safe non-negative headroom/deficit arithmetic and integer floor division for pending margins.
- [x] 1.3 **[RED]** Add unit tests for `ShoppingList.pendingCount()` in `tests/domain/ShoppingList.test.ts`
  - Test `pendingCount()` returns `0` on an empty shopping list.
  - Test `pendingCount()` returns total item count when all items are unchecked.
  - Test `pendingCount()` decrements as items are checked off.
  - Test `pendingCount()` returns `0` when all items are checked.
- [x] 1.4 **[GREEN]** Implement `pendingCount(): number` in `src/domain/entities/ShoppingList.ts`
  - Return `this._items.filter((item) => !item.isChecked).length`.
- [x] 1.5 **[GREEN]** Verify domain exports in `src/domain/index.ts`
  - Ensure `BudgetStatus` and `BudgetMetrics` are exported from domain barrel.
- [x] 1.6 **[REFACTOR]** Run domain tests (`npx vitest run tests/domain`) and ensure 100% pass rate.

---

### Phase 2: Infrastructure Layer (Persistence Backward Compatibility & Haptics)

- [x] 2.1 **[RED]** Add unit tests in `tests/infrastructure/persistence/LocalStorageShoppingSessionRepository.test.ts`
  - Test saving an active session with `budgetLimit` persists `budgetLimitCents` in JSON.
  - Test hydrating an active session with `budgetLimitCents` restores `Money.fromCents(data.budgetLimitCents)`.
  - Test legacy session JSON lacking `budgetLimitCents` hydrates safely with `budgetLimit === undefined` and `budgetStatus() === 'NONE'`.
  - Test clearing budget limit serializes `budgetLimitCents: undefined` and hydrates as `undefined`.
- [x] 2.2 **[GREEN]** Update `src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts`
  - Add `budgetLimitCents?: number | null` to `SerializedShoppingSession` interface.
  - In `serializeSession()`, map `session.budgetLimit?.cents`.
  - In `deserializeSession()`, verify `typeof data.budgetLimitCents === 'number' && data.budgetLimitCents > 0` before instantiating `Money.fromCents(...)`.
- [x] 2.3 **[RED]** Add unit tests in `tests/infrastructure/persistence/SqliteShoppingSessionRepository.test.ts`
  - Test database migration: initialize database on a pre-existing schema without `budget_limit_cents` column and verify `ALTER TABLE` succeeds without error.
  - Test saving an active session with `budgetLimit` writes integer cents to `budget_limit_cents`.
  - Test fetching session by `getActiveSession()`, `getById()`, and `listHistory()` hydrates `budgetLimit` correctly.
  - Test legacy rows where `budget_limit_cents IS NULL` hydrate with `budgetLimit === undefined`.
- [x] 2.4 **[GREEN]** Update `src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts`
  - Add nullable `budget_limit_cents: number | null` to `ShoppingSessionRow` interface.
  - Add `budget_limit_cents INTEGER` column to `shopping_sessions` table definition in `initDatabase()`.
  - Add safe, idempotent column migration:
    ```sql
    ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER;
    ```
    wrapped in try/catch to seamlessly migrate existing local database files.
  - Update `upsertSessionStmt` to persist `session.budgetLimit?.cents ?? null`.
  - Update `selectActiveSessionStmt`, `selectSessionByIdStmt`, and `selectHistoryStmt` to select `budget_limit_cents`.
  - Update `hydrateSession()` to construct `Money.fromCents(Number(sessionRow.budget_limit_cents))` when not null.
- [x] 2.5 **[RED]** Add unit tests in `tests/infrastructure/device/Haptics.test.ts`
  - Test `Haptics.triggerBudgetWarning()` calls `navigator.vibrate([120, 80, 120])` and returns `true`.
  - Test `Haptics.triggerBudgetExceeded()` calls `navigator.vibrate([200, 100, 200, 100, 200])` and returns `true`.
  - Test safe execution and `false` return when `navigator.vibrate` is absent or throws an exception.
  - Test safe fallback when `AudioContext` is absent or throws an exception.
- [x] 2.6 **[GREEN]** Implement `triggerBudgetWarning` and `triggerBudgetExceeded` in `src/infrastructure/device/Haptics.ts`
  - Implement `triggerBudgetWarning()`: double vibration pulse `[120, 80, 120]` and dual-tone attention chime (660 Hz $\rightarrow$ 587 Hz).
  - Implement `triggerBudgetExceeded()`: urgent triple vibration pulse `[200, 100, 200, 100, 200]` and alert descending chime (440 Hz $\rightarrow$ 330 Hz).
  - Defensive error handling to ensure non-blocking operation across all platforms and headless test environments.
- [x] 2.7 **[REFACTOR]** Run infrastructure test suite (`npx vitest run tests/infrastructure`) and ensure 100% pass rate.

---

### Phase 3: Presentation / UI Layer (Components & State Coordination)

- [x] 3.1 **[RED]** Create unit test suite `tests/ui/SetBudgetModal.test.tsx`
  - Test returns empty output when `isOpen` is `false`.
  - Test renders modal dialog sheet with title "Presupuesto de compra" when `isOpen` is `true`.
  - Test renders 5 preset chips (`20 €`, `30 €`, `50 €`, `75 €`, `100 €`).
  - Test selecting a preset chip populates numeric input and updates live preview breakdown.
  - Test custom numeric decimal input (`"32,50"` and `"32.50"`) updates live preview calculations.
  - Test live preview shows current cart total, headroom remaining or deficit, and pending item margin.
  - Test submitting form or clicking "Guardar" calls `onSaveBudget` with parsed `Money`.
  - Test clicking "Eliminar presupuesto" (visible when `currentBudget` exists) calls `onSaveBudget(null)`.
  - Test non-positive amount (`0` or negative) disables save or rejects submission.
  - Test clicking "Cancelar" or close button calls `onClose` without modifying budget.
- [x] 3.2 **[GREEN]** Implement `SetBudgetModal.tsx` in `src/ui/components/SetBudgetModal.tsx`
  - Define `SetBudgetModalProps` (`isOpen`, `currentBudget`, `currentTotal`, `pendingItemCount`, `onClose`, `onSaveBudget`).
  - Render bottom sheet modal with backdrop.
  - Implement quick preset buttons (`20 €`, `30 €`, `50 €`, `75 €`, `100 €`) meeting 48px touch targets.
  - Implement controlled input for decimal Euro amounts with comma/dot normalization.
  - Implement live preview box displaying basket total, remaining headroom/over-budget amount, and dynamic pending item margin.
  - Implement actions: "Guardar", "Eliminar presupuesto" (conditional), "Cancelar" / close `✕`.
- [x] 3.3 **[RED]** Create unit test suite `tests/ui/StickyBottomBar.test.tsx`
  - Test does not render `.budget-gauge` when `budgetMetrics` is `null` or `undefined`.
  - Test renders `.budget-gauge` with WAI-ARIA attributes (`role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Progreso del presupuesto"`) when `budgetMetrics` is provided.
  - Test applies status modifier classes: `.budget-gauge--normal`, `.budget-gauge--warning`, `.budget-gauge--exceeded`.
  - Test displays formatted headroom readout (`"Restan X,XX €"` or `"Excedido por X,XX €"`).
  - Test displays pending item margin chip (`"~X,XX €/ítem"`) when `marginPerPendingItem` is present.
  - Test clicking the budget gauge calls `onOpenBudgetModal` callback.
- [x] 3.4 **[GREEN]** Update `StickyBottomBar.tsx` in `src/ui/components/StickyBottomBar.tsx`
  - Extend `StickyBottomBarProps` with `budgetMetrics?: BudgetMetrics | null` and `onOpenBudgetModal?: () => void`.
  - Render `.budget-gauge` bar directly above total price card when `budgetMetrics` is present.
  - Cap visual progress fill width to `Math.min(100, budgetMetrics.percentage)%`.
  - Bind click handler on gauge element to invoke `onOpenBudgetModal`.
- [x] 3.5 **[RED]** Create unit test suite `tests/ui/Header.test.tsx`
  - Test renders `+ Presupuesto` button with wallet icon when `budgetMetrics` is `null` or `undefined`.
  - Test renders formatted budget cap amount and color-coded status indicator dot when `budgetMetrics` is provided.
  - Test clicking budget pill button calls `onOpenBudgetModal` callback.
- [x] 3.6 **[GREEN]** Update `Header.tsx` in `src/ui/components/Header.tsx`
  - Extend `HeaderProps` with `budgetMetrics?: BudgetMetrics | null` and `onOpenBudgetModal?: () => void`.
  - Import `Wallet` icon from `lucide-react`.
  - Render interactive budget pill button (`.budget-pill-btn`) showing `+ Presupuesto` (when empty) or budget cap with `.budget-status-dot`.
  - Bind click handler to `onOpenBudgetModal`.
- [x] 3.7 **[RED]** Create integration test suite `tests/ui/App.test.tsx`
  - Test upward status crossing from `NORMAL` to `WARNING` calls `Haptics.triggerBudgetWarning` and displays warning toast.
  - Test upward status crossing from `WARNING` to `EXCEEDED` calls `Haptics.triggerBudgetExceeded` and displays alert toast.
  - Test subsequent item additions while remaining in `EXCEEDED` do NOT trigger duplicate sensory alerts or toasts.
  - Test downward status transition (item removal) updates status silently without sensory alerts or warning toasts.
  - Test `commitSession` preserves `budgetLimit` on session clones across state updates.
- [x] 3.8 **[GREEN]** Update `App.tsx` in `src/ui/App.tsx`
  - Add state `isBudgetModalOpen` (`useState(false)`).
  - Add `lastBudgetStatusRef = useRef<BudgetStatus>('NONE')`.
  - Compute `pendingItemCount = shoppingList ? shoppingList.pendingCount() : 0` and `budgetMetrics = session ? session.budgetMetrics(pendingItemCount) : null`.
  - Implement edge-triggered `useEffect` monitoring `currentBudgetStatus` and `budgetMetrics` to invoke `Haptics` and toast alerts strictly on upward crossings.
  - Ensure `commitSession(updatedSession)` instantiates cloned session with `budgetLimit: updatedSession.budgetLimit`.
  - Implement `handleSetBudgetLimit(limit: Money | null)` handler.
  - Mount `SetBudgetModal` and pass props to `Header` and `StickyBottomBar`.
- [x] 3.9 **[REFACTOR]** Run UI test suite (`npx vitest run tests/ui`) and ensure 100% pass rate.

---

### Phase 4: Styles, Full Verification & Build Validation

- [x] 4.1 Implement CSS styling in `src/ui/styles.css`
  - Add styles for `.budget-gauge`, `.budget-progress-track`, `.budget-progress-fill`.
  - Add status modifier styles: `.budget-gauge--normal`, `.budget-gauge--warning`, `.budget-gauge--exceeded`.
  - Add styles for headroom text and margin chip: `.budget-headroom-text`, `.budget-margin-chip`.
  - Add styles for Header budget pill: `.budget-pill-btn`, `.budget-status-dot`.
  - Add styles for `SetBudgetModal`: `.preset-chips-grid`, `.preset-chip`, `.budget-preview-box`, `.budget-danger-btn`.
  - Ensure touch targets adhere to $\ge 48\text{px} \times 48\text{px}$ mobile guidelines.
- [x] 4.2 Run complete test suite (`npm test`) and achieve 100% pass rate across all unit, infrastructure, and UI tests.
- [x] 4.3 Run full TypeScript validation (`npx tsc --noEmit`) and verify zero errors.
- [x] 4.4 Run production build (`npm run build`) and verify build artifacts.

---

## Verification & Acceptance Criteria

1. **Invariants & Domain Robustness**:
   - `ShoppingSession.budgetMetrics` never throws negative subtraction errors when cart total exceeds the budget cap.
   - Sessions in `COMPLETED` or `DISCARDED` status reject budget limit modifications.
   - Non-positive budget limit amounts are rejected.
2. **Sensory & Edge-Triggered Guarantees**:
   - `Haptics.triggerBudgetWarning` and `Haptics.triggerBudgetExceeded` fire strictly once upon upward threshold transitions (`< WARNING` $\rightarrow$ `WARNING`, `< EXCEEDED` $\rightarrow$ `EXCEEDED`).
   - Downward transitions and steady states remain completely silent.
3. **Data Integrity & Zero Downtime**:
   - Legacy sessions without budget limits load seamlessly in both Web LocalStorage and SQLite.
   - Active and completed sessions persist and restore `budgetLimit` reliably across reloads.
4. **Ergonomic & Accessible UI**:
   - `StickyBottomBar` gauge renders accessible WAI-ARIA progressbar attributes and color coding.
   - `SetBudgetModal` provides 48px touch targets, quick preset chips, and real-time headroom and item margin preview.
   - Full test suite passes (`npm test`), zero TypeScript errors (`tsc --noEmit`), and clean production build (`npm run build`).
