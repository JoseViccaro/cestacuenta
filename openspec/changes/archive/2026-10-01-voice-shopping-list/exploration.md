# Exploration: voice-shopping-list

## Exploration: Voice Input for Shopping List Items

### Current State
CestaCuenta currently manages the shopping list via a dedicated domain model and a React UI modal:
- **Domain Layer**:
  - `ShoppingList` (`src/domain/entities/ShoppingList.ts`): Aggregate root managing `ShoppingListItem` entities with `addItem(name)`, `removeItem(id)`, `toggleItem(id)`, `checkItem(id, cartItemId)`, and progress metrics.
  - `ShoppingListItem` (`src/domain/entities/ShoppingListItem.ts`): Entity with `id`, `listId`, `name`, `isChecked`, and `matchedCartItemId`.
  - `ShoppingListMatcherService` (`src/domain/services/ShoppingListMatcherService.ts`): Matches cart products against list items using exact matching and significant word subset matching, stripping common `SPANISH_STOP_WORDS`.
- **Infrastructure Layer**:
  - `LocalStorageShoppingListRepository` (`src/infrastructure/persistence/web/LocalStorageShoppingListRepository.ts`): Persists list data in browser `localStorage`.
  - `Haptics` (`src/infrastructure/device/Haptics.ts`): Hardware vibration and Web Audio API POS beeps with cross-environment guards.
- **UI Layer**:
  - `ShoppingListModal.tsx` (`src/ui/components/ShoppingListModal.tsx`): Supports two input modes:
    1. `single`: One-by-one text input with an "Añadir" button.
    2. `paste`: Multiline textarea with bulk import by splitting lines.
  - `ShoppingListBanner.tsx` (`src/ui/components/ShoppingListBanner.tsx`): Displays shopping list progress, quick-toggle chips, and an empty call-to-action button (`+ Crear o pegar lista de compra`).
  - `App.tsx` (`src/ui/App.tsx`): Coordinates shopping list hydration, item addition, auto-checking when barcodes/shelf tags are scanned, and unchecking when cart items are removed.

Currently, there is no voice recognition capability. Users must either type each item manually or paste copied text from notes or messaging apps.

---

### Affected Areas
1. **Domain Layer (`src/domain/`)**:
   - `src/domain/services/SpokenShoppingListParser.ts` *(new)*: Pure domain service to parse, sanitize, and extract item names and quantities from natural spoken Spanish phrases.
   - `src/domain/services/ShoppingListMatcherService.ts`: Minor enhancement to include Spanish number words (`dos`, `tres`, `cuatro`, etc.) and digits in stop-words or normalization so items like "2 leches" or "dos leches" match scanned product references (e.g., "Leche Pascual").
   - `src/domain/index.ts`: Export the new domain parser.

2. **Infrastructure Layer (`src/infrastructure/device/`)**:
   - `src/infrastructure/device/VoiceRecognitionAdapter.ts` *(new)*: Device adapter wrapping the browser's Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), handling permissions, lifecycle events, continuous/single-shot modes, and error translation.
   - `src/infrastructure/device/Haptics.ts`: Trigger subtle haptic pulse when voice recognition starts and finishes.

3. **UI Layer (`src/ui/`)**:
   - `src/ui/hooks/useVoiceShoppingList.ts` *(new)*: Custom React hook orchestrating `VoiceRecognitionAdapter`, reactive listening states, interim transcript, parsed items preview, and error messaging.
   - `src/ui/components/ShoppingListModal.tsx`:
     - Add a 3rd mode tab: "Voz" (`mode === 'voice'`) with a dedicated microphone interface, live transcription, parsed item chips with individual removal, and a single "Añadir X artículos" confirmation action.
     - Add a quick inline microphone button in the `single` text input for rapid single-item dictation.
   - `src/ui/components/ShoppingListBanner.tsx`:
     - Optional quick-voice shortcut (mic icon) to launch the modal directly into voice mode.
   - `src/ui/styles.css`:
     - Styles for the microphone button, active pulsing animation, listening waves, live transcript badge, and parsed item preview chips.

4. **Testing Suite (`tests/`)**:
   - `tests/domain/SpokenShoppingListParser.test.ts` *(new)*: 100% pure domain unit tests covering single items, multi-item phrasing ("y", "e", commas), command prefix trimming, quantity handling, and edge cases.
   - `tests/infrastructure/device/VoiceRecognitionAdapter.test.ts` *(new)*: Unit tests with mocked `SpeechRecognition` verifying lifecycle, language configuration, permission denials, and network error handling.
   - `tests/ui/ShoppingListModal.test.tsx`: Tests verifying rendering of voice tab, mic buttons, and accessible aria attributes.

---

### Technical Investigation

