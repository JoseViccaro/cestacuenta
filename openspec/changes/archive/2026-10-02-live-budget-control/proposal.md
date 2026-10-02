# Proposal: live-budget-control

## Intent

Supermarket shoppers often enter stores with a target spending budget in mind (e.g. 30 €, 50 €, or 100 €), but as they add items to their cart, calculating mental math while navigating aisles is stressful and error-prone. Without live visual feedback or active boundaries, shoppers frequently suffer "checkout surprise" when the register total exceeds what they planned to spend.

This change introduces **live budget limit control** to CestaCuenta:
1. Allows shoppers to set an optional spending cap for active shopping sessions.
2. Calculates real-time financial headroom (`remaining`) or deficit (`overBudget`).
3. Projects a dynamic spending margin per pending shopping list item (e.g. `~3,50 €/ítem pendiente`), helping shoppers pace their remaining purchases.
4. Delivers edge-triggered sensory cues (dual-tone haptic vibration and audio alerts) when crossing warning (80%) and exceeded (100%) thresholds, preventing notification fatigue while keeping shoppers proactively informed.
5. Provides an accessible visual gauge in the sticky bottom bar and a quick-access budget pill in the top header, coupled with an intuitive preset-based modal for instant configuration.

## Scope

### In Scope

- **Domain Layer**:
  - `ShoppingSession` Aggregate Root (`src/domain/entities/ShoppingSession.ts`):
    - Introduce optional `budgetLimit?: Money` to session props and instance state.
    - Add `setBudgetLimit(limit: Money | null | undefined): void` enforcing active session invariants (`ensureActive()`).
    - Define and export `BudgetStatus = 'NONE' | 'NORMAL' | 'WARNING' | 'EXCEEDED'`.
    - Define and export `BudgetMetrics` interface:
      - `limit: Money`
      - `total: Money`
      - `remaining: Money` (positive remaining headroom, zero if exceeded)
      - `overBudget: Money` (positive exceeded amount, zero if within budget)
      - `percentage: number` (integer ratio `Math.round((total.cents / budgetLimit.cents) * 100)`)
      - `status: BudgetStatus`
      - `marginPerPendingItem: Money | null`
    - Implement `budgetMetrics(pendingItemCount?: number): BudgetMetrics | null` containing pure business arithmetic and safe threshold boundaries (<80% normal, 80%-100% warning, >100% exceeded).
    - Implement `budgetStatus(): BudgetStatus` helper.
  - `ShoppingList` Aggregate Root (`src/domain/entities/ShoppingList.ts`):
    - Add convenience method `pendingCount(): number` returning count of unchecked items (`this._items.filter(item => !item.isChecked).length`).
  - Domain Exports (`src/domain/index.ts`):
    - Re-export `BudgetStatus` and `BudgetMetrics`.
- **Infrastructure & Persistence**:
  - `LocalStorageShoppingSessionRepository` (`src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts`):
    - Add `budgetLimitCents?: number | null` to `SerializedShoppingSession`.
    - Serialize `session.budgetLimit?.cents` and deserialize into `Money.fromCents(data.budgetLimitCents)` when present.
  - `SqliteShoppingSessionRepository` (`src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts`):
    - Add nullable `budget_limit_cents INTEGER` column to `shopping_sessions` table definition.
    - Provide automatic backward-compatible schema migration `ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER` in `initDatabase()`.
    - Update query statements (`upsert`, `selectActive`, `selectById`, `selectHistory`) and `hydrateSession`.
  - Device Sensory Feedback (`src/infrastructure/device/Haptics.ts`):
    - Add `triggerBudgetWarning(): boolean` with double vibration pulse (`[120, 80, 120]`) and distinct 660 Hz -> 587 Hz tone.
    - Add `triggerBudgetExceeded(): boolean` with urgent triple pulse (`[200, 100, 200, 100, 200]`) and alert 440 Hz -> 330 Hz tone.
    - Safe fallback in headless, SSR, or unpermitted mobile browser environments.
