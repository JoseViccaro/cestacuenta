# Exploration: live-budget-control

## Exploration: Live Budget Limit Control with Proactive Warnings, Visual Gauge, and Margin Calculation

### Current State
CestaCuenta provides a real-time running basket calculation with barcode scanning, shelf-tag OCR, product catalog lookups, and shopping list synchronization. However, shoppers currently have **no live budget tracking**:
- **`ShoppingSession` aggregate root (`src/domain/entities/ShoppingSession.ts`)**:
  - Encapsulates `id: string`, `startedAt: Date`, `endedAt?: Date`, `status: SessionStatus` (`ACTIVE` | `COMPLETED` | `DISCARDED`), `storeName?: string`, and `_items: CartItem[]`.
  - Calculates `total(): Money` and `totalItemCount(): number`.
  - **Limitation**: Has no concept of a spending limit, remaining headroom, over-budget margin, or status classification (`NORMAL`, `WARNING`, `EXCEEDED`).
- **`Money` value object (`src/domain/value-objects/Money.ts`)**:
  - Uses strictly non-negative integer cents (`cents < 0` throws an error).
  - Calling `subtract(other)` throws if `this.cents < other.cents` (subtraction resulting in negative values is prohibited by domain invariants).
  - **Constraint**: Any budget calculation that computes "remaining balance" or "exceeded amount" cannot simply subtract `total` from `budgetLimit` when `total > budgetLimit`; it must defensively compare cents or compute positive deficits.
- **`ShoppingList` aggregate root (`src/domain/entities/ShoppingList.ts`)**:
  - Tracks items with `isChecked: boolean` and provides `progress(): { total, completed, percentage }`.
  - **Limitation**: Does not expose an explicit `pendingCount()` method, requiring consumers to manually calculate `total - completed` or filter unchecked items.
- **Persistence Layer**:
  - `LocalStorageShoppingSessionRepository` (`src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts`):
    - Serializes sessions into `SerializedShoppingSession` which currently omits budget fields.
  - `SqliteShoppingSessionRepository` (`src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts`):
    - Table `shopping_sessions` has columns `(id, started_at, ended_at, status, store_name)`. It lacks a column for `budget_limit_cents`.
- **Device Haptics (`src/infrastructure/device/Haptics.ts`)**:
  - Exposes `triggerScanSuccess()` (100ms vibration + 1760 Hz beep) and `triggerVoiceCue(type)` (30/40ms vibration + 440/880 Hz tone).
  - Safe in SSR/headless environments with fallback guards.
  - **Limitation**: Lacks distinct multi-pulse vibration patterns or auditory tones for budget threshold warnings (80%) or budget exceeded (100%).
- **UI Components**:
  - `StickyBottomBar.tsx` (`src/ui/components/StickyBottomBar.tsx`):
    - Displays estimated total, item count pill, and buttons for `Escanear` and `+ Manual`.
    - **Limitation**: Does not display budget progress, remaining margin, or visual alert gauges.
  - `Header.tsx` (`src/ui/components/Header.tsx`):
    - Displays store name, line count, item count, search toggle, install button, shopping list button, history button, and clear/finish actions.
    - **Limitation**: Provides no quick-action button or badge to inspect or edit the shopping budget limit.
  - `App.tsx` (`src/ui/App.tsx`):
    - Orchestrates cart mutations, persistence commits, and toast notifications.
    - **Limitation**: Lacks state management for budget modal, threshold crossing detection, and proactive haptic dispatching.

---

### Affected Areas

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     Domain Layer                                       │
│                                                                                        │
│  ┌────────────────────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │             ShoppingSession            │  │             ShoppingList             │  │
│  │   • budgetLimit?: Money                │  │   • pendingCount(): number           │  │
│  │   • setBudgetLimit(limit)              │  │   • (Unchecked items count for       │  │
│  │   • budgetMetrics(pendingCount)        │  │     remaining margin calculation)    │  │
│  │   • BudgetStatus ('NORMAL'|'WARNING'|  │  └──────────────────────────────────────┘  │
│  │                   'EXCEEDED')          │                                            │
│  └───────────────────▲────────────────────┘                                            │
└──────────────────────┼─────────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────┼─────────────────────────────────────────────────────────────────┐
│                      │                 Infrastructure Layer                            │
│  ┌───────────────────┴────────────────────┐  ┌──────────────────────────────────────┐  │
│  │      ShoppingSession Repository        │  │                Haptics               │  │
│  │   • LocalStorage: budgetLimitCents     │  │   • triggerBudgetWarning() (>= 80%)  │  │
│  │   • SQLite: budget_limit_cents column  │  │   • triggerBudgetExceeded() (> 100%) │  │
│  │     with auto-migration check          │  │     (Multi-pulse vibration & audio)  │  │
│  └───────────────────▲────────────────────┘  └──────────────────▲───────────────────┘  │
└──────────────────────┼──────────────────────────────────────────┼──────────────────────┘
                       │                                          │
