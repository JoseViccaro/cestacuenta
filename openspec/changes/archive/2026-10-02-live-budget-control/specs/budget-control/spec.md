# Capability: budget-control

## Purpose
The `budget-control` capability provides real-time financial budget guardrails for shoppers during active shopping sessions in CestaCuenta. It enables shoppers to define an optional spending cap, continuously monitors total basket expenditure against safe threshold boundaries (<80% normal, 80%–100% warning, >100% exceeded), calculates remaining financial headroom or deficit without violating domain money invariants, projects dynamic spending margins per pending shopping list item, and emits edge-triggered sensory feedback (haptics and audio tones) strictly upon upward threshold crossing to prevent overspending without causing notification fatigue.

---

## Requirements

### 1. Budget Configuration and Clearing on Active Shopping Sessions

- **1.1 Session Spending Cap Assignment**:
  - The aggregate root `ShoppingSession` MUST support an optional spending limit represented as `budgetLimit?: Money`.
  - The method `setBudgetLimit(limit: Money | null | undefined): void` MUST allow setting, updating, or clearing the session budget limit.
- **1.2 Active Session Invariant Enforcement**:
  - Any invocation of `setBudgetLimit` MUST verify that the shopping session is in the `ACTIVE` status via `ensureActive()`.
  - If `setBudgetLimit` is invoked on a session whose status is `COMPLETED` or `DISCARDED`, the method MUST throw an `Error` stating that the session cannot be modified.
- **1.3 Input Validation & Value Constraints**:
  - When a `Money` instance is passed to `setBudgetLimit`:
    - The budget limit amount MUST be strictly greater than zero cents (`limit.cents > 0`).
    - If a `Money` instance with `cents <= 0` is supplied, `setBudgetLimit` MUST throw an `Error` indicating that the budget limit must be greater than zero.
  - When `null` or `undefined` is passed to `setBudgetLimit`:
    - The aggregate MUST clear the budget limit, setting `this.budgetLimit = undefined`.
- **1.4 Direct Property Immutability**:
  - Direct external mutation of `budgetLimit` MUST be prevented; state modifications MUST proceed exclusively through aggregate methods.

---

### 2. Status Classification & State Machine

- **2.1 Defined Budget Status States**:
  - The domain MUST define and export the enumeration/union type `BudgetStatus = 'NONE' | 'NORMAL' | 'WARNING' | 'EXCEEDED'`.
- **2.2 State Classification Invariants**:
  - For any active session, the status MUST be determined deterministically by evaluating the session's cumulative total (`total().cents`) against the active `budgetLimit.cents`:
    1. **`NONE`**: The session has no budget limit configured (`budgetLimit` is `undefined` or `null`).
    2. **`NORMAL`**: A budget limit is configured, and `total.cents < Math.round(budgetLimit.cents * 0.8)` (cumulative spending is strictly below 80% of the limit).
    3. **`WARNING`**: A budget limit is configured, and `Math.round(budgetLimit.cents * 0.8) <= total.cents <= budgetLimit.cents` (cumulative spending is at or above 80% but does not exceed 100%).
    4. **`EXCEEDED`**: A budget limit is configured, and `total.cents > budgetLimit.cents` (cumulative spending strictly exceeds 100% of the limit).
- **2.3 Status Evaluation Helper**:
  - `ShoppingSession` MUST provide a helper method `budgetStatus(): BudgetStatus` returning the current status.
- **2.4 Percentage Computation**:
  - When a budget limit is present, the domain MUST compute the spending percentage as an integer ratio:
    $$\text{percentage} = \text{Math.round}\left(\frac{\text{total.cents}}{\text{budgetLimit.cents}} \times 100\right)$$
  - The percentage MUST reflect raw spending progress and MAY exceed 100 when over budget.

---

### 3. Headroom & Deficit Calculation with Safe Non-Negative Money Guarantees

- **3.1 Domain Money Invariant Preservation**:
  - CestaCuenta's `Money` value object forbids negative cents amounts and throws an exception if `subtract()` produces a negative result.
  - The budget calculation MUST defensively evaluate `total.cents` versus `budgetLimit.cents` prior to subtraction and MUST NEVER execute `budgetLimit.subtract(total)` when `total.cents > budgetLimit.cents`.