- **UI & User Experience**:
  - `SetBudgetModal` (`src/ui/components/SetBudgetModal.tsx`):
    - Dedicated modal bottom sheet to configure or remove session budget.
    - Quick-tap preset chips (`20 €`, `30 €`, `50 €`, `75 €`, `100 €`).
    - Custom numeric input with decimal handling and clear button.
    - Live breakdown summary displaying current basket total, remaining headroom, and pending list item margin.
  - `StickyBottomBar` (`src/ui/components/StickyBottomBar.tsx`):
    - Compact visual gauge progress bar mounted directly above the total price card when budget is active.
    - Semantic ARIA attributes (`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`).
    - Smooth color transition (green for `<80%`, amber for `80%-100%`, red for `>100%`).
    - Real-time headroom readout and pending item margin chip (`~X,XX €/ítem`).
    - Tap handler to open `SetBudgetModal`.
  - `Header` (`src/ui/components/Header.tsx`):
    - Add budget pill action button showing budget status or `+ Presupuesto`.
    - Color-coded status indicator dot reflecting current `BudgetStatus`.
    - Tap handler to open `SetBudgetModal`.
  - `App` (`src/ui/App.tsx`):
    - Manage `isBudgetModalOpen` state.
    - Implement `handleSetBudgetLimit(limit: Money | null)`.
    - Track state transitions via `lastBudgetStatusRef` to trigger sensory feedback and toast notifications strictly on upward boundary crossings (`NORMAL` -> `WARNING`, `WARNING` -> `EXCEEDED`).
  - `styles.css` (`src/ui/styles.css`):
    - CSS styling for `.budget-gauge`, `.budget-progress-track`, `.budget-progress-fill`, `.budget-badge`, `.budget-margin-pill`, and modal sheet layouts adhering to existing design tokens and 48px touch targets.
- **Testing**:
  - Unit tests for domain calculations in `ShoppingSession.test.ts`.
  - Unit tests for `ShoppingList.pendingCount()` in `ShoppingList.test.ts`.
  - Repository serialization and migration tests for LocalStorage and SQLite.
  - Component tests for `SetBudgetModal`, `StickyBottomBar`, and `Header`.
  - Transition detection and sensory trigger tests in `App.test.tsx`.

### Out of Scope

- Hard spending stops or blocking checkout/scanning: The system warns the shopper proactively but never prevents scanning or adding items when over budget.
- Category-specific sub-budgets (e.g. 15 € dairy cap vs 20 € meat cap).
- Multi-currency support or dynamic currency conversion (the application operates in Euro/cents).
- External banking integration, credit card sync, or automated expenditure analytics across months.

## Capabilities

### New Capabilities

- `budget-control`: Session budget cap definition, dynamic headroom calculation, edge-triggered sensory warning cues, margin estimation per pending shopping list item, and visual gauge integration.
  - Encapsulates budget limit state within the `ShoppingSession` aggregate root.
  - Computes remaining headroom, deficit, percentage, and budget status (`NONE`, `NORMAL`, `WARNING`, `EXCEEDED`) adhering strictly to `Money` non-negative invariants.
  - Derives dynamic margin per pending shopping list item to inform pacing before reaching checkout.
  - Emits edge-triggered sensory alerts (multi-pulse haptic vibration + dual-tone audio cues) and toast notifications strictly upon threshold crossing.
  - Integrates visual progress bar and interactive badge touchpoints across `StickyBottomBar` and `Header`.

### Modified Capabilities

- *None*

## Approach

1. **Domain-Centric Aggregate Root Encapsulation**:
   - Budget limit is an intrinsic property of a shopping session, not an isolated external setting.
   - `ShoppingSession` owns `budgetLimit?: Money` and computes `budgetMetrics(pendingItemCount?: number)`.
   - Aggregate boundaries remain clean: `ShoppingSession` receives a scalar `pendingItemCount?: number` rather than a direct reference to the `ShoppingList` aggregate, preserving loose coupling.
2. **Defensive `Money` Arithmetic & Invariant Safety**:
   - CestaCuenta's `Money` value object forbids negative cents and throws if `subtract()` yields a negative value.
   - Headroom and over-budget calculations defensively compare raw cents before subtracting:
     - When `total.cents <= budgetLimit.cents`: `remaining = budgetLimit.subtract(total)` and `overBudget = Money.zero()`.
     - When `total.cents > budgetLimit.cents`: `remaining = Money.zero()` and `overBudget = total.subtract(budgetLimit)`.
   - Margin per item avoids division by zero: if `pendingItemCount <= 0` or `remaining.cents === 0`, margin is safely set to `Money.zero()` or `null`.
