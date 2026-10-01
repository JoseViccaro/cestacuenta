# Capability: voice-input

## Purpose
The `voice-input` capability enables users to populate and update their shopping list in CestaCuenta using natural spoken Spanish dictation via the browser Web Speech API. It protects users from transcription errors and supermarket background chatter through real-time audio-visual feedback, intelligent natural language parsing, and an interactive review staging area prior to persistent list commitment.

---

## Requirements

### 1. Speech Recognition Lifecycle & Platform Detection

- **1.1 Feature Detection**: The system MUST detect whether the host environment supports the Web Speech API (`SpeechRecognition` or `webkitSpeechRecognition`).
- **1.2 Safe Fallback on Unsupported Environments**: When Web Speech API is unavailable (e.g. standard Firefox, restricted webviews, or non-browser environments), the system MUST set `isSupported = false`, MUST NOT throw runtime exceptions during initialization or rendering, and MUST expose appropriate fallback guidance.
- **1.3 Lifecycle States**: The voice recognition subsystem MUST transition deterministically through defined states: `idle`, `starting`, `listening`, `stopping`, and `error`.
- **1.4 Recognition Configuration**: When activated, the recognition adapter MUST configure the recognition instance with:
  - `lang = 'es-ES'` (Spanish locale)
  - `interimResults = true` (delivering real-time transcription updates while the user speaks)
  - `continuous = true` (or single-shot per interaction mode)
- **1.5 User Gesture Triggering**: Recognition activation (`start()`) MUST be initiated from an explicit synchronous user gesture (e.g. tap/click on microphone button) to comply with mobile browser (iOS Safari / Android Chrome) permission policies.
- **1.6 Real-Time Interim Feedback**: While in the `listening` state, the adapter MUST emit interim transcription events to update the UI live transcript preview before final speech segmentation.
- **1.7 Controlled Termination**:
  - The user MUST be able to manually stop listening at any moment by clicking the active microphone button (`stop()`).
  - The system MUST cleanly flush pending transcripts upon stop and return to the `idle` state.
  - The system MUST provide an `abort()` method to cancel ongoing speech recognition without saving or processing current audio.
- **1.8 Sensory Feedback**: The system SHOULD trigger haptic feedback cues (via `Haptics`) when speech recognition starts listening and when it stops.

---

### 2. Spoken Spanish Text Parsing & Item Segmentation

- **2.1 Pure Domain Service**: Text parsing MUST be encapsulated within a pure domain service `SpokenShoppingListParser` having zero external or React dependencies.
- **2.2 Spanish Conjunctions and Connectors**: The parser MUST segment continuous spoken Spanish text into discrete shopping list items using:
  - Punctuation marks (commas `,`, semicolons `;`, periods `.`, newlines `\n`).
  - Conjunction `" y "` (e.g. *"leche, huevos y pan"* $\rightarrow$ `["Leche", "Huevos", "Pan"]`).
  - Conjunction `" e "` before words starting with `i-` or `hi-` (e.g. *"café e infusiones"* $\rightarrow$ `["Café", "Infusiones"]`).
  - Multi-word connectors: `" además de "`, `" y también "`, `" también "`.
- **2.3 Intent & Command Prefix Stripping**: The parser MUST strip conversational command prefixes from the beginning of phrases or individual clauses, including:
  - *"añade a la lista"*, *"añade"*, *"añadir a la lista"*, *"añadir"*
  - *"pon en la lista"*, *"pon"*, *"poner en la lista"*, *"poner"*
  - *"apunta en la lista"*, *"apunta"*, *"apuntar en la lista"*, *"apuntar"*
  - *"comprar"*, *"quiero comprar"*, *"necesito comprar"*
  - Leading politeness markers such as *"por favor"*
- **2.4 Compound Food Preservation**: The parser MUST NOT split established compound food items or common culinary pairs containing `" y "` or `" de "`. Specifically:
  - Recognized compounds such as *"jamón y queso"*, *"sal y pimienta"*, *"fresas con nata"* MUST remain a single list item.
  - Prepositional compounds containing `" de "` (e.g. *"aceite de oliva"*, *"leche de avena"*, *"crema de cacao"*) MUST remain intact.