- **3.2 Headroom Calculation (`remaining`)**:
  - When `total.cents <= budgetLimit.cents`:
    - `remaining` MUST equal `budgetLimit.subtract(total)`.
  - When `total.cents > budgetLimit.cents`:
    - `remaining` MUST equal `Money.zero()`.
- **3.3 Deficit Calculation (`overBudget`)**:
  - When `total.cents <= budgetLimit.cents`:
    - `overBudget` MUST equal `Money.zero()`.
  - When `total.cents > budgetLimit.cents`:
    - `overBudget` MUST equal `total.subtract(budgetLimit)`.
- **3.4 Structured Metrics Return (`BudgetMetrics`)**:
  - The domain MUST export the interface `BudgetMetrics`:
    ```typescript
    export interface BudgetMetrics {
      limit: Money;
      total: Money;
      remaining: Money;
      overBudget: Money;
      percentage: number;
      status: BudgetStatus;
      marginPerPendingItem: Money | null;
    }
    ```
  - `ShoppingSession.budgetMetrics(pendingItemCount?: number): BudgetMetrics | null` MUST return `null` if no budget is configured, or the complete `BudgetMetrics` object if a budget limit is set.

---

### 4. Pending Items Dynamic Margin Calculation

- **4.1 Shopping List Pending Count Inspection**:
  - The `ShoppingList` aggregate root (`src/domain/entities/ShoppingList.ts`) MUST expose a public method `pendingCount(): number`.
  - `pendingCount()` MUST return the count of unchecked items in the list (`this._items.filter(item => !item.isChecked).length`).
- **4.2 Loose Aggregate Coupling**:
  - `ShoppingSession` MUST NOT maintain a direct reference or dependency on `ShoppingList`.
  - `ShoppingSession.budgetMetrics(pendingItemCount?: number)` MUST accept the scalar numeric count of pending items.
- **4.3 Margin Computation Semantics**:
  - When `pendingItemCount` is `undefined`, `null`, or `<= 0`:
    - `marginPerPendingItem` MUST be `null`.
  - When `pendingItemCount > 0` and `remaining.cents === 0` (budget exhausted or exceeded):
    - `marginPerPendingItem` MUST be `Money.zero()`.
  - When `pendingItemCount > 0` and `remaining.cents > 0`:
    - The domain MUST perform integer division with floor semantics:
      $$\text{marginCents} = \text{Math.floor}\left(\frac{\text{remaining.cents}}{\text{pendingItemCount}}\right)$$
    - `marginPerPendingItem` MUST be `Money.fromCents(marginCents)`.
  - The calculation MUST guarantee that multiplying `marginPerPendingItem` by `pendingItemCount` never exceeds `remaining`.

---

### 5. Edge-Triggered Sensory Feedback & Proactive Notifications

- **5.1 Device Sensory Infrastructure (`Haptics`)**:
  - `Haptics.triggerBudgetWarning(): boolean` MUST execute:
    - A distinct double haptic vibration pulse: pattern `[120, 80, 120]`.
    - A distinct attention dual-tone audio chime (e.g. 660 Hz transitioning to 587 Hz).
  - `Haptics.triggerBudgetExceeded(): boolean` MUST execute:
    - An urgent triple haptic vibration pulse: pattern `[200, 100, 200, 100, 200]`.
    - An urgent alert dual-tone audio chime (e.g. 440 Hz transitioning to 330 Hz).
  - Both methods MUST execute safely without throwing errors in environments where `navigator.vibrate` or `AudioContext` is missing or disabled (e.g., SSR, desktop browsers, headless testing).
- **5.2 Edge-Triggered State Transition Tracking**:
  - The UI coordination layer (`App.tsx`) MUST track the previous budget status using a persistent reference (`lastBudgetStatusRef`).
  - Sensory feedback (haptics and audio) and visual toast messages MUST trigger STRICTLY on upward threshold crossings:
    1. **Warning Crossing**: When transitioning from `< WARNING` (`'NONE'` or `'NORMAL'`) to `'WARNING'`:
       - The system MUST call `Haptics.triggerBudgetWarning()`.
       - The system MUST display an amber warning toast: *"Atención: Has alcanzado el 80% de tu presupuesto"*.
    2. **Exceeded Crossing**: When transitioning from `< EXCEEDED` (`'NONE'`, `'NORMAL'`, or `'WARNING'`) to `'EXCEEDED'`:
       - The system MUST call `Haptics.triggerBudgetExceeded()`.
       - The system MUST display a red alert toast: *"Presupuesto superado: Te has pasado por {overBudget}"*.