3. **Edge-Triggered Sensory Transitions**:
   - Alerting shoppers continuously on every item scanned when already over budget produces notification fatigue.
   - In `App.tsx`, an edge detector (`lastBudgetStatusRef`) monitors status transitions:
     - When transition is `< WARNING` -> `WARNING`: trigger `Haptics.triggerBudgetWarning()` and display amber toast (*"Atención: Has alcanzado el 80% de tu presupuesto"*).
     - When transition is `< EXCEEDED` -> `EXCEEDED`: trigger `Haptics.triggerBudgetExceeded()` and display red toast (*"Presupuesto superado: Te has pasado por X,XX €"*).
     - Downward transitions (e.g. deleting an item, reducing quantity, or increasing budget limit) update the ref silently without firing sensory alerts.
4. **Dual-Touchpoint Ergonomic UI**:
   - Shoppers operate devices with one hand while walking supermarket aisles.
   - `StickyBottomBar` hosts a progress bar directly above the cart total, accompanied by remaining balance and pending item margin chip.
   - `Header` contains a quick-access pill indicating current budget status.
   - Tapping either element opens `SetBudgetModal` with touch-friendly 48px preset buttons (`20 €`, `30 €`, `50 €`, `75 €`, `100 €`), direct numeric input, and live calculations before confirmation.
5. **Zero-Downtime Persistence & Schema Evolution**:
   - LocalStorage serialization treats `budgetLimitCents` as optional, ensuring existing sessions deserialize cleanly with `undefined`.
   - SQLite repository executes a safe `ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER` inside `initDatabase()`, handling both fresh installs and existing local databases seamlessly.

## Affected Areas

| Area | Path | Changes |
| :--- | :--- | :--- |
| **Domain** | `src/domain/entities/ShoppingSession.ts` | **Modify**: Add `budgetLimit?: Money`, `setBudgetLimit()`, `budgetMetrics()`, `budgetStatus()`, and types `BudgetStatus`, `BudgetMetrics`. |
| **Domain** | `src/domain/entities/ShoppingList.ts` | **Modify**: Add `pendingCount(): number` helper for unchecked items. |
| **Domain** | `src/domain/index.ts` | **Modify**: Re-export `BudgetStatus` and `BudgetMetrics`. |
| **Persistence** | `src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts` | **Modify**: Serialize and deserialize `budgetLimitCents`. |
| **Persistence** | `src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts` | **Modify**: Add column `budget_limit_cents`, migration statement, query statement mappings, and hydration. |
| **Hardware** | `src/infrastructure/device/Haptics.ts` | **Modify**: Add `triggerBudgetWarning()` and `triggerBudgetExceeded()` with vibration patterns and audio frequencies. |
| **UI Components** | `src/ui/components/SetBudgetModal.tsx` | **New**: Preset selection, numeric input, live headroom/margin breakdown modal. |
| **UI Components** | `src/ui/components/StickyBottomBar.tsx` | **Modify**: Render progress bar gauge, headroom/deficit indicator, and margin chip. |
| **UI Components** | `src/ui/components/Header.tsx` | **Modify**: Add budget pill button with status dot to open modal. |
| **UI Components** | `src/ui/App.tsx` | **Modify**: State management for budget modal, threshold crossing tracker, sensory trigger invocation, and toast alerts. |
| **UI Styles** | `src/ui/styles.css` | **Modify**: CSS styles for budget gauge, progress bar, pill badges, and modal layout. |
| **Tests** | `tests/domain/ShoppingSession.test.ts` | **Modify**: Unit tests for budget limit assignment, metric calculations, and threshold states. |
| **Tests** | `tests/domain/ShoppingList.test.ts` | **Modify**: Unit tests for `pendingCount()` method. |
| **Tests** | `tests/infrastructure/persistence/LocalStorageShoppingSessionRepository.test.ts` | **Modify**: Verify serialization and hydration of budget limit. |
| **Tests** | `tests/infrastructure/persistence/SqliteShoppingSessionRepository.test.ts` | **Modify**: Verify SQLite column migration and persistence of budget limit. |
| **Tests** | `tests/ui/SetBudgetModal.test.tsx` | **New**: Unit tests for budget modal input, presets, and validation. |
| **Tests** | `tests/ui/StickyBottomBar.test.tsx` | **Modify**: Component tests for budget gauge rendering and click interactions. |
| **Tests** | `tests/ui/Header.test.tsx` | **Modify**: Component tests for header budget pill. |
| **Tests** | `tests/ui/App.test.tsx` | **Modify**: Integration tests for threshold crossing alerts and budget persistence. |