- **2.5 Quantity & Unit Preservation**: The parser MUST preserve specified quantities, numeric digits, written number words, and measurement units associated with items (e.g. *"2 paquetes de arroz"*, *"tres litros de leche"*, *"4 manzanas"*, *"medio kilo de tomates"*).
- **2.6 Normalization and Sanitization**: For every parsed item, the parser MUST:
  - Trim leading and trailing whitespace and punctuation.
  - Remove empty or whitespace-only tokens.
  - Capitalize the first letter of each item name (sentence-case).
- **2.7 Stop-Word Enhancement for Matching**: `ShoppingListMatcherService` stop-word list MUST be enhanced with Spanish number words (`dos`, `tres`, `cuatro`, `cinco`, `seis`, `siete`, `ocho`, `nueve`, `diez`) and digits so that items dictated with quantities (e.g. *"2 leches"* or *"dos leches"*) correctly match scanned store products (e.g. *"Leche Pascual Entera 1L"*).

---

### 3. Staging and Review Before Commit

- **3.1 Isolation from Persistent List**: Audio transcription MUST NOT immediately commit parsed items to the persistent `ShoppingList` without user confirmation. Parsed items MUST be held in a temporary staging area.
- **3.2 Modal Voice Tab**: `ShoppingListModal` MUST provide a dedicated "Voz" tab (`mode === 'voice'`) featuring:
  - A prominent microphone toggle button reflecting active listening status via animation and icon.
  - A real-time interim transcript display area.
  - A staging preview container displaying parsed items as interactive chips.
- **3.3 Interactive Chip Editing & Removal**:
  - Each staged item chip MUST display the parsed item name and a distinct removal button (`✕`).
  - Clicking removal (`✕`) MUST remove only that item chip from the staging list.
- **3.4 Transcript Manual Adjustment**: The staging area SHOULD display an editable transcript input or textarea allowing users to modify words before re-parsing or confirming.
- **3.5 Batch Confirmation Action**:
  - The UI MUST provide a prominent action button: *"Añadir X artículos a la lista"* (where X is the count of staged items).
  - The button MUST be disabled when 0 items are staged.
  - When pressed, all currently staged items MUST be committed sequentially to `ShoppingList` via `onAddItem`, and the staging area MUST be cleared.
- **3.6 Single-Item Inline Dictation**:
  - The single-item text input in the "Añadir uno a uno" tab MUST provide an inline microphone button.
  - Clicking the inline microphone MUST dictate directly into that specific input field without navigating away from the single mode.

---

### 4. Error Handling and Platform Fallbacks

- **4.1 Unsupported Browser Detection**:
  - When the browser does not support Web Speech API, the "Voz" tab MUST display an explanatory fallback card.
  - The card MUST inform the user that browser-based speech recognition is unavailable on their browser (e.g., Firefox or Brave).
  - The card MUST inform the user that they can use their mobile keyboard's built-in dictation microphone inside any input field.
  - The card MUST offer quick-navigation links to the "Añadir uno a uno" and "Pegar texto" tabs.
- **4.2 Network & Offline Errors**:
  - When the Web Speech API emits `error === 'network'`, the recognition adapter MUST transition out of the `listening` state immediately.
  - The UI MUST display an alert explaining that the browser speech recognition engine requires an internet connection on this device, and recommend using offline keyboard dictation.
- **4.3 Permission Denied**:
  - When the browser emits `error === 'not-allowed'`, the adapter MUST transition to `error` or `idle`.
  - The UI MUST present a clear explanation that microphone permission was denied, with instructions on how to grant permission in browser settings.
- **4.4 Silence & No-Speech Timeout**:
  - When the browser emits `error === 'no-speech'`, the adapter MUST cleanly reset to `idle` without clearing previously staged items or throwing errors.
- **4.5 Hardware & Capture Errors**:
  - When `error === 'audio-capture'` or `error === 'aborted'` occurs, the system MUST cleanly restore the microphone button to the `idle` state.

---

## Scenarios