- **5.3 Downward Transition Silence**:
  - When the budget status transitions downward (e.g. from `'EXCEEDED'` to `'WARNING'` or `'NORMAL'`, or from `'WARNING'` to `'NORMAL'`) due to item deletion, quantity decrement, or budget limit increase:
    - The system MUST update `lastBudgetStatusRef` to the new status.
    - The system MUST NOT trigger haptic vibration or audio alert tones.
- **5.4 Notification Spam Prevention**:
  - When consecutive items are added or modified while the session remains within the same status (e.g., remaining in `'WARNING'` or remaining in `'EXCEEDED'`):
    - The system MUST NOT re-trigger sensory feedback or show repeated threshold toasts.

---

### 6. Persistence & Backward Compatibility

- **6.1 Web LocalStorage Persistence**:
  - `SerializedShoppingSession` MUST include optional property `budgetLimitCents?: number | null`.
  - `LocalStorageShoppingSessionRepository.save()` MUST serialize `session.budgetLimit?.cents` into `budgetLimitCents`.
  - `LocalStorageShoppingSessionRepository.deserializeSession()` MUST safely deserialize `budgetLimitCents`:
    - If `typeof data.budgetLimitCents === 'number'` and `data.budgetLimitCents > 0`: hydrate `Money.fromCents(data.budgetLimitCents)`.
    - Otherwise (missing, `undefined`, or `null`): hydrate `budgetLimit` as `undefined`.
- **6.2 SQLite Persistence & Schema Migration**:
  - The `shopping_sessions` table definition MUST include nullable column `budget_limit_cents INTEGER`.
  - `SqliteShoppingSessionRepository.initDatabase()` MUST execute a safe column migration:
    ```sql
    ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER;
    ```
    enclosed in a try/catch block so that existing SQLite databases migrate automatically without throwing errors on subsequent restarts.
  - Queries (`upsertSessionStmt`, `selectActiveSessionStmt`, `selectSessionByIdStmt`, and `selectHistoryStmt`) and `hydrateSession()` MUST map `budget_limit_cents` to and from `session.budgetLimit`.
- **6.3 Legacy Data Compatibility**:
  - Sessions created prior to this change MUST load without runtime exceptions and operate with `budgetLimit === undefined` and `budgetStatus === 'NONE'`.

---

### 7. Visual Progress Gauge, Status Badges & Interactive UI

- **7.1 Sticky Bottom Bar Visual Gauge (`StickyBottomBar`)**:
  - When an active session has a budget limit configured (`metrics !== null`):
    - A visual progress bar gauge MUST be rendered directly above the total price card.
    - The progress bar element MUST include accessible ARIA attributes:
      - `role="progressbar"`
      - `aria-valuenow={metrics.percentage}`
      - `aria-valuemin={0}`
      - `aria-valuemax={100}`
      - `aria-label="Progreso del presupuesto"`
    - The visual gauge fill width MUST equal `Math.min(100, metrics.percentage)%`.
    - The visual gauge track and fill MUST visually reflect the status:
      - `NORMAL`: Green accent (`var(--primary)`).
      - `WARNING`: Amber warning color (`var(--warning)`).
      - `EXCEEDED`: Red danger color (`var(--danger)`).
    - The gauge MUST display a real-time headroom readout:
      - If `status !== 'EXCEEDED'`: `"Restan " + metrics.remaining.toFormattedString()`.
      - If `status === 'EXCEEDED'`: `"Excedido por " + metrics.overBudget.toFormattedString()`.
    - When `metrics.marginPerPendingItem !== null`, the gauge MUST render a margin chip displaying:
      - `"~" + metrics.marginPerPendingItem.toFormattedString() + "/ítem"` (e.g. `"~3,50 €/ítem"`).
    - Tapping the visual gauge MUST trigger the callback to open `SetBudgetModal`.
  - When no budget limit is configured (`metrics === null`):
    - The visual progress bar gauge MUST NOT be rendered.