┌──────────────────────┼──────────────────────────────────────────┼──────────────────────┐
│                      │                       UI Layer                   │              │
│  ┌───────────────────┴──────────────────────────────────────────┴───────────────────┐  │
│  │                                       App.tsx                                    │  │
│  │   • State: isBudgetModalOpen                                                     │  │
│  │   • Edge-triggered threshold transition detector (fires haptics only on change)   │  │
│  │   • Toast alerts on warning / exceeded boundary crossings                        │  │
│  └───────────┬───────────────────────────────┬──────────────────────────────┬───────┘  │
│              │                               │                              │          │
│              ▼                               ▼                              ▼          │
│  ┌────────────────────────┐      ┌────────────────────────┐     ┌───────────────────┐  │
│  │         Header         │      │     StickyBottomBar    │     │   SetBudgetModal  │  │
│  │   • Budget badge / pill│      │   • Visual progress bar│     │   • Presets & num │  │
│  │   • Quick trigger to   │      │   • Headroom / deficit │     │   • Headroom / list   │
│  │     open SetBudgetModal│      │   • Margin / item chip │     │     margin preview│  │
│  └────────────────────────┘      └────────────────────────┘     └───────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed File Impact Breakdown
1. **`src/domain/entities/ShoppingSession.ts`**:
   - Add `budgetLimit?: Money` to `ShoppingSessionProps` and class field.
   - Add `setBudgetLimit(limit: Money | null | undefined): void` enforcing `this.ensureActive()`.
   - Export `BudgetStatus = 'NONE' | 'NORMAL' | 'WARNING' | 'EXCEEDED'`.
   - Export `BudgetMetrics` interface:
     - `limit: Money`
     - `total: Money`
     - `remaining: Money` (positive remaining headroom, zero if exceeded)
     - `overBudget: Money` (positive exceeded amount, zero if within budget)
     - `percentage: number` (integer ratio `Math.round((total.cents / budgetLimit.cents) * 100)`)
     - `status: BudgetStatus`
     - `marginPerPendingItem: Money | null`
   - Implement `budgetMetrics(pendingItemCount?: number): BudgetMetrics | null`.
   - Implement `budgetStatus(): BudgetStatus`.
2. **`src/domain/entities/ShoppingList.ts`**:
   - Add `pendingCount(): number` helper returning `this._items.filter(item => !item.isChecked).length`.
3. **`src/domain/value-objects/Money.ts`**:
   - Ensure calculations avoid `subtract` when subtrahend is greater than minuend.
4. **`src/domain/index.ts`**:
   - Re-export `BudgetStatus` and `BudgetMetrics`.
5. **`src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts`**:
   - Update `SerializedShoppingSession` with `budgetLimitCents?: number | null`.
   - Update `serializeSession` to serialize `session.budgetLimit?.cents`.
   - Update `deserializeSession` to deserialize `Money.fromCents(data.budgetLimitCents)` when defined.
6. **`src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts`**:
   - Add `budget_limit_cents INTEGER` column to `shopping_sessions` schema creation.
   - Add graceful column migration `ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER` in `initDatabase()`.
   - Update `upsertSessionStmt`, `selectActiveSessionStmt`, `selectSessionByIdStmt`, `selectHistoryStmt`, and `hydrateSession`.
7. **`src/infrastructure/device/Haptics.ts`**:
   - Add `triggerBudgetWarning(): boolean`:
     - Double haptic pulse: `navigator.vibrate([120, 80, 120])`.
     - Dual-tone audio cue: 660 Hz -> 587 Hz (distinct attention tone).
   - Add `triggerBudgetExceeded(): boolean`:
     - Triple urgent pulse: `navigator.vibrate([200, 100, 200, 100, 200])`.
     - Alert audio cue: 440 Hz -> 330 Hz (urgent lower pitch alert).
8. **`src/ui/components/StickyBottomBar.tsx`**:
   - Integrate visual gauge bar when budget is configured.
   - Display remaining budget amount or over-budget alert.
   - Display dynamic margin per pending shopping list item (`~X,XX €/ítem pendiente`).
   - Add accessible ARIA attributes (`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`).
   - Add touch trigger to open `SetBudgetModal`.
9. **`src/ui/components/Header.tsx`**:
   - Add budget pill button showing budget limit status or "+ Presupuesto".
   - Color code badge according to `BudgetStatus` (neutral/green, amber, red).
