# Tasks: Voice Shopping List (`voice-shopping-list`)

## Overview & Delivery Strategy

- **Change ID**: `voice-shopping-list`
- **Delivery Strategy**: `single-pr` (Cohesive, atomic delivery across Domain, Infrastructure, and UI layers with zero database schema migrations)
- **TDD Requirement**: Strict TDD (`[RED]` failing unit tests $\rightarrow$ `[GREEN]` minimal implementation $\rightarrow$ `[REFACTOR]` cleanup and verification)

---

## Review Workload Forecast

| Component / File | Type | Est. Prod LoC | Est. Test LoC | Complexity | Risk |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `src/domain/services/SpokenShoppingListParser.ts` | New Service | +110 | - | Medium | Low |
| `tests/domain/SpokenShoppingListParser.test.ts` | New Tests | - | +140 | Medium | Low |
| `src/domain/services/ShoppingListMatcherService.ts` | Modification | +15 | - | Low | Low |
| `tests/domain/ShoppingListMatcherService.test.ts` | Test Additions | - | +35 | Low | Low |
| `src/domain/index.ts` | Export Additions | +3 | - | Very Low | None |
| `src/infrastructure/device/VoiceRecognitionAdapter.ts` | New Adapter | +130 | - | Medium | Medium |
| `src/infrastructure/device/Haptics.ts` | Modification | +20 | - | Low | Low |
| `tests/infrastructure/device/VoiceRecognitionAdapter.test.ts` | New Tests | - | +150 | Medium | Low |
| `src/ui/hooks/useVoiceShoppingList.ts` | New Hook | +90 | - | Medium | Low |
| `src/ui/components/ShoppingListModal.tsx` | Modification | +120 | - | Medium | Low |
| `src/ui/components/ShoppingListBanner.tsx` | Modification | +10 | - | Low | Low |
| `src/ui/styles.css` | Stylesheet | +130 | - | Low | Low |
| `tests/ui/ShoppingListModal.test.tsx` | Test Additions | - | +80 | Medium | Low |
| **Total Forecast** | | **~500 LoC** | **~405 LoC** | **Overall: Medium** | **Overall: Low** |

---

## Suggested Work Units

1. **Work Unit 1: Domain - Spoken Shopping List Parser & Matcher Enhancement**
   - Pure domain business logic without browser globals or React hooks.
   - Segment natural Spanish speech by punctuation, conjunctions (`" y "`, `" e "` before *i/hi*), and connectors (`" además de "`, `" y también "`, `" también "`).
   - Strip conversational command prefixes (*"añade a la lista"*, *"comprar"*, *"por favor"*).
   - Preserve compound food names (*"jamón y queso"*, *"sal y pimienta"*, *"aceite de oliva"*) and quantities (*"2 leches"*, *"tres kilos de manzanas"*).
   - Enhance `ShoppingListMatcherService` stop-words with Spanish numerals and digits to allow automatic cart cross-off for items dictated with quantities.

2. **Work Unit 2: Infrastructure - Web Speech Recognition Device Adapter & Haptics**
   - Decoupled hardware adapter (`VoiceRecognitionAdapter` implementing `IVoiceRecognitionAdapter`) wrapping `window.SpeechRecognition` / `window.webkitSpeechRecognition`.
   - Safe feature detection and fallback for non-browser / SSR / Node.js runtimes.
   - Deterministic state machine (`idle` $\rightarrow$ `starting` $\rightarrow$ `listening` $\rightarrow$ `stopping` $\rightarrow$ `idle` / `error`).
   - Error mapping for typed domain errors (`not-allowed`, `network`, `no-speech`, `audio-capture`, `not-supported`, `aborted`, `unknown`).
   - Subtle sensory feedback cues via `Haptics.ts` on listening start and stop.