- **7.2 Header Budget Pill Action (`Header`)**:
  - `Header` MUST render an interactive budget pill button:
    - When no budget is set:
      - Displays a wallet icon and label `"+ Presupuesto"`.
      - `aria-label="Configurar presupuesto de compra"`.
    - When a budget is set:
      - Displays a wallet icon, the active budget cap (e.g. `"50,00 €"`), and a colored status indicator dot reflecting `BudgetStatus`.
      - `aria-label="Presupuesto: {limit}. Estado: {status}. Toca para modificar."`.
    - Clicking the budget pill button MUST trigger the callback to open `SetBudgetModal`.
- **7.3 Set Budget Modal Sheet (`SetBudgetModal`)**:
  - The modal MUST provide quick-selection preset chips: `20 €`, `30 €`, `50 €`, `75 €`, and `100 €`.
  - The modal MUST provide a numeric text input allowing custom decimal amounts with comma or dot separators.
  - The modal MUST show a live calculation preview displaying:
    - Current basket total.
    - Resulting headroom remaining or deficit if the proposed budget is applied.
    - Projected item margin based on unchecked shopping list items.
  - Validation:
    - Amounts `<= 0 €` or unparseable input MUST disable the "Guardar" button or display an error hint.
  - Modal Actions:
    - "Guardar": calls `onSetBudget(parsedMoney)` and closes modal.
    - "Eliminar presupuesto": visible when a budget was previously active, calls `onSetBudget(null)` and closes modal.
    - "Cancelar" / close button `✕`: dismisses modal without modifying current budget.
- **7.4 Ergonomics & Touch Targets**:
  - All interactive buttons and preset chips MUST have a minimum touch target size of 48px $\times$ 48px to support one-handed mobile supermarket usage.
  - Layout adjustments in `StickyBottomBar` MUST NOT obscure the bottom items in `CartList`.

---

## Scenarios

### Scenario 1: Configuring a Budget Limit on an Active Session
- **Given** an active shopping session with total `15,00 €` and no budget limit
- **When** the user sets a budget limit of `50,00 €` (`Money.fromCents(5000)`)
- **Then** `session.budgetLimit` MUST equal `50,00 €`
- **And** `session.budgetStatus()` MUST return `'NORMAL'`
- **And** `session.budgetMetrics().remaining` MUST equal `35,00 €`
- **And** `session.budgetMetrics().overBudget` MUST equal `0,00 €`
- **And** `session.budgetMetrics().percentage` MUST equal `30`.

### Scenario 2: Clearing an Existing Budget Limit
- **Given** an active shopping session with an active budget limit of `50,00 €`
- **When** the user clears the budget limit by calling `session.setBudgetLimit(null)`
- **Then** `session.budgetLimit` MUST be `undefined`
- **And** `session.budgetStatus()` MUST return `'NONE'`
- **And** `session.budgetMetrics()` MUST return `null`.

### Scenario 3: Rejecting Budget Modifications on Inactive Sessions
- **Given** a shopping session whose status is `'COMPLETED'` or `'DISCARDED'`
- **When** `session.setBudgetLimit(Money.fromCents(5000))` is invoked
- **Then** the invocation MUST throw an `Error` matching `/Cannot modify session/`
- **And** `session.budgetLimit` MUST remain unchanged.

### Scenario 4: Rejecting Non-Positive Budget Amounts
- **Given** an active shopping session
- **When** `session.setBudgetLimit(Money.fromCents(0))` is invoked
- **Then** the invocation MUST throw an `Error` indicating that the budget limit must be greater than zero
- **And** `session.budgetLimit` MUST remain unchanged.

