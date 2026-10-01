import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  useVoiceShoppingList,
  UseVoiceShoppingListReturn,
} from '../../../src/ui/hooks/useVoiceShoppingList.js';
import {
  IVoiceRecognitionAdapter,
  VoiceRecognitionCallbacks,
  VoiceRecognitionState,
} from '../../../src/infrastructure/device/VoiceRecognitionAdapter.js';

class MockVoiceAdapter implements IVoiceRecognitionAdapter {
  supported = true;
  state: VoiceRecognitionState = 'idle';
  callbacks: VoiceRecognitionCallbacks | null = null;

  isSupported(): boolean {
    return this.supported;
  }
  getState(): VoiceRecognitionState {
    return this.state;
  }
  start(callbacks: VoiceRecognitionCallbacks): void {
    this.callbacks = callbacks;
    this.state = 'listening';
    callbacks.onStateChange('listening');
  }
  stop(): void {
    this.state = 'idle';
    if (this.callbacks) {
      this.callbacks.onStateChange('idle');
    }
  }
  abort(): void {
    this.state = 'idle';
  }
}

describe('useVoiceShoppingList Hook', () => {
  it('initializes with default idle state and empty staging', () => {
    const mockAdapter = new MockVoiceAdapter();
    let hookState: UseVoiceShoppingListReturn | null = null;

    function TestHarness() {
      hookState = useVoiceShoppingList({ adapter: mockAdapter });
      return React.createElement('div', null, 'test');
    }

    renderToString(<TestHarness />);

    expect(hookState).not.toBeNull();
    expect(hookState!.isSupported).toBe(true);
    expect(hookState!.state).toBe('idle');
    expect(hookState!.isListening).toBe(false);
    expect(hookState!.interimTranscript).toBe('');
    expect(hookState!.stagedItems).toEqual([]);
    expect(hookState!.errorMessage).toBeNull();
    expect(hookState!.errorType).toBeNull();
  });

  it('reflects unsupported platform when adapter isSupported returns false', () => {
    const mockAdapter = new MockVoiceAdapter();
    mockAdapter.supported = false;
    let hookState: UseVoiceShoppingListReturn | null = null;

    function TestHarness() {
      hookState = useVoiceShoppingList({ adapter: mockAdapter });
      return React.createElement('div', null, 'test');
    }

    renderToString(<TestHarness />);

    expect(hookState!.isSupported).toBe(false);
  });

  it('supports managing staged items directly (add, remove, clear, commit)', () => {
    let capturedHook: UseVoiceShoppingListReturn | null = null;
    const mockAdapter = new MockVoiceAdapter();

    function TestHarness() {
      capturedHook = useVoiceShoppingList({ adapter: mockAdapter });
      return React.createElement('div', null, 'test');
    }

    renderToString(<TestHarness />);

    expect(typeof capturedHook!.startListening).toBe('function');
    expect(typeof capturedHook!.stopListening).toBe('function');
    expect(typeof capturedHook!.removeStagedItem).toBe('function');
    expect(typeof capturedHook!.updateStagedItem).toBe('function');
    expect(typeof capturedHook!.addStagedItem).toBe('function');
    expect(typeof capturedHook!.clearStaging).toBe('function');
    expect(typeof capturedHook!.commitStagedItems).toBe('function');
    expect(typeof capturedHook!.clearError).toBe('function');
  });
});