3. **Work Unit 3: UI - Reactive Voice Hook, Review Staging Area & Modal Integration**
   - Orchestration hook `useVoiceShoppingList` managing adapter lifecycle, interim transcription, and item staging.
   - Addition of 3rd tab "Voz" (`mode === 'voice'`) in `ShoppingListModal`.
   - Prominent microphone toggle button with animated pulse/wave states and accessible ARIA attributes.
   - Interactive review staging area: segmented chips with individual deletion (`✕`), manual transcript editing, and batch commit button (*"Añadir X artículos a la lista"*).
   - Inline microphone button in single-item mode for one-shot field dictation.
   - Informative fallback card for unsupported browsers (Firefox, Brave) and supermarket network dropouts.

4. **Work Unit 4: Styles, Full Verification & Build Validation**
   - Styling for microphone pulse, listening waveforms, staging chips, and error banners in `src/ui/styles.css`.
   - Full test suite run (`vitest run`), strict TypeScript validation (`tsc --noEmit`), and production bundle build (`tsc && vite build`).

---

## Phased Implementation Tasks

### Phase 1: Domain Layer (Pure Parser & Matcher)

- [x] 1.1 **[RED]** Create unit test suite `tests/domain/SpokenShoppingListParser.test.ts`
  - Test single item dictation (`"plátanos"` $\rightarrow$ `["Plátanos"]`).
  - Test punctuation splitting (commas, semicolons, periods, newlines).
  - Test Spanish conjunction `" y "` splitting (`"leche, huevos y pan"` $\rightarrow$ `["Leche", "Huevos", "Pan"]`).
  - Test Spanish conjunction `" e "` before words starting with `i-` or `hi-` (`"café e infusiones e higos"` $\rightarrow$ `["Café", "Infusiones", "Higos"]`).
  - Test multi-word connectors (`"arroz además de tomates también galletas"` $\rightarrow$ `["Arroz", "Tomates", "Galletas"]`).
  - Test stripping of command and conversational prefixes (`"por favor añade a la lista dos paquetes de café"`, `"quiero comprar manzanas y comprar peras"`).
  - Test protection of established compound food items (`"jamón y queso"`, `"sal y pimienta"`, `"aceite de oliva"`, `"café con leche"`).
  - Test preservation of quantities and measurement units (`"2 paquetes de arroz"`, `"tres litros de leche"`, `"medio kilo de tomates"`).
  - Test normalization (casing capitalization, whitespace trimming, empty token discarding).
- [x] 1.2 **[GREEN]** Implement pure domain service `SpokenShoppingListParser` in `src/domain/services/SpokenShoppingListParser.ts`
  - Implement options interface `SpokenParserOptions` (`stripPrefixes`, `protectCompounds`, `preserveQuantities`).
  - Implement compound masking mechanism for `PROTECTED_COMPOUNDS`.
  - Implement regex splitting using punctuation, `" y "`, `" e "`, and multi-word connectors.
  - Implement prefix stripping for initial phrases and intra-clause command prefixes.
  - Implement sentence-case capitalization and token sanitization.
  - Ensure zero browser API dependencies (runs 100% pure in Node.js/Vitest).
- [x] 1.3 **[RED]** Add unit tests in `tests/domain/ShoppingListMatcherService.test.ts` for quantity stop-words
  - Test matching dictated items with numbers against scanned cart items:
    - `"2 leches"` matches scanned `"Leche Pascual Entera 1L"`.
    - `"dos paquetes de arroz"` matches scanned `"Arroz SOS Redondo 1kg"`.
    - `"3 manzanas fuji"` matches scanned `"Manzana Fuji Bolsa 1.5kg"`.
- [x] 1.4 **[GREEN]** Enrich `SPANISH_STOP_WORDS` in `src/domain/services/ShoppingListMatcherService.ts`
  - Add numeric digits (`'0'` through `'9'`).
  - Add common Spanish numeral words (`'dos'`, `'tres'`, `'cuatro'`, `'cinco'`, `'seis'`, `'siete'`, `'ocho'`, `'nueve'`, `'diez'`).
  - Add common grocery measure units (`'medio'`, `'kilo'`, `'kilos'`, `'litro'`, `'litros'`, `'paquete'`, `'paquetes'`).