### Scenario 5: Status Transition from Normal to Warning (80% Boundary)
- **Given** an active session with a budget limit of `50,00 €` and current cart total `39,00 €` (78%)
- **And** the current budget status is `'NORMAL'`
- **When** an item priced at `2,00 €` is added, bringing the total to `41,00 €` (82%)
- **Then** `session.budgetStatus()` MUST return `'WARNING'`
- **And** `session.budgetMetrics().percentage` MUST return `82`
- **And** `session.budgetMetrics().remaining` MUST equal `9,00 €`
- **And** the UI edge detector MUST trigger `Haptics.triggerBudgetWarning()`
- **And** the UI MUST display a warning toast *"Atención: Has alcanzado el 80% de tu presupuesto"*.

### Scenario 6: Status Transition from Warning to Exceeded (100% Boundary)
- **Given** an active session with a budget limit of `50,00 €` and cart total `48,00 €` (96%, status `'WARNING'`)
- **When** an item priced at `5,00 €` is added, bringing the total to `53,00 €` (106%)
- **Then** `session.budgetStatus()` MUST return `'EXCEEDED'`
- **And** `session.budgetMetrics().percentage` MUST return `106`
- **And** `session.budgetMetrics().remaining` MUST equal `0,00 €`
- **And** `session.budgetMetrics().overBudget` MUST equal `3,00 €`
- **And** the calculation MUST NOT throw a negative cents subtraction error
- **And** the UI edge detector MUST trigger `Haptics.triggerBudgetExceeded()`
- **And** the UI MUST display an alert toast *"Presupuesto superado: Te has pasado por 3,00 €"*.

### Scenario 7: Exact Threshold Boundary Checks
- **Given** an active session with a budget limit of `100,00 €`
- **When** the cart total is `79,99 €`
- **Then** `session.budgetStatus()` MUST be `'NORMAL'`
- **When** the cart total reaches exactly `80,00 €`
- **Then** `session.budgetStatus()` MUST be `'WARNING'`
- **When** the cart total reaches exactly `100,00 €`
- **Then** `session.budgetStatus()` MUST be `'WARNING'`
- **And** `session.budgetMetrics().remaining` MUST equal `0,00 €`
- **And** `session.budgetMetrics().overBudget` MUST equal `0,00 €`
- **When** the cart total reaches `100,01 €`
- **Then** `session.budgetStatus()` MUST be `'EXCEEDED'`
- **And** `session.budgetMetrics().overBudget` MUST equal `0,01 €`.

### Scenario 8: Dynamic Spending Margin per Pending Item
- **Given** an active session with a budget limit of `50,00 €` and current cart total `20,00 €` (remaining `30,00 €`)
- **And** an active shopping list containing 4 unchecked items (`pendingCount() === 4`)
- **When** `session.budgetMetrics(4)` is evaluated
- **Then** `metrics.marginPerPendingItem` MUST equal `7,50 €` (`Math.floor(3000 / 4) = 750` cents)
- **And** the visual gauge in `StickyBottomBar` MUST display `"~7,50 €/ítem"`.

### Scenario 9: Pending Margin When Budget is Exceeded or Pending Items are Zero
- **Given** an active session with a budget limit of `50,00 €` and current cart total `52,00 €` (status `'EXCEEDED'`)
- **And** an active shopping list with 3 pending items
- **When** `session.budgetMetrics(3)` is evaluated
- **Then** `metrics.marginPerPendingItem` MUST equal `0,00 €` (`Money.zero()`).
- **Given** an active session with remaining budget `20,00 €` and 0 pending items in the shopping list
- **When** `session.budgetMetrics(0)` is evaluated
- **Then** `metrics.marginPerPendingItem` MUST be `null`
- **And** the visual gauge MUST omit the pending margin chip.

### Scenario 10: Silent State Adjustment on Downward Transition
- **Given** an active session currently in `'EXCEEDED'` status with cart total `55,00 €` and budget `50,00 €`
- **When** the user removes an item of `10,00 €`, reducing the total to `45,00 €` (status `'WARNING'`)
- **Then** `session.budgetStatus()` MUST update to `'WARNING'`
- **And** `lastBudgetStatusRef` MUST update to `'WARNING'`
- **And** `Haptics.triggerBudgetWarning()` MUST NOT be called
- **And** `Haptics.triggerBudgetExceeded()` MUST NOT be called
- **And** no threshold warning toast MUST be shown.

