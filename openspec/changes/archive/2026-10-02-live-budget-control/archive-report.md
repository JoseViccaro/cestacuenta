# Archive Report: `live-budget-control`

## Executive Summary

The change **`live-budget-control`** has successfully completed its full Spec-Driven Development (SDD) lifecycle in `openspec` mode. All 26 planned tasks across Domain Invariants, Infrastructure Persistence & Haptics, UI Presentation, and Styling were executed following strict TDD practices and verified with 100% specification and scenario coverage (429/429 tests passing across 35 test suites, 0 TypeScript compiler errors, and a pristine PWA production build). The target specification has been promoted to the root OpenSpec registry at `openspec/specs/budget-control/spec.md`, and all change artifacts have been archived with byte-level integrity verification.

---

## Archival Metadata

| Attribute | Value |
| :--- | :--- |
| **Change ID** | `live-budget-control` |
| **Capability Name** | `budget-control` |
| **Archive Timestamp** | 2026-10-02T13:20:00Z |
| **Source Directory** | `openspec/changes/live-budget-control/` |
| **Archive Directory** | `openspec/changes/archive/2026-10-02-live-budget-control/` |
| **Promoted Spec** | `openspec/specs/budget-control/spec.md` |
| **Lifecycle Outcome** | **Successfully Archived (100% Complete)** |

---

## 1. Cycle & Task Completion Summary (26 / 26)

All 26 tasks across 4 work units were executed, tested, and validated:

### Phase 1: Domain Layer (Pure Invariants & Budget Calculations) — 6/6 Complete
- [x] **1.1 [RED]**: Unit test suite `tests/domain/ShoppingSession.test.ts` (19 comprehensive assertions covering default `undefined` limit, `setBudgetLimit` assignment, active session invariant checking, non-positive limit validation, exact threshold boundary status classifications, defensive non-negative headroom/deficit arithmetic, and dynamic pending item margins).
- [x] **1.2 [GREEN]**: Pure domain logic in `src/domain/entities/ShoppingSession.ts` implementing `BudgetStatus`, `BudgetMetrics`, getter/setter with `ensureActive()`, integer percentage computation, safe arithmetic avoiding negative money subtraction, and floor division for item margins.
- [x] **1.3 [RED]**: Unit tests in `tests/domain/ShoppingList.test.ts` for unchecked item count (`pendingCount`).
- [x] **1.4 [GREEN]**: Added `pendingCount(): number` to `src/domain/entities/ShoppingList.ts` returning unchecked items (`!item.isChecked`).
- [x] **1.5 [GREEN]**: Re-exported `BudgetStatus` and `BudgetMetrics` in `src/domain/index.ts`.
- [x] **1.6 [REFACTOR]**: Verified pure domain boundaries with 100% test pass rate and zero external framework/storage dependencies.

### Phase 2: Infrastructure Layer (Persistence Backward Compatibility & Haptics) — 7/7 Complete
- [x] **2.1 [RED]**: Unit tests in `tests/infrastructure/persistence/LocalStorageShoppingSessionRepository.test.ts` for serialization, hydration, and safe handling of legacy JSON lacking `budgetLimitCents`.
- [x] **2.2 [GREEN]**: Updated `src/infrastructure/persistence/web/LocalStorageShoppingSessionRepository.ts` to serialize `budgetLimitCents` and hydrate valid positive numbers into `Money`.
- [x] **2.3 [RED]**: Unit tests in `tests/infrastructure/persistence/SqliteShoppingSessionRepository.test.ts` verifying pre-existing schema migration, integer persistence, and null column hydration.
- [x] **2.4 [GREEN]**: Updated `src/infrastructure/persistence/sqlite/SqliteShoppingSessionRepository.ts` with nullable `budget_limit_cents` column, idempotent `ALTER TABLE` migration in `initDatabase()`, and updated SQL statements.
- [x] **2.5 [RED]**: Unit tests in `tests/infrastructure/device/Haptics.test.ts` covering double pulse warning (`[120, 80, 120]`), urgent triple pulse exceeded (`[200, 100, 200, 100, 200]`), dual-tone Web Audio chimes, and defensive fallbacks.
- [x] **2.6 [GREEN]**: Implemented `Haptics.triggerBudgetWarning()` and `Haptics.triggerBudgetExceeded()` in `src/infrastructure/device/Haptics.ts` with vibration patterns and harmonic chimes.
- [x] **2.7 [REFACTOR]**: Verified infrastructure layer tests with 100% pass rate.

