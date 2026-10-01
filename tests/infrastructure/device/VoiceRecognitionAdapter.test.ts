import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VoiceRecognitionAdapter,
  VoiceRecognitionCallbacks,
  VoiceRecognitionError,
} from '../../../src/infrastructure/device/VoiceRecognitionAdapter.js';

class MockSpeechRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

describe('VoiceRecognitionAdapter', () => {
  let mockRecognitionInstance: MockSpeechRecognition;

  beforeEach(() => {
    mockRecognitionInstance = new MockSpeechRecognition();
    function MockSpeechRecognitionConstructor() {
      return mockRecognitionInstance;
    }
    vi.stubGlobal('window', {
      SpeechRecognition: MockSpeechRecognitionConstructor,
      navigator: { vibrate: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Feature detection (isSupported)', () => {
    it('returns true when window.SpeechRecognition is available', () => {
      const adapter = new VoiceRecognitionAdapter();
      expect(adapter.isSupported()).toBe(true);
    });

    it('returns true when window.webkitSpeechRecognition is available', () => {
      vi.stubGlobal('window', {
        webkitSpeechRecognition: function () {
          return mockRecognitionInstance;
        },
      });
      const adapter = new VoiceRecognitionAdapter();
      expect(adapter.isSupported()).toBe(true);
    });

    it('returns false when neither SpeechRecognition nor webkitSpeechRecognition exists', () => {
      vi.stubGlobal('window', {});
      const adapter = new VoiceRecognitionAdapter();
      expect(adapter.isSupported()).toBe(false);
    });

    it('returns false safely in SSR / non-window environment', () => {
      vi.stubGlobal('window', undefined);
      const adapter = new VoiceRecognitionAdapter();
      expect(adapter.isSupported()).toBe(false);
    });
  });

  describe('Lifecycle states and configuration', () => {
    it('initializes in idle state', () => {
      const adapter = new VoiceRecognitionAdapter();
      expect(adapter.getState()).toBe('idle');
    });

    it('configures recognition with es-ES, continuous, and interimResults', () => {
      const adapter = new VoiceRecognitionAdapter();
      const callbacks: VoiceRecognitionCallbacks = {
        onStateChange: vi.fn(),
        onInterimResult: vi.fn(),
        onFinalResult: vi.fn(),
        onError: vi.fn(),
      };

      adapter.start(callbacks);

      expect(mockRecognitionInstance.lang).toBe('es-ES');
      expect(mockRecognitionInstance.continuous).toBe(true);
      expect(mockRecognitionInstance.interimResults).toBe(true);
      expect(mockRecognitionInstance.start).toHaveBeenCalled();
    });

    it('transitions from idle -> starting -> listening upon onstart event', () => {
      const adapter = new VoiceRecognitionAdapter();
      const onStateChange = vi.fn();
      adapter.start({
        onStateChange,
        onInterimResult: vi.fn(),
        onFinalResult: vi.fn(),
        onError: vi.fn(),
      });

      expect(adapter.getState()).toBe('starting');
      expect(onStateChange).toHaveBeenCalledWith('starting');

      // Simulate native recognition start
      mockRecognitionInstance.onstart?.();

      expect(adapter.getState()).toBe('listening');
      expect(onStateChange).toHaveBeenCalledWith('listening');
    });

    it('transitions to stopping and idle when stop() is invoked', () => {
      const adapter = new VoiceRecognitionAdapter();
      const onStateChange = vi.fn();
      adapter.start({
        onStateChange,
        onInterimResult: vi.fn(),
        onFinalResult: vi.fn(),
        onError: vi.fn(),
      });

      mockRecognitionInstance.onstart?.();
      adapter.stop();

      expect(adapter.getState()).toBe('stopping');
      expect(mockRecognitionInstance.stop).toHaveBeenCalled();

      // Simulate native onend
      mockRecognitionInstance.onend?.();
      expect(adapter.getState()).toBe('idle');
      expect(onStateChange).toHaveBeenCalledWith('idle');
    });

    it('aborts cleanly when abort() is invoked', () => {
      const adapter = new VoiceRecognitionAdapter();
      adapter.start({
        onStateChange: vi.fn(),
        onInterimResult: vi.fn(),
        onFinalResult: vi.fn(),
        onError: vi.fn(),
      });

      adapter.abort();
      expect(mockRecognitionInstance.abort).toHaveBeenCalled();
    });
  });

  describe('Transcription result processing', () => {
    it('dispatches interim results to onInterimResult callback', () => {
      const adapter = new VoiceRecognitionAdapter();
      const onInterimResult = vi.fn();
      const onFinalResult = vi.fn();

      adapter.start({
        onStateChange: vi.fn(),
        onInterimResult,
        onFinalResult,
        onError: vi.fn(),
      });

      mockRecognitionInstance.onstart?.();

      // Simulate interim result event
      const interimEvent = {
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: 'leche y huevos' }], { isFinal: false }),
        ],
      };

      mockRecognitionInstance.onresult?.(interimEvent);

      expect(onInterimResult).toHaveBeenCalledWith('leche y huevos');
      expect(onFinalResult).not.toHaveBeenCalled();
    });

    it('dispatches final results to onFinalResult callback', () => {
      const adapter = new VoiceRecognitionAdapter();
      const onInterimResult = vi.fn();
      const onFinalResult = vi.fn();

      adapter.start({
        onStateChange: vi.fn(),
        onInterimResult,
        onFinalResult,
        onError: vi.fn(),
      });

      mockRecognitionInstance.onstart?.();

      // Simulate final result event
      const finalEvent = {
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: 'leche y huevos y pan' }], { isFinal: true }),
        ],
      };

      mockRecognitionInstance.onresult?.(finalEvent);

      expect(onFinalResult).toHaveBeenCalledWith('leche y huevos y pan');
    });
  });

  describe('Error handling & mapping', () => {
    it('maps native not-allowed to typed not-allowed error', () => {
      const adapter = new VoiceRecognitionAdapter();
      let capturedError: VoiceRecognitionError | null = null;

      adapter.start({
        onStateChange: vi.fn(),
        onInterimResult: vi.fn(),
        onFinalResult: vi.fn(),
        onError: (err) => {
          capturedError = err;
        },
      });

      mockRecognitionInstance.onerror?.({ error: 'not-allowed' });

      expect(capturedError).not.toBeNull();
      expect(capturedError?.type).toBe('not-allowed');
      expect(adapter.getState()).toBe('idle');
    });

    it('maps native network to network error and resets to idle', () => {
      const adapter = new VoiceRecognitionAdapter();
      let capturedError: VoiceRecognitionError | null = null;

      adapter.start({
        onStateChange: vi.fn(),
        onInterimResult: vi.fn(),
        onFinalResult: vi.fn(),
        onError: (err) => {
          capturedError = err;
        },
      });

      mockRecognitionInstance.onerror?.({ error: 'network' });

      expect(capturedError).not.toBeNull();
      expect(capturedError?.type).toBe('network');
      expect(adapter.getState()).toBe('idle');
    });

    it('handles no-speech error by cleanly resetting to idle without throwing', () => {
      const adapter = new VoiceRecognitionAdapter();
      const onError = vi.fn();
      const onStateChange = vi.fn();

      adapter.start({
        onStateChange,
        onInterimResult: vi.fn(),
        onFinalResult: vi.fn(),
        onError,
      });

      mockRecognitionInstance.onerror?.({ error: 'no-speech' });

      expect(onError).not.toHaveBeenCalled();
      expect(adapter.getState()).toBe('idle');
    });

    it('emits not-supported error when start is called in unsupported browser', () => {
      vi.stubGlobal('window', {});
      const adapter = new VoiceRecognitionAdapter();
      let capturedError: VoiceRecognitionError | null = null;

      adapter.start({
        onStateChange: vi.fn(),
        onInterimResult: vi.fn(),
        onFinalResult: vi.fn(),
        onError: (err) => {
          capturedError = err;
        },
      });

      expect(capturedError?.type).toBe('not-supported');
    });
  });
});