### Scenario 11: Suppressing Redundant Alerts on Subsequent Additions within Same Status
- **Given** an active session in `'WARNING'` status with total `42,00 €` on a `50,00 €` budget
- **And** the warning sensory cue has already fired for this status
- **When** the user adds another item of `3,00 €`, bringing the total to `45,00 €` (status remains `'WARNING'`)
- **Then** `session.budgetStatus()` MUST remain `'WARNING'`
- **And** `Haptics.triggerBudgetWarning()` MUST NOT be called again
- **And** no duplicate warning toast MUST be shown.

### Scenario 12: LocalStorage Hydration of Legacy Session Without Budget Limit
- **Given** a JSON serialized session stored in `localStorage` created by an older app version without `budgetLimitCents`:
  ```json
  {
    "id": "legacy-session-1",
    "startedAt": "2026-09-01T10:00:00.000Z",
    "status": "ACTIVE",
    "items": []
  }
  ```
- **When** `LocalStorageShoppingSessionRepository.getActiveSession()` loads the session
- **Then** the hydrated `ShoppingSession` MUST have `budgetLimit === undefined`
- **And** `session.budgetStatus()` MUST return `'NONE'`
- **And** no parsing exception MUST be thrown.

### Scenario 13: LocalStorage Saving and Hydrating Active Session with Budget Limit
- **Given** an active session with budget limit `75,00 €`
- **When** `repository.save(session)` is called
- **Then** the serialized JSON in `localStorage` MUST include `"budgetLimitCents": 7500`
- **When** `repository.getActiveSession()` is called
- **Then** the returned session MUST have `budgetLimit` equal to `Money.fromCents(7500)`.

### Scenario 14: SQLite Schema Migration and Persistence of Budget Limit
- **Given** an existing SQLite database file created without the `budget_limit_cents` column
- **When** `SqliteShoppingSessionRepository` is initialized
- **Then** `initDatabase()` MUST successfully execute `ALTER TABLE shopping_sessions ADD COLUMN budget_limit_cents INTEGER`
- **And** saving a session with budget `60,00 €` MUST persist `6000` into `budget_limit_cents`
- **And** fetching the session by `getById()` or `getActiveSession()` MUST hydrate `session.budgetLimit` with `60,00 €`
- **And** legacy rows where `budget_limit_cents` is `NULL` MUST hydrate with `budgetLimit === undefined`.

### Scenario 15: StickyBottomBar Visual Gauge Rendering and Interaction
- **Given** an active session with total `25,00 €` and budget `50,00 €` (50% progress, status `'NORMAL'`)
- **When** `StickyBottomBar` renders
- **Then** it MUST display a progress bar with `aria-valuenow="50"` and fill width styled to `50%`
- **And** it MUST display the headroom text `"Restan 25,00 €"`
- **When** the user clicks anywhere on the budget gauge
- **Then** `onOpenBudgetModal` callback MUST be invoked.

### Scenario 16: Header Budget Pill Display and Modal Trigger
- **Given** an active session with no budget limit configured
- **When** `Header` renders
- **Then** it MUST display a button with label `"+ Presupuesto"`
- **When** the user clicks `"+ Presupuesto"`
- **Then** the budget configuration modal MUST open
- **When** a budget of `40,00 €` is configured and session status is `'NORMAL'`
- **Then** the button MUST display `"40,00 €"` and render a green status dot.

### Scenario 17: SetBudgetModal Preset Selection and Custom Decimal Input
- **Given** the user opens `SetBudgetModal` with an active cart total of `12,50 €` and 2 pending items
- **When** the user clicks the preset chip `"30 €"`
- **Then** the numeric input MUST update to `"30"`
- **And** the live preview MUST show remaining headroom `"17,50 €"` and margin per item `"~8,75 €/ítem"`
- **When** the user types custom decimal `"32,50"` into the input
- **Then** the live preview MUST immediately recalculate headroom to `"20,00 €"` and margin to `"~10,00 €/ítem"`
- **When** the user clicks "Guardar"
- **Then** `onSetBudget(Money.fromCents(3250))` MUST be called and the modal MUST close.

---

## Data Contracts & Type Definitions

### 1. `BudgetStatus` and `BudgetMetrics` (Domain Types)