### Phase 3: Presentation / UI Layer (Components & State Coordination) — 9/9 Complete
- [x] **3.1 [RED]**: Component test suite `tests/ui/SetBudgetModal.test.tsx` (preset chips, custom decimal entry, live calculations, save/clear handlers, modal dismissability).
- [x] **3.2 [GREEN]**: Implemented `SetBudgetModal` in `src/ui/components/SetBudgetModal.tsx` as an accessible mobile bottom sheet with 5 preset chips (`20 €`, `30 €`, `50 €`, `75 €`, `100 €`), decimal comma/dot parsing, and live feedback preview.
- [x] **3.3 [RED]**: Component test suite `tests/ui/StickyBottomBar.test.tsx` (progressbar semantics, status modifier classes, headroom readouts, margin chips, click-to-open handler).
- [x] **3.4 [GREEN]**: Updated `src/ui/components/StickyBottomBar.tsx` with visual `.budget-gauge`, WAI-ARIA `progressbar` role, dynamic width capping, and modal invocation.
- [x] **3.5 [RED]**: Component test suite `tests/ui/Header.test.tsx` (`+ Presupuesto` vs formatted cap amount, status dot classes, and modal trigger).
- [x] **3.6 [GREEN]**: Updated `src/ui/components/Header.tsx` with interactive budget pill button and color-coded status dot.
- [x] **3.7 [RED]**: Integration test suite `tests/ui/App.test.tsx` for edge-triggered status crossings, duplicate alert suppression, downward silence, and session cloning immutability.
- [x] **3.8 [GREEN]**: Wired modal state, edge detector `useEffect` with `lastBudgetStatusRef`, sensory alert dispatching, and `commitSession` budget limit cloning in `src/ui/App.tsx`.
- [x] **3.9 [REFACTOR]**: Verified UI layer component rendering, ergonomics, and integration test coverage.

### Phase 4: Styles, Full Verification & Build Validation — 4/4 Complete
- [x] **4.1 [GREEN]**: Added CSS rules in `src/ui/styles.css` for budget gauge, color-coded tracks, status modifiers (`--normal`, `--warning`, `--exceeded`), preset chip grid, bottom sheet layout, and 48px touch targets.
- [x] **4.2 [VERIFY]**: Full test suite execution (`vitest run`): 35/35 files passed, 429/429 tests passed, 0 regressions.
- [x] **4.3 [VERIFY]**: Strict TypeScript compilation (`tsc --noEmit`): 0 errors across the entire codebase.
- [x] **4.4 [VERIFY]**: Production build compilation (`vite build`): Clean bundle generated with PWA precache manifest.

---

## 2. Test & Verification Evidence

- **Test Suite Execution**:
  - Command: `npm test` (`vitest run`)
  - Result: **35/35 files passed, 429/429 tests passed** (0 failed, 0 skipped)
  - Execution Time: 2.91s
  - Regressions: **0**
- **Type Checking**:
  - Command: `npm run typecheck` (`tsc --noEmit`)
  - Result: **0 errors** across entire codebase
- **Production Build**:
  - Command: `npm run build` (`tsc && vite build`)
  - Result: Assets generated cleanly in 399ms
    - `dist/assets/index-*.css` (66.82 kB / gzip: 10.84 kB)
    - `dist/assets/index-*.js` (756.38 kB / gzip: 226.11 kB)
    - `dist/sw.js` & `dist/workbox-*.js` (15 precached assets)

---

## 3. Promoted Specifications & Artifact Inventory

### Promoted Spec
- `openspec/specs/budget-control/spec.md` (promoted from `openspec/changes/live-budget-control/specs/budget-control/spec.md`)

### Archived Change Artifacts (`openspec/changes/archive/2026-10-02-live-budget-control/`)
- `proposal.md`: Problem statement, business value, threshold strategy, sensory feedback principles, and risk analysis.
- `exploration.md`: Architectural investigation into domain money invariants, edge detection vs polling, database schema evolution, and accessibility ergonomics.
- `design.md`: Technical specification, data models, class diagrams, sequence flows, ADRs (ADR-1 through ADR-6), and WCAG accessibility strategies.
- `tasks.md`: 26-task work breakdown structure with detailed TDD verification criteria.
- `apply-progress.md`: Execution journal tracking phase milestones and implementation commits.
- `verify-report.md`: Formal verification audit with 100% requirement traceability matrix and 17 scenario verification audits.
- `archive-report.md`: Archival record and byte-level diff confirmation.
- `specs/budget-control/spec.md`: Complete RFC 2119 specification of the `budget-control` capability.

---

## 4. Integrity Readback Verification

- Spec promotion verified via `diff -u`: zero differences between change spec and root promoted spec.
- Archive tree verified via `diff -r`: zero byte discrepancies between source change folder and archive destination.
