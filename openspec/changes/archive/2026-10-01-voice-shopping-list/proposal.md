# Proposal: voice-shopping-list

## Intent
Enable users to quickly populate their shopping list in CestaCuenta using natural spoken Spanish via voice dictation, whether reciting a single product or an entire multi-item list (e.g., *"leche, huevos, tres plátanos y pan"*). To prevent ambient supermarket noise or speech recognition inaccuracies from polluting user lists, dictation provides real-time audio/visual listening feedback and an interactive review staging area (item chips with individual deletion and transcript editing) before committing items to the persistent shopping list.

## Scope

### In Scope
- **Domain Layer**:
  - `SpokenShoppingListParser`: Pure domain service to parse, sanitize, and segment natural spoken Spanish text into distinct shopping list item strings.
  - Handles Spanish separators: commas, punctuation, conjunctions (`" y "`, `" e "`), and connectors (`" además de "`, `" y también "`, `" también "`).
  - Strips intent and command prefixes (e.g., *"añade a la lista"*, *"añadir"*, *"pon en la lista"*, *"comprar"*, *"por favor"*).
  - Preserves quantities and units (e.g., *"2 paquetes de arroz"*, *"tres litros de leche"*).
  - Enhances `ShoppingListMatcherService` stop-word list to include Spanish number words (`dos`, `tres`, `cuatro`, etc.) and digits so items dictated with quantities match scanned product references.
- **Infrastructure Layer**:
  - `VoiceRecognitionAdapter`: Hardware/device adapter wrapping the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
  - Handles lifecycle events (`start`, `speechstart`, `result`, `speechend`, `error`, `end`), language configuration (`es-ES`), and continuous/interim transcription.
  - Integrates haptic feedback (`Haptics.notification('success')` / light pulses) when dictation begins and ends.
  - Translates browser errors into strongly typed domain/device error types (`not-allowed`, `network`, `no-speech`, `unsupported`).
- **UI & Interaction Layer**:
  - `useVoiceShoppingList`: Custom React hook orchestrating `VoiceRecognitionAdapter`, reactive listening states, interim transcript, parsed item staging, and error reporting.
  - `ShoppingListModal`:
    - Add a third mode tab: "Voz" (`mode === 'voice'`) featuring a prominent microphone button, animated listening pulse/wave, live interim transcription, review staging chips with removal (`✕`), and a batch *"Añadir X artículos"* confirmation button.
    - Add a compact inline microphone button in the single-item text input for rapid single-item dictation.
    - Provide user-facing notices for offline errors and unsupported browsers with guidance to use mobile keyboard voice dictation.
- **Testing**:
  - Unit tests for `SpokenShoppingListParser` covering single items, conjunctions, prefixes, numbers, and edge cases.
  - Unit tests for `VoiceRecognitionAdapter` with mocked `SpeechRecognition` verifying lifecycle, permissions, and network errors.
  - UI component tests for `ShoppingListModal` voice tab rendering and interactions.

### Out of Scope
- Global voice assistant for full app navigation, cart management, or price searches outside the shopping list modal.
- Cloud-based speech-to-text processing or external proprietary voice APIs (relies purely on client-side Web Speech API and device keyboard dictation).
- Text-to-Speech (TTS) audio readback of list items.
- Persistent audio recording file storage.

## Capabilities

### New Capabilities
- `voice-input`: Dictation of shopping list items using Web Speech API with review staging before insertion.
  - Provides speech recognition adapter for `SpeechRecognition` / `webkitSpeechRecognition`.
  - Parses natural Spanish phrases into individual shopping list items with prefix removal and quantity retention.
  - Staging area allows review, manual adjustments, and single-tap batch insertion into `ShoppingList`.
  - Graceful fallback for offline supermarket conditions and unsupported browsers.

### Modified Capabilities
- *None* (No existing main specs in `openspec/specs/`).

## Approach

1. **Domain-Driven Design (Clean Architecture)**:
   - Keep the parsing engine (`SpokenShoppingListParser`) 100% pure TypeScript with no dependencies on browser globals or React hooks.
   - Expand `ShoppingListMatcherService` so that numeral prefixes like *"2 leches"* or *"dos leches"* do not disrupt significant word subset matching against scanned cart items (e.g. *"Leche Pascual Entera 1L"*).
2. **Device Abstraction**:
   - Encapsulate the Web Speech API inside `VoiceRecognitionAdapter` in `src/infrastructure/device/`.
   - Ensure SSR and test safety (safely check for `window` and API presence).
   - Normalize cross-browser speech events and translate standard errors into actionable feedback.
3. **Interactive Review Staging (Mitigating Supermarket Noise)**:
   - Supermarket aisles have significant ambient chatter and intermittent network connectivity. Immediate auto-addition would pollute lists with transcription errors.
   - The user speaks, views live interim feedback, and when speech concludes, the segmented items appear as interactive chips. The user can discard erroneous chips, tweak the transcript, or confirm the items in one tap.
4. **Offline & Platform Fallback UX**:
   - When `event.error === 'network'` occurs (common in store aisles without on-device speech models), the app explains the limitation and prompts the user to use their phone's native keyboard dictation key directly into the input fields.