#### 1. Web Speech API & Browser Support
- **Interface**: `window.SpeechRecognition || window.webkitSpeechRecognition`.
- **Platform Matrix**:
  | Platform | Support | Speech Engine | Offline Capable? | Notes |
  | :--- | :--- | :--- | :--- | :--- |
  | **Android Chrome / Edge** | Native | Google Speech Cloud / On-device pack | Partial | Requires internet unless user downloaded Android offline speech pack. Emits `error: 'network'` if offline. |
  | **iOS Safari / PWA** | `webkitSpeechRecognition` | Apple Siri Speech Engine | Yes (iOS 14.5+ on A12+ chip) | Uses on-device dictation if enabled in iOS Settings; otherwise requires network. Standalone PWA has mic permission support since iOS 14.3. |
  | **Desktop Chrome / Edge** | Native | Google / Microsoft Speech Cloud | No (Requires Internet) | Standard desktop behavior. |
  | **Firefox (All platforms)** | Not supported by default | None | No | Behind flag `media.webspeech.recognition.enable`. Graceful fallback required. |
  | **Brave** | Partial | Disabled by default | No | Blocks Google Speech endpoint by default. Emits `error: 'not-allowed'` or `'network'`. |

#### 2. Offline Behavior & Supermarket Realities
- **Supermarket connectivity challenge**: Supermarket aisles, underground floors, and large metal structures often suffer from zero or intermittent mobile cellular signal.
- **Handling Web Speech API offline errors**:
  - When the device/browser lacks an on-device speech model and has no internet connection, `SpeechRecognition` fires an `onerror` event with `event.error === 'network'`.
  - **Mitigation & Fallback UX**:
    1. The app detects `event.error === 'network'` and displays a friendly notice: *"El reconocimiento de voz del navegador requiere conexión en este dispositivo. Puedes usar el teclado o pulsar el micrófono del teclado de tu móvil para dictar sin conexión."*
    2. The native mobile keyboard (iOS QuickType microphone, Android Gboard microphone) provides built-in on-device dictation that operates completely offline directly into standard `<input>` and `<textarea>` fields.
    3. The application must never freeze or get stuck in a "listening" state when network failure or timeout occurs.

#### 3. Multi-Item Phrasing & Natural Language Parsing in Spanish
Natural Spanish voice dictation exhibits distinct patterns that the parser must resolve:
1. **Separators and Conjunctions**:
   - Conjunction `" y "` (e.g., `"leche, huevos y pan"` $\rightarrow$ `["Leche", "Huevos", "Pan"]`).
   - Conjunction `" e "` before words starting with `i` or `hi` (e.g., `"café e infusiones"`, `"manzanas e higos"` $\rightarrow$ `["Café", "Infusiones"]`).
   - Commas `","` automatically emitted by speech recognition engines upon brief pauses.
   - Punctuation (periods, semicolons, line breaks).
   - Multi-word connectors: `" además de "`, `" y también "`, `" también "`.
2. **Intent & Command Prefixes to Strip**:
   - Users naturally prefix their requests:
     - `"Añade a la lista..."`, `"Añade..."`, `"Añadir..."`
     - `"Pon en la lista..."`, `"Pon..."`, `"Poner..."`
     - `"Apunta..."`, `"Apuntar en la lista..."`
     - `"Comprar..."`, `"Quiero comprar..."`, `"Necesito comprar..."`
     - `"Por favor..."`
   - These prefixes must be stripped from the beginning of the spoken phrase so the item is registered cleanly.
3. **Repeated Inline Actions**:
   - Phrases like `"comprar leche y comprar café"` $\rightarrow$ clean redundant `"comprar "` from subsequent items.
4. **Quantities & Number Handling**:
   - Examples: `"dos paquetes de arroz"`, `"tres litros de leche"`, `"una barra de pan"`, `"4 manzanas"`.
   - Digits (`2`) vs words (`dos`, `tres`): Dictation engines output either numbers or text depending on cadence.
   - Preserving quantity: The parser should preserve the full item descriptor (e.g., `"2 litros de leche"` or `"Dos paquetes de arroz"`), capitalised neatly.
5. **Impact on `ShoppingListMatcherService`**:
   - In `ShoppingListMatcherService`, items are matched against scanned products by significant words.
   - Currently, `SPANISH_STOP_WORDS` includes `un`, `una`, `unos`, `unas`, but omits `dos`, `tres`, `cuatro`, etc.
   - Adding Spanish numeral words and digits to stop words ensures that `"dos leches"` matches scanned `"Leche Pascual Entera 1L"` seamlessly without requiring manual renaming.
6. **Compound Food Names Containing "y"**:
   - Examples: `"jamón y queso"`, `"sal y pimienta"`, `"fresas con nata"`.
   - Splitting strictly by `" y "` turns `"jamón y queso"` into `["Jamón", "Queso"]`. In grocery shopping, this is often acceptable (buying ham and cheese), but for combined products (e.g., "pack jamón y queso"), the interactive preview allows the user to merge or edit before final submission.

---

### Approaches

#### Approach 1: Immediate Auto-Add (No Staging/Review)
- **Flow**: User taps mic button $\rightarrow$ speaks $\rightarrow$ speech recognition completes $\rightarrow$ items immediately appended to the shopping list.
- **Pros**:
  - Minimum user taps (1 tap to start speaking).