10. **`src/ui/components/SetBudgetModal.tsx` (New Component)**:
    - Dedicated modal dialog with quick budget preset chips (e.g., 20 €, 30 €, 50 €, 75 €, 100 €).
    - Custom numeric input with decimal parsing.
    - Live breakdown: current cart total, headroom remaining, and projected spending margin per item based on active shopping list.
    - Actions to Save, Clear, and Cancel.
11. **`src/ui/App.tsx`**:
    - Manage `isBudgetModalOpen` state.
    - Provide `handleSetBudgetLimit(limit: Money | null)`.
    - Implement threshold transition tracker (`lastBudgetStatusRef`) to execute proactive warnings (haptics + toast) strictly when crossing threshold boundaries upward (`NORMAL` -> `WARNING`, `WARNING` -> `EXCEEDED`).
12. **`src/ui/styles.css`**:
    - Add styles for `.budget-gauge`, `.budget-progress-track`, `.budget-progress-fill`, `.budget-badge`, `.budget-margin-pill`, and modal layout.

---

### Approaches

#### 1. Domain Modeling & Calculation Architecture

##### Approach A: Aggregate Root Method & Embedded Types (Recommended)
- **Concept**: `ShoppingSession` stores `budgetLimit?: Money` and encapsulates budget logic in `budgetMetrics(pendingItemCount?: number): BudgetMetrics | null`.
- **Pros**:
  - Adheres directly to DDD principles: spending limit is an intrinsic attribute and policy of the shopping session aggregate.
  - Highly cohesive: calculating total and comparing against limit happens within the aggregate boundary.
  - Trivial unit testing: domain unit tests verify all edge cases without mocking external services or React contexts.
- **Cons**:
  - `ShoppingSession` receives a primitive scalar count (`pendingItemCount`) for margin computation rather than a direct reference to `ShoppingList`. (This is actually beneficial as it preserves aggregate decoupling!)

##### Approach B: Standalone Domain Service `BudgetEvaluationService`
- **Concept**: Create `src/domain/services/BudgetEvaluationService.ts` that takes `ShoppingSession` and optional `ShoppingList` and computes metrics.
- **Pros**:
  - Keeps `ShoppingSession` strictly focused on item collections.
- **Cons**:
  - Over-engineering for pure arithmetic comparisons.
  - Requires instantiating or passing an extra service across React components.

##### Approach C: UI-Level Calculation Hook (`useBudgetGauge`)
- **Concept**: Compute budget metrics purely inside a custom React hook in `src/ui/hooks/useBudgetGauge.ts`.
- **Pros**:
  - Less domain code to touch.
- **Cons**:
  - Violates project architecture guidelines (`openspec/config.yaml`: "Keep domain pure with no external or React dependencies; core business calculations belong in domain").
  - Untestable in CLI/Vitest without full React rendering harnesses.

#### 2. Proactive Warning & Haptic Triggering Mechanics

##### Approach A: Edge-Triggered Transition Detection (Recommended)
- **Concept**: In `App.tsx`, maintain a `lastBudgetStatusRef = useRef<BudgetStatus>('NONE')`. When session state updates:
  - If previous status was `< WARNING` and new status is `WARNING`: trigger `Haptics.triggerBudgetWarning()` and display warning toast.
  - If previous status was `< EXCEEDED` and new status is `EXCEEDED`: trigger `Haptics.triggerBudgetExceeded()` and display urgent toast.
  - If status transitions downward (e.g. user removes an item or increases the budget): update ref silently without vibrations.
- **Pros**:
  - Eliminates "notification fatigue": user is not harassed with vibrations on every subsequent item added while already above 80% or 100%.
  - Predictable, tactile feedback exactly at critical decision moments.
- **Cons**:
  - Requires maintaining a React ref synchronized with session reloads and initial hydration.

##### Approach B: Level-Triggered Warning
- **Concept**: Fire vibration on every item scan/addition whenever `status === 'WARNING'` or `status === 'EXCEEDED'`.
- **Pros**:
  - Simpler state tracking.
- **Cons**:
  - Terrible user experience; repeatedly vibrates with loud audio tones for every single additional grocery scanned while shopping over budget.

#### 3. Visual Gauge & UI Integration

##### Approach A: Dual-Touchpoint Layout (StickyBottomBar Gauge + Header Badge + SetBudgetModal) (Recommended)
- **Concept**:
  - In `StickyBottomBar`: Place a compact progress bar right above the total display card. The track displays visual fill percentage (capped at 100% with color transition: green <80%, amber 80-100%, red >100%). Beneath it, display remaining euros and margin per pending item. Tapping the gauge opens `SetBudgetModal`.
  - In `Header`: Add a budget badge button showing budget state. If no budget is set, displays "+ Presupuesto"; if set, displays `Presupuesto: XX €` with status dot.
  - In `SetBudgetModal`: Dedicated bottom sheet with presets and margin preview.