### Scenario 1: Initializing and Detecting Web Speech API Support
- **Given** a user opens the `ShoppingListModal` on a browser with `window.SpeechRecognition` or `window.webkitSpeechRecognition` present
- **When** the "Voz" tab is rendered
- **Then** `isSupported` MUST be `true`
- **And** the active microphone button MUST be displayed in the `idle` state ready for user interaction.

### Scenario 2: Unsupported Browser Fallback
- **Given** a user opens the `ShoppingListModal` on Firefox or an environment without Web Speech API
- **When** the "Voz" tab is selected
- **Then** `isSupported` MUST be `false`
- **And** the UI MUST display a fallback notice informing the user that speech recognition is not supported in this browser
- **And** the UI MUST suggest using the mobile keyboard dictation microphone in the "Añadir uno a uno" or "Pegar texto" tabs
- **And** the UI MUST NOT crash or log uncaught exceptions.

### Scenario 3: Dictating Multiple Items with Spanish Conjunctions
- **Given** the user is on the "Voz" tab and clicks the microphone button
- **When** the user speaks: *"leche, huevos, tres plátanos y pan"*
- **And** speech recognition completes or the user taps the mic button to stop
- **Then** the microphone state MUST transition back to `idle`
- **And** `SpokenShoppingListParser` MUST parse the utterance into 4 distinct staged items: `["Leche", "Huevos", "Tres plátanos", "Pan"]`
- **And** the UI MUST display 4 removable chips in the staging area
- **And** the confirmation button MUST display *"Añadir 4 artículos a la lista"*.

### Scenario 4: Command Prefix Stripping and Politeness Removal
- **Given** the speech recognition engine captures: *"Por favor añade a la lista dos paquetes de café y comprar azúcar"*
- **When** the transcript is processed by `SpokenShoppingListParser`
- **Then** the prefix *"Por favor añade a la lista"* MUST be stripped
- **And** redundant clause prefix *"comprar"* MUST be stripped from the second item
- **And** the parser MUST output `["Dos paquetes de café", "Azúcar"]`.

### Scenario 5: Protecting Compound Food Names
- **Given** the user dictates: *"Quiero comprar jamón y queso, aceite de oliva y sal y pimienta"*
- **When** `SpokenShoppingListParser` segments the text
- **Then** *"jamón y queso"* MUST be treated as a single item
- **And** *"aceite de oliva"* MUST be treated as a single item
- **And** *"sal y pimienta"* MUST be treated as a single item
- **And** the parsed output MUST be `["Jamón y queso", "Aceite de oliva", "Sal y pimienta"]`.

### Scenario 6: Removing Staged Item Chip Before Commit
- **Given** the staging preview contains 3 chips: `["Leche", "Cerveza", "Pan"]`
- **When** the user clicks the `✕` delete button on the `"Cerveza"` chip
- **Then** the `"Cerveza"` chip MUST be removed from the staging list
- **And** the remaining staged items MUST be `["Leche", "Pan"]`
- **And** the confirmation button MUST update to *"Añadir 2 artículos a la lista"*.

### Scenario 7: Committing Staged Items to the Persistent Shopping List
- **Given** the staging area contains chips `["Leche", "Pan"]`
- **When** the user clicks the *"Añadir 2 artículos a la lista"* button
- **Then** `onAddItem("Leche")` and `onAddItem("Pan")` MUST be invoked
- **And** the staging area and transcript preview MUST be cleared
- **And** the items MUST appear in the shopping list's unchecked items list.

### Scenario 8: Inline Dictation in Single-Item Input
- **Given** the user is on the "Añadir uno a uno" tab with an empty text input
- **When** the user clicks the inline microphone icon and speaks *"Arroz integral"*
- **Then** the text input field MUST be populated with `"Arroz integral"`
- **And** the user MAY edit the text or click "Añadir" to add the single item.

### Scenario 9: Handling Network Errors in Supermarket Offline Conditions
- **Given** the user is inside a supermarket aisle with no internet connection
- **And** the device browser relies on a cloud speech recognition endpoint
- **When** the user starts dictation and the Web Speech API emits an `onerror` event with `error: 'network'`
- **Then** the adapter MUST immediately stop listening and set state to `idle`
- **And** the UI MUST display a clear notification: *"Sin conexión: El dictado por voz del navegador requiere internet. Puedes usar el micrófono del teclado de tu móvil para dictar sin conexión."*
- **And** no corrupted items MUST be added to the list.