- [x] 1.5 **[GREEN]** Export `SpokenShoppingListParser` and its types in `src/domain/index.ts`
- [x] 1.6 **[REFACTOR]** Run domain tests (`npx vitest run tests/domain`) and ensure 100% pass rate with clean domain boundaries.

---

### Phase 2: Infrastructure Layer (Hardware Adapter & Haptics)

- [x] 2.1 **[RED]** Create unit test suite `tests/infrastructure/device/VoiceRecognitionAdapter.test.ts`
  - Test `isSupported()` returns `false` when `window` or speech recognition globals are absent.
  - Test `isSupported()` returns `true` when `SpeechRecognition` or `webkitSpeechRecognition` is defined.
  - Test lifecycle state transitions: `idle` $\rightarrow$ `starting` $\rightarrow$ `listening` $\rightarrow$ `stopping` $\rightarrow$ `idle`.
  - Test recognition configuration: `lang = 'es-ES'`, `interimResults = true`, `continuous = true`.
  - Test dispatching interim and final transcription callbacks (`onInterimResult`, `onFinalResult`).
  - Test error handling translations:
    - Native `not-allowed` maps to typed `VoiceRecognitionError` with `type: 'not-allowed'`.
    - Native `network` maps to typed `type: 'network'` and resets state to `idle`.
    - Native `no-speech` cleanly transitions back to `idle`.
    - Native `audio-capture` and `aborted` handle clean reset.
  - Test `stop()` and `abort()` lifecycle termination methods.
- [x] 2.2 **[GREEN]** Enhance `src/infrastructure/device/Haptics.ts` with voice feedback cues
  - Add `triggerVoiceCue(type: 'start' | 'stop'): boolean` providing subtle sensory pulse and tone cues.
  - Ensure safe fallback in SSR/Node/Vitest when `navigator.vibrate` or `AudioContext` is unavailable.
- [x] 2.3 **[GREEN]** Implement `VoiceRecognitionAdapter` in `src/infrastructure/device/VoiceRecognitionAdapter.ts`
  - Define interfaces `IVoiceRecognitionAdapter`, `VoiceRecognitionCallbacks`, `VoiceRecognitionError`, and types `VoiceRecognitionState`, `VoiceRecognitionErrorType`.
  - Implement `VoiceRecognitionAdapter` (and export alias `WebSpeechRecognitionAdapter`).
  - Implement safe browser detection (`typeof window !== 'undefined'`).
  - Connect lifecycle events (`onstart`, `onspeechstart`, `onresult`, `onspeechend`, `onerror`, `onend`).
  - Connect haptic feedback triggers on recognition start and end.
- [x] 2.4 **[REFACTOR]** Run infrastructure tests (`npx vitest run tests/infrastructure/device`) and confirm robust hardware isolation.

---

### Phase 3: Presentation Layer (Hook, Voice Tab, Staging & Fallback)

- [x] 3.1 **[RED]** Create unit tests for `useVoiceShoppingList` in `tests/ui/hooks/useVoiceShoppingList.test.ts` (or harness tests in `tests/ui/ShoppingListModal.test.tsx`)
  - Test initial state: `isListening: false`, `stagedItems: []`, `interimTranscript: ''`, `errorMessage: null`.
  - Test listening start/stop triggering adapter lifecycle.
  - Test parsing finalized transcripts with `SpokenShoppingListParser` into `stagedItems`.
  - Test staging management: `removeStagedItem(index)`, `updateStagedItem(index, name)`, `addStagedItem(name)`, `clearStaging()`.
  - Test `commitStagedItems(onCommit)` sequentially dispatching items and clearing staging.
  - Test error capture and `clearError()`.