```typescript
export type BudgetStatus = 'NONE' | 'NORMAL' | 'WARNING' | 'EXCEEDED';

export interface BudgetMetrics {
  limit: Money;
  total: Money;
  remaining: Money;
  overBudget: Money;
  percentage: number;
  status: BudgetStatus;
  marginPerPendingItem: Money | null;
}
```

### 2. `ShoppingSession` Aggregate Root Enhancements

```typescript
export interface ShoppingSessionProps {
  id?: string;
  startedAt?: Date;
  endedAt?: Date;
  status?: SessionStatus;
  storeName?: string;
  items?: CartItem[];
  budgetLimit?: Money;
}

export class ShoppingSession {
  // Existing fields...
  readonly budgetLimit?: Money;

  setBudgetLimit(limit: Money | null | undefined): void;
  budgetStatus(): BudgetStatus;
  budgetMetrics(pendingItemCount?: number): BudgetMetrics | null;
}
```

### 3. `ShoppingList` Aggregate Root Enhancements

```typescript
export class ShoppingList {
  // Existing methods...
  pendingCount(): number;
}
```

### 4. `Haptics` Device Interface Enhancements

```typescript
export interface IHaptics {
  triggerScanSuccess(): boolean;
  triggerVoiceCue(type: 'start' | 'stop'): boolean;
  triggerBudgetWarning(): boolean;
  triggerBudgetExceeded(): boolean;
}
```

### 5. Persistence Serialized Contracts

```typescript
export interface SerializedShoppingSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: SessionStatus;
  storeName?: string;
  items: SerializedCartItem[];
  budgetLimitCents?: number | null;
}
```

### 6. UI Component Prop Contracts

#### `SetBudgetModalProps`
```typescript
export interface SetBudgetModalProps {
  isOpen: boolean;
  currentBudget: Money | null;
  currentTotal: Money;
  pendingItemCount: number;
  onClose: () => void;
  onSaveBudget: (budget: Money | null) => void;
}
```

#### `StickyBottomBarProps` Updates
```typescript
export interface StickyBottomBarProps {
  total: Money;
  itemCount: number;
  budgetMetrics?: BudgetMetrics | null;
  onOpenManualModal: () => void;
  onScanClick?: () => void;
  onOpenBudgetModal?: () => void;
}
```

#### `HeaderProps` Updates
```typescript
export interface HeaderProps {
  storeName: string;
  onUpdateStoreName: (name: string) => void;
  lineCount: number;
  itemCount: number;
  onClearCart: () => void;
  onOpenFinishModal: () => void;
  onOpenHistory?: () => void;
  onOpenShoppingList?: () => void;
  shoppingListProgress?: { completed: number; total: number };
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  budgetMetrics?: BudgetMetrics | null;
  onOpenBudgetModal?: () => void;
}
```

---

## Non-Functional & Quality Requirements

- **DDD & Clean Architecture Purity**:
  - `ShoppingSession` and `ShoppingList` MUST remain 100% pure domain models with zero dependencies on browser Web APIs, SQLite drivers, or React frameworks.
  - Margin calculations MUST accept primitive counts (`pendingItemCount?: number`) to prevent cross-aggregate coupling.
- **Defensive Financial Arithmetic**:
  - Integer cents arithmetic MUST be used exclusively for calculations.
  - Division operations (`Math.floor`) MUST ensure no rounding artifacts introduce synthetic money.
- **Hardware & Environmental Resilience**:
  - Haptic vibration patterns and Web Audio tones MUST catch all runtime exceptions silently, ensuring seamless operation in browsers with strict audio autoplay policies, headless Vitest suites, or devices lacking vibration motors.
- **Accessibility Compliance**:
  - The progress bar in `StickyBottomBar` MUST adhere to WAI-ARIA progressbar standards (`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`).
  - Toast alerts on threshold crossings MUST use `aria-live="assertive"` for budget exceeded and `aria-live="polite"` for budget warning.
  - Preset chips and buttons MUST meet WCAG 2.1 AA target size requirements ($\ge 48\text{px} \times 48\text{px}$).
- **Zero-Downtime Data Migration**:
  - LocalStorage and SQLite repositories MUST handle historical sessions without budgets transparently, with no manual migration scripts or database drops required.