### Scenario 10: Handling Microphone Permission Denial
- **Given** the user has blocked microphone access in browser settings
- **When** the user clicks the microphone button
- **And** the Web Speech API emits `error: 'not-allowed'`
- **Then** the adapter MUST transition to `idle` or `error`
- **And** the UI MUST display an alert indicating that microphone permission was denied and provide instructions to grant access.

### Scenario 11: Matching Spoken Items with Quantities in Cart
- **Given** an active shopping list item created as `"2 leches"` or `"Dos paquetes de arroz"`
- **When** the user scans a product named `"Leche Pascual Entera 1L"` or `"Arroz SOS Redondo"`
- **Then** `ShoppingListMatcherService.findMatch` MUST strip number words (`dos`) and digits (`2`) as stop words
- **And** the item MUST match and be automatically checked off.

---

## Data Contracts & Type Definitions

### 1. `SpokenShoppingListParser` (Domain Service)

```typescript
export interface SpokenParserOptions {
  stripPrefixes?: boolean;
  protectCompounds?: boolean;
  preserveQuantities?: boolean;
}

export class SpokenShoppingListParser {
  /**
   * Parses natural spoken Spanish text into individual cleaned shopping list item names.
   * Handles punctuation, conjunctions ('y', 'e'), connectors, prefixes, and compound foods.
   */
  static parse(spokenText: string, options?: SpokenParserOptions): string[];
}
```

### 2. `VoiceRecognitionAdapter` (Infrastructure Adapter)

```typescript
export type VoiceRecognitionState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

export type VoiceRecognitionErrorType =
  | 'not-allowed'
  | 'network'
  | 'no-speech'
  | 'audio-capture'
  | 'not-supported'
  | 'aborted'
  | 'unknown';

export interface VoiceRecognitionError {
  type: VoiceRecognitionErrorType;
  message: string;
  originalError?: unknown;
}

export interface VoiceRecognitionCallbacks {
  onStateChange: (state: VoiceRecognitionState) => void;
  onInterimResult: (transcript: string) => void;
  onFinalResult: (transcript: string) => void;
  onError: (error: VoiceRecognitionError) => void;
}

export interface IVoiceRecognitionAdapter {
  isSupported(): boolean;
  getState(): VoiceRecognitionState;
  start(callbacks: VoiceRecognitionCallbacks): void;
  stop(): void;
  abort(): void;
}
```

### 3. `useVoiceShoppingList` (UI Hook Contract)

```typescript
export interface UseVoiceShoppingListReturn {
  isSupported: boolean;
  state: VoiceRecognitionState;
  isListening: boolean;
  interimTranscript: string;
  stagedItems: string[];
  errorMessage: string | null;
  errorType: VoiceRecognitionErrorType | null;
  startListening: () => void;
  stopListening: () => void;
  removeStagedItem: (index: number) => void;
  updateStagedItem: (index: number, newName: string) => void;
  addStagedItem: (name: string) => void;
  clearStaging: () => void;
  commitStagedItems: (onCommit: (itemName: string) => void) => void;
  clearError: () => void;
}
```

---

## Non-Functional & Quality Requirements

- **Clean Architecture Boundary**: `SpokenShoppingListParser` MUST remain completely free of browser APIs (`window`, `document`, React, etc.) and run identically in Node.js (Vitest) and browser runtimes.
- **SSR & Node Safety**: `VoiceRecognitionAdapter` MUST verify `typeof window !== 'undefined'` before accessing `SpeechRecognition` or `webkitSpeechRecognition`.
- **Accessibility**:
  - The voice microphone button MUST have appropriate `aria-label` states (e.g. *"Iniciar dictado por voz"*, *"Detener dictado por voz"*).
  - Live transcript updates MUST be enclosed in an `aria-live="polite"` region.
  - Interactive item chips MUST have accessible `aria-label` attributes on delete buttons (`"Eliminar {item} de la vista previa"`).
- **Zero Data Loss**: In-progress manual items in `singleInput` or `pasteInput` MUST NOT be wiped out if the user switches to the "Voz" tab and back.
