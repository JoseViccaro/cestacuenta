import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ShoppingListModal } from '../../src/ui/components/ShoppingListModal.js';
import { ShoppingList } from '../../src/domain/entities/ShoppingList.js';

describe('ShoppingListModal Component', () => {
  it('returns null when isOpen is false', () => {
    const html = renderToString(
      <ShoppingListModal
        isOpen={false}
        onClose={vi.fn()}
        shoppingList={null}
        onAddItem={vi.fn()}
        onImportText={vi.fn()}
        onToggleItem={vi.fn()}
        onDeleteItem={vi.fn()}
        onClearCompleted={vi.fn()}
      />
    );

    expect(html).toBe('');
  });

  it('renders modal sheet with empty state when open and no items', () => {
    const html = renderToString(
      <ShoppingListModal
        isOpen={true}
        onClose={vi.fn()}
        shoppingList={null}
        onAddItem={vi.fn()}
        onImportText={vi.fn()}
        onToggleItem={vi.fn()}
        onDeleteItem={vi.fn()}
        onClearCompleted={vi.fn()}
      />
    );

    expect(html).toContain('modal-backdrop');
    expect(html).toContain('shopping-list-modal-sheet');
    expect(html).toContain('Lista de la Compra');
    expect(html).toContain('Añadir uno a uno');
    expect(html).toContain('Pegar texto');
    expect(html).toContain('Tu lista está vacía');
    expect(html).toContain('Cerrar');
  });

  it('renders unchecked and checked items properly', () => {
    const list = ShoppingList.create({ title: 'Semana' });
    const item1 = list.addItem('Tomates Raf');
    const item2 = list.addItem('Aceite de Oliva');
    list.checkItem(item2.id);

    const html = renderToString(
      <ShoppingListModal
        isOpen={true}
        onClose={vi.fn()}
        shoppingList={list}
        onAddItem={vi.fn()}
        onImportText={vi.fn()}
        onToggleItem={vi.fn()}
        onDeleteItem={vi.fn()}
        onClearCompleted={vi.fn()}
      />
    );

    // Unchecked item
    expect(html).toContain('Tomates Raf');
    // Checked item with checked row class
    expect(html).toContain('shopping-list-row--checked');
    expect(html).toContain('Aceite de Oliva');
    // Progress pill
    expect(html).toContain('1/2');
    // Clear completed button should be present
    expect(html).toContain('Limpiar comprados (1)');
  });

  it('renders all three input mode tabs including Voz', () => {
    const html = renderToString(
      <ShoppingListModal
        isOpen={true}
        onClose={vi.fn()}
        shoppingList={null}
        onAddItem={vi.fn()}
        onImportText={vi.fn()}
        onToggleItem={vi.fn()}
        onDeleteItem={vi.fn()}
        onClearCompleted={vi.fn()}
      />
    );

    expect(html).toContain('Añadir uno a uno');
    expect(html).toContain('Pegar texto');
    expect(html).toContain('Voz');
  });

  it('renders inline microphone button in single input mode', () => {
    const html = renderToString(
      <ShoppingListModal
        isOpen={true}
        initialMode="single"
        onClose={vi.fn()}
        shoppingList={null}
        onAddItem={vi.fn()}
        onImportText={vi.fn()}
        onToggleItem={vi.fn()}
        onDeleteItem={vi.fn()}
        onClearCompleted={vi.fn()}
      />
    );

    expect(html).toContain('btn-inline-mic');
    expect(html).toContain('Dictar por voz en este campo');
  });

  it('renders unsupported browser fallback card in voice tab when Web Speech is absent', () => {
    const html = renderToString(
      <ShoppingListModal
        isOpen={true}
        initialMode="voice"
        onClose={vi.fn()}
        shoppingList={null}
        onAddItem={vi.fn()}
        onImportText={vi.fn()}
        onToggleItem={vi.fn()}
        onDeleteItem={vi.fn()}
        onClearCompleted={vi.fn()}
      />
    );

    expect(html).toContain('shopping-list-voice-container');
    expect(html).toContain('voice-fallback-card');
    expect(html).toContain('Dictado por voz no disponible');
    expect(html).toContain('Ir a Añadir uno a uno');
    expect(html).toContain('Ir a Pegar texto');
  });

  it('renders active microphone button and transcript box when speech recognition is supported', () => {
    function MockSpeech() {
      return {};
    }
    vi.stubGlobal('window', {
      SpeechRecognition: MockSpeech,
      navigator: { vibrate: vi.fn() },
    });

    try {
      const html = renderToString(
        <ShoppingListModal
          isOpen={true}
          initialMode="voice"
          onClose={vi.fn()}
          shoppingList={null}
          onAddItem={vi.fn()}
          onImportText={vi.fn()}
          onToggleItem={vi.fn()}
          onDeleteItem={vi.fn()}
          onClearCompleted={vi.fn()}
        />
      );

      expect(html).toContain('shopping-list-voice-container');
      expect(html).toContain('btn-voice-mic');
      expect(html).toContain('voice-transcript-box');
      expect(html).toContain('Toca el micrófono para dictar');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