- [x] 3.2 **[GREEN]** Implement `useVoiceShoppingList` hook in `src/ui/hooks/useVoiceShoppingList.ts`
  - Encapsulate `VoiceRecognitionAdapter` instance and callback handling.
  - Auto-parse finalized transcripts with `SpokenShoppingListParser.parse()`.
  - Return contract conforming to `UseVoiceShoppingListReturn` defined in spec.
- [x] 3.3 **[RED]** Add component test cases in `tests/ui/ShoppingListModal.test.tsx` for voice mode
  - Test rendering 3 mode tabs: "Añadir uno a uno", "Pegar texto", "Voz".
  - Test unsupported browser fallback rendering when `isSupported` is false.
  - Test microphone button rendering in idle and listening states with accessible ARIA labels.
  - Test interactive review staging chips display with individual remove (`✕`) buttons.
  - Test batch confirmation button (*"Añadir X artículos a la lista"*) disabled when empty, enabled when items staged.
  - Test inline microphone button presence in single-item input mode.
- [x] 3.4 **[GREEN]** Update `src/ui/components/ShoppingListModal.tsx`
  - Update `InputMode` type to `'single' | 'paste' | 'voice'`.
  - Add "Voz" tab button in the mode selector tablist.
  - Integrate `useVoiceShoppingList` hook.
  - Render "Voz" tab body:
    - Large microphone toggle button with active listening states (`idle`, `listening`, `starting`, `stopping`).
    - Animated listening audio wave / pulse indicator.
    - Live interim transcript container with `aria-live="polite"`.
    - Review staging area with interactive chips (each with item name, editable text, and remove `✕` button with accessible `aria-label`).
    - Raw transcript textarea for manual corrections before re-parse.
    - Batch commit button: *"Añadir X artículos a la lista"*, invoking `onAddItem` for each item.
    - Unsupported browser fallback card explaining lack of browser speech support and suggesting mobile keyboard dictation.
    - Offline / network error banner with actionable keyboard dictation advice.
  - Render inline microphone button in the single-item text form for direct one-shot dictation into `singleInput`.
  - Ensure cleanup on modal close (`onClose` cancels ongoing speech recognition).
  - Preserve single-item and paste-item inputs when switching tabs (zero data loss).
- [x] 3.5 **[GREEN]** Update `src/ui/components/ShoppingListBanner.tsx`
  - Add quick voice button or ensure accessible shortcut navigation to open `ShoppingListModal` in voice mode.
- [x] 3.6 **[GREEN]** Add voice dictation styles to `src/ui/styles.css`
  - Define styles for `.shopping-list-voice-container`, `.btn-voice-mic`, `.btn-voice-mic--listening`.
  - Implement CSS pulse animation (`@keyframes voicePulse`) and wave visualizer bars (`@keyframes soundWave`).
  - Define styles for `.voice-transcript-box`, `.voice-staging-container`, `.voice-staging-chip`, `.btn-chip-remove`.
  - Define styles for `.voice-fallback-card` and `.voice-error-banner`.
  - Define styles for `.btn-inline-mic` inside single input form.
  - Ensure full responsiveness and safe-area padding for mobile viewport.
- [x] 3.7 **[REFACTOR]** Run UI component tests (`npx vitest run tests/ui`) and verify accessibility and UI states.

---

### Phase 4: Full Suite Verification & Build Validation

- [x] 4.1 Run full unit and integration test suite (`npx vitest run`) to verify all 292 existing tests plus new tests pass without regressions.
- [x] 4.2 Run TypeScript strict typecheck (`npx tsc --noEmit`) to verify zero type errors across the entire codebase.
- [x] 4.3 Run production build (`npx tsc && npx vite build`) to verify bundle compilation, tree-shaking, and PWA service worker asset generation.
- [x] 4.4 Final verification check against RFC 2119 requirements and acceptance scenarios in `openspec/changes/voice-shopping-list/specs/voice-input/spec.md`.