- **Pros**:
  - Instant visibility at all times without taking up vertical scroll space in `CartList`.
  - Margin per item gives immediate context while glancing at the cart.
  - Accessible via both the bottom bar and top header.
- **Cons**:
  - Adds ~36px height to `StickyBottomBar` when active; bottom padding on `.main-content` must accommodate this cleanly.

##### Approach B: Dedicated Card Inside CartList Scroll Area
- **Concept**: Insert a budget banner card inside the scrollable cart list (similar to `ShoppingListBanner`).
- **Pros**:
  - Does not change `StickyBottomBar` height.
- **Cons**:
  - Scrolls out of view when user has more than 4 items in the cart! Defeats the purpose of *live*, persistent budget control while walking down supermarket aisles.

---

### Recommendation
Adopt **Approach 1A** (Domain-Centric Aggregate Root Method), **Approach 2A** (Edge-Triggered Transition Detection), and **Approach 3A** (Dual-Touchpoint UI with StickyBottomBar Visual Gauge + Header Badge + SetBudgetModal):

1. **Domain**:
   - Add `budgetLimit?: Money` to `ShoppingSession`.
   - Provide `setBudgetLimit(limit: Money | null | undefined): void`.
   - Implement `budgetMetrics(pendingItemCount?: number): BudgetMetrics | null` with exact status boundaries:
     - `NONE`: No budget set.
     - `NORMAL`: `total.cents < 0.8 * budgetLimit.cents` (< 80%).
     - `WARNING`: `0.8 * budgetLimit.cents <= total.cents <= budgetLimit.cents` (80% - 100%).
     - `EXCEEDED`: `total.cents > budgetLimit.cents` (> 100%).
   - Calculate remaining margin per pending shopping list item:
     - If `pendingItemCount > 0` and `remaining.cents > 0`: `Money.fromCents(Math.floor(remaining.cents / pendingItemCount))`.
     - If `remaining.cents === 0` (exceeded or reached): `Money.zero()`.
   - Add `ShoppingList.pendingCount(): number` convenience getter.
2. **Persistence**:
   - Update `LocalStorageShoppingSessionRepository` to serialize and hydrate `budgetLimitCents`.
   - Update `SqliteShoppingSessionRepository` schema with `budget_limit_cents INTEGER` and automatic table migration check.
3. **Hardware / Haptics**:
   - Add `Haptics.triggerBudgetWarning()` (double pulse: `[120, 80, 120]` + warning audio tone).
   - Add `Haptics.triggerBudgetExceeded()` (triple pulse: `[200, 100, 200, 100, 200]` + alert audio tone).
4. **UI & UX**:
   - Implement `SetBudgetModal` with presets (`20€`, `30€`, `50€`, `75€`, `100€`), clear option, and live calculation preview.
   - Implement live visual gauge in `StickyBottomBar` with animated progress fill and margin pill.
   - Implement quick budget button and status badge in `Header`.
   - Implement edge-triggered threshold transition detector in `App.tsx` with haptics and toast notifications.

---

### Risks
| Risk | Severity | Mitigation Strategy |
|---|---|---|
| **Negative Money Subtraction** | High | `Money.subtract()` throws if minuend < subtrahend. The budget logic must never call `budgetLimit.subtract(total)` when `total > budgetLimit`. Instead, check `total.cents <= budgetLimit.cents` and compute `remaining` vs `overBudget` safely. |
| **Haptic Spam & Shopper Annoyance** | Medium | Use edge-triggered transition tracking via React ref. Vibrate strictly when crossing the 80% or 100% threshold upward, never on repeated additions within the same status. |
| **Database Schema Incompatibility** | Medium | Existing SQLite databases created without `budget_limit_cents` column could fail queries. Execute a safe `ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER` inside a try/catch during repository initialization. |
| **LocalStorage Legacy Data** | Low | Existing JSON sessions in `localStorage` have no `budgetLimitCents`. Deserializer must check `typeof data.budgetLimitCents === 'number'` and safely assign `undefined` otherwise. |
| **Zero Budget Boundary Case** | Low | Setting a budget of 0,00 € should be prevented or treated as clearing the budget in `SetBudgetModal` validation. |
| **Layout Shift in StickyBottomBar** | Low | Maintain consistent height and use CSS transitions for smooth appearance when a budget is set or cleared. Ensure `.main-content` bottom padding adapts so the last cart item is never hidden behind the bar. |

---

### Ready for Proposal
All affected areas, architectural boundaries, edge cases, and design choices have been thoroughly investigated. The codebase is clean, all 384 existing Vitest tests are passing, and the proposed changes maintain 100% backward compatibility. Ready to proceed to `sdd-propose` to generate the formal OpenSpec proposal and delta specifications.