## Dependencies

- **Domain Entities & Value Objects**:
  - `ShoppingSession`, `ShoppingList`, `Money`.
- **Infrastructure**:
  - Web Audio API (`AudioContext`) and `navigator.vibrate` via `Haptics.ts`.
  - SQLite (`@capacitor-community/sqlite` or desktop/web SQLite proxy) and Web `localStorage`.
- **UI & Icons**:
  - `lucide-react`: `Wallet`, `AlertTriangle`, `CheckCircle2`, `SlidersHorizontal`, `X`.
- **No external npm runtime dependencies required.**

## Risks & Mitigations

| Risk | Severity | Mitigation Strategy |
| :--- | :--- | :--- |
| **Negative Money Subtraction** | High | `Money.subtract()` throws if minuend < subtrahend. Budget calculations must never call `budgetLimit.subtract(total)` when `total > budgetLimit`. Instead, compare raw cents (`total.cents <= budgetLimit.cents`) and compute `remaining` vs `overBudget` safely. |
| **Sensory Alert Fatigue** | Medium | Use edge-triggered transition tracking via a React ref in `App.tsx`. Vibrate and beep strictly when crossing the 80% or 100% threshold upward, never on repeated additions within the same status. |
| **SQLite Schema Compatibility** | Medium | Existing SQLite databases created without `budget_limit_cents` column could fail queries. Execute a safe `ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER` inside a try/catch during repository initialization. |
| **LocalStorage Legacy Data Hydration** | Low | Existing JSON sessions in `localStorage` lack `budgetLimitCents`. Deserializer checks `typeof data.budgetLimitCents === 'number'` and safely assigns `undefined` otherwise. |
| **Zero or Negative Budget Input** | Low | Setting a budget of `0,00 €` or negative amounts is rejected by `SetBudgetModal` validation. Clearing the budget explicitly sets `budgetLimit` to `null`. |
| **Layout Shift in StickyBottomBar** | Low | Use smooth CSS transitions for the gauge height. Adjust `.main-content` bottom padding so the last item in `CartList` is never obscured by the bottom bar. |

## Rollback Plan

The live budget control feature is backward-compatible and additive:
1. Reverting the commits removes `SetBudgetModal`, the gauge in `StickyBottomBar`, the header pill, and the domain budget methods.
2. In SQLite, the nullable column `budget_limit_cents` is harmless to previous application versions and will simply be ignored.
3. In LocalStorage, previously saved sessions with `budgetLimitCents` will have that key ignored by older deserializers.
4. No user cart data, products, prices, or shopping lists are corrupted or lost upon rollback.

## Success Criteria

- [ ] `ShoppingSession` encapsulates `budgetLimit`, `setBudgetLimit`, and computes `budgetMetrics` accurately across `NORMAL`, `WARNING`, and `EXCEEDED` statuses.
- [ ] Safe `Money` arithmetic guarantees no negative cents exceptions are thrown when cart total exceeds the budget cap.
- [ ] Margin per pending item accurately divides remaining headroom by `ShoppingList.pendingCount()`, displaying zero or null when exceeded or empty.
- [ ] Edge-triggered transitions trigger sensory cues (`Haptics.triggerBudgetWarning` and `Haptics.triggerBudgetExceeded`) and toasts strictly upon upward boundary crossings.
- [ ] `StickyBottomBar` renders an accessible, color-coded visual progress gauge with remaining headroom and item margin.
- [ ] `Header` displays an interactive budget pill reflecting active budget status.
- [ ] `SetBudgetModal` enables one-tap preset selection, custom decimal entry, live headroom preview, and budget removal.
- [ ] Both `LocalStorageShoppingSessionRepository` and `SqliteShoppingSessionRepository` persist and hydrate `budgetLimit` reliably across app reloads.
- [ ] 100% test pass rate across unit, repository, and UI component test suites (`npm test`).
- [ ] Zero TypeScript errors (`npx tsc --noEmit`) and successful production build (`npm run build`).