## Affected Areas

| Area | Path | Changes |
| :--- | :--- | :--- |
| **Domain** | `src/domain/services/SpokenShoppingListParser.ts` | **New**: Pure parser for natural Spanish spoken dictation. |
| **Domain** | `src/domain/services/ShoppingListMatcherService.ts` | **Modify**: Add Spanish number words and digits to stop-words to support quantity matching. |
| **Domain** | `src/domain/index.ts` | **Modify**: Export `SpokenShoppingListParser`. |
| **Infrastructure** | `src/infrastructure/device/VoiceRecognitionAdapter.ts` | **New**: Web Speech API adapter with error translation and haptic feedback. |
| **UI Hooks** | `src/ui/hooks/useVoiceShoppingList.ts` | **New**: React hook for listening state, interim transcript, and parsed staging. |
| **UI Components** | `src/ui/components/ShoppingListModal.tsx` | **Modify**: Add "Voz" tab, staging preview chips, inline mic in single mode, and error banners. |
| **UI Components** | `src/ui/components/ShoppingListBanner.tsx` | **Modify**: Optional quick-voice shortcut button. |
| **UI Styles** | `src/ui/styles.css` | **Modify**: Styles for mic pulsing animation, wave indicator, and preview chips. |
| **Tests** | `tests/domain/SpokenShoppingListParser.test.ts` | **New**: Unit test suite for Spanish voice parsing. |
| **Tests** | `tests/infrastructure/device/VoiceRecognitionAdapter.test.ts` | **New**: Unit test suite for speech recognition adapter. |
| **Tests** | `tests/ui/ShoppingListModal.test.tsx` | **Modify**: Tests for voice tab rendering, mic button, and interactions. |

## Dependencies

- **Platform APIs**:
  - `window.SpeechRecognition` / `window.webkitSpeechRecognition` (Web Speech API).
  - Web Audio API and `navigator.vibrate` (via existing `Haptics.ts`).
- **Libraries**:
  - `lucide-react`: UI icons (`Mic`, `MicOff`, `Sparkles`, `Check`, `X`).
- **Internal Domain Entities**:
  - `ShoppingList`, `ShoppingListItem`, `ShoppingListMatcherService`.
- **No external npm runtime dependencies required.**

## Risks & Mitigations

1. **Browser Support Limitations (Firefox, Brave, Desktop)**:
   - *Risk*: Firefox does not support Web Speech API by default, and Brave blocks Google speech endpoints.
   - *Mitigation*: Feature-detect API availability. If unavailable, show a helpful message and direct the user to the "Pegar texto" / "Añadir uno a uno" tabs, noting that the device keyboard microphone works in any input.
2. **Supermarket Connectivity & Network Failures**:
   - *Risk*: Without offline voice packs, Chrome/Edge fails with `error: 'network'` in low-signal supermarket aisles.
   - *Mitigation*: Specifically catch `'network'` errors, cleanly reset listening state, and display clear offline instructions recommending keyboard dictation.
3. **Compound Food Names Containing "y"**:
   - *Risk*: Phrases like *"jamón y queso"* or *"sal y pimienta"* could be split into separate items.
   - *Mitigation*: The interactive review staging area displays chips before insertion, allowing the user to remove unwanted splits or adjust them before saving.
4. **PWA Gesture Permissions on iOS**:
   - *Risk*: iOS Safari requires user gesture context to activate microphone capture.
   - *Mitigation*: Call `adapter.start()` strictly inside synchronous user click/tap handlers.
5. **Background Noise Transcription Errors**:
   - *Risk*: Store announcements or chatter creating bogus list entries.
   - *Mitigation*: Staging preview requires explicit confirmation (*"Añadir X artículos"*), ensuring no mistranscribed items enter the database automatically.

## Rollback Plan

The voice input feature is purely additive and strictly decoupled from existing data models:
1. Reverting the commits will remove `SpokenShoppingListParser`, `VoiceRecognitionAdapter`, and the UI additions in `ShoppingListModal`.
2. Existing shopping list items, localStorage schemas, and manual/paste input modes will remain completely unaffected and functional.
3. No database schema migrations or state structure transformations are introduced.

## Success Criteria

- [ ] `SpokenShoppingListParser` segments Spanish spoken phrases (commas, "y", "e", "además de"), strips command prefixes ("añade", "comprar"), and preserves quantities with 100% test coverage.
- [ ] Items dictated with quantities (e.g., *"2 leches"*) match scanned items (e.g., *"Leche Pascual"*) in `ShoppingListMatcherService`.
- [ ] `VoiceRecognitionAdapter` cleanly initializes Web Speech API, emits lifecycle events, manages error states, and triggers haptic cues.
- [ ] `ShoppingListModal` features a "Voz" tab with live transcript preview, interactive staging chips, and batch addition.
- [ ] Single text input contains an inline mic button for one-tap single-item dictation.
- [ ] Clear fallback message is displayed when speech recognition is unsupported or offline.
- [ ] All existing 292 tests and new tests pass without regressions (`npm test`).
- [ ] Zero TypeScript errors (`npx tsc --noEmit`).