- **Cons**:
  - High error rate from background supermarket ambient noise or speech misinterpretations.
  - Mistranscribed words pollute the shopping list directly, forcing manual item-by-item deletion.
  - No opportunity to correct bad splits (e.g., compound items).

#### Approach 2: Interactive Voice Tab with Real-Time Preview Chips (Recommended)
- **Flow**:
  1. User selects the "Voz" tab in `ShoppingListModal` (or taps a quick-mic button).
  2. User taps the primary microphone button to start dictation.
  3. Real-time visual feedback: animated listening ripple, live interim transcript showing what is currently being heard.
  4. Upon speech completion (or manual stop tap), `SpokenShoppingListParser` parses the transcript into item chips.
  5. The user sees a staging preview of parsed items:
     - Each item chip has a remove (`✕`) icon.
     - An editable text box displays the raw transcript if the user wants to tweak wording manually.
     - A clear confirmation button: *"Añadir X artículos a la lista"*.
  6. Additionally, a compact microphone icon is placed inside the `single` text input for instant single-item dictation directly into the input field.
- **Pros**:
  - Maximum reliability and user control: eliminates list pollution caused by ambient noise or speech glitches.
  - Transparent parsing: user clearly sees how multi-item sentences like *"leche, pan y tres manzanas"* were segmented before committing.
  - Adheres to CestaCuenta's clean UX patterns (analogous to `ScannerModal` manual/shelf tag verification).
  - Clear fallbacks for unsupported browsers or offline errors.
- **Cons**:
  - Requires one extra tap (*"Añadir X artículos"*) to confirm parsed multi-item lists.

#### Approach 3: Global Voice Assistant in Bottom Bar
- **Flow**: Add a persistent microphone button to `StickyBottomBar` that parses global intents (e.g., *"añadir a la lista leche"*, *"buscar precio de leche"*, *"borrar lista"*).
- **Pros**:
  - Voice accessible anywhere in the app.
- **Cons**:
  - Severe scope creep and ambiguous user intent: confusing adding items to the active cart vs adding items to the shopping list.
  - High cognitive load for users in a noisy supermarket.

---

### Recommendation
Adopt **Approach 2**:
1. Implement a pure domain service `SpokenShoppingListParser` (`src/domain/services/SpokenShoppingListParser.ts`) with 100% test coverage using Vitest.
2. Implement a robust infrastructure device adapter `VoiceRecognitionAdapter` (`src/infrastructure/device/VoiceRecognitionAdapter.ts`) with feature detection, `es-ES` default, error mapping, and SSR/Node-safe execution.
3. Update `ShoppingListMatcherService` to ignore Spanish number words in word subset matching.
4. Provide a rich "Voz" mode tab inside `ShoppingListModal` with live transcript feedback and interactive preview chips, plus a compact mic icon in the single-item form.
5. Provide helpful offline and permission fallback notifications that guide users to use their device keyboard's native offline dictation if Web Speech API connectivity fails.

---

### Risks
1. **Browser Support Diversity**: Firefox does not support Web Speech API out of the box, and Brave blocks Google speech endpoints by default.
   - *Mitigation*: Feature-detect `SpeechRecognition` / `webkitSpeechRecognition`. If unsupported, render an accessible notice explaining that the browser does not support Web Speech API, with a one-tap link to the "Pegar texto" or "Añadir uno a uno" tabs and a tip to use the mobile keyboard's dictation key.
2. **Offline & Low-Signal Supermarket Aisles**: Chrome on Android and desktop errors with `'network'` if offline and no offline language pack is installed.
   - *Mitigation*: Trap `'network'` errors specifically and explain that the browser speech engine requires connectivity, while reminding the user that phone keyboard dictation works offline.
3. **Compound Word Splitting**: Phrases like *"jamón y queso"* or *"sal y pimienta"* contain `" y "` as part of the item name rather than a list separator.
   - *Mitigation*: The interactive preview staging area shows the segmented items before they are added to the list, allowing users to remove, adjust, or re-type with a single tap.
4. **PWA Standalone Permissions on iOS**: iOS Safari can be strict with microphone permissions in standalone PWA mode if not triggered by an explicit user tap.
   - *Mitigation*: Only invoke `recognition.start()` inside a synchronous user click/tap event handler.
5. **Background Noise in Supermarkets**: Music, announcements, and chatter in store aisles can produce misrecognized words.
   - *Mitigation*: Staging preview prevents erroneous items from entering the database automatically. Haptic feedback confirms start/stop of listening.

---

### Ready for Proposal
- [x] Codebase and architecture explored.
- [x] Affected areas identified across Domain, Infrastructure, and UI layers.
- [x] Web Speech API specifications, browser support matrix, and offline behavior analyzed.
- [x] Spanish multi-item phrasing ("y", "e", commas, command prefixes, quantities) mapped out.
- [x] Impact on `ShoppingListMatcherService` and matching logic analyzed.
- [x] UI design and UX flow compared and evaluated against CestaCuenta design guidelines.
- [x] Ready to proceed to `sdd-propose` phase for change `voice-shopping-list`.
