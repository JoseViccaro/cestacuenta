import { describe, it, expect, vi, afterEach } from 'vitest';
import { Haptics } from '../../../src/infrastructure/device/Haptics.js';

describe('Haptics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ejecuta navigator.vibrate(100) si la API está soportada', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', {
      vibrate: vibrateMock,
    });

    const result = Haptics.triggerScanSuccess();

    expect(vibrateMock).toHaveBeenCalledWith(100);
    expect(result).toBe(true);
    vi.unstubAllGlobals();
  });

  it('retorna false de forma segura si navigator no tiene vibrate', () => {
    vi.stubGlobal('navigator', {});

    const result = Haptics.triggerScanSuccess();

    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  it('captura excepciones y retorna false si navigator.vibrate lanza error', () => {
    const vibrateMock = vi.fn().mockImplementation(() => {
      throw new Error('NotAllowedError');
    });
    vi.stubGlobal('navigator', {
      vibrate: vibrateMock,
    });

    const result = Haptics.triggerScanSuccess();

    expect(vibrateMock).toHaveBeenCalledWith(100);
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  describe('triggerVoiceCue', () => {
    it('ejecuta navigator.vibrate con pulso adecuado al iniciar y detener', () => {
      const vibrateMock = vi.fn().mockReturnValue(true);
      vi.stubGlobal('navigator', {
        vibrate: vibrateMock,
      });

      const startResult = Haptics.triggerVoiceCue('start');
      expect(vibrateMock).toHaveBeenCalledWith(40);
      expect(startResult).toBe(true);

      const stopResult = Haptics.triggerVoiceCue('stop');
      expect(vibrateMock).toHaveBeenCalledWith(30);
      expect(stopResult).toBe(true);

      vi.unstubAllGlobals();
    });

    it('retorna false de forma segura si navigator.vibrate no está disponible', () => {
      vi.stubGlobal('navigator', {});
      const result = Haptics.triggerVoiceCue('start');
      expect(result).toBe(false);
      vi.unstubAllGlobals();
    });
  });

  describe('triggerBudgetWarning', () => {
    it('calls navigator.vibrate([120, 80, 120]) and returns true when supported', () => {
      const vibrateMock = vi.fn().mockReturnValue(true);
      vi.stubGlobal('navigator', {
        vibrate: vibrateMock,
      });

      const result = Haptics.triggerBudgetWarning();
      expect(vibrateMock).toHaveBeenCalledWith([120, 80, 120]);
      expect(result).toBe(true);
      vi.unstubAllGlobals();
    });

    it('returns false safely when navigator.vibrate is absent or throws', () => {
      vi.stubGlobal('navigator', {});
      expect(Haptics.triggerBudgetWarning()).toBe(false);
      vi.unstubAllGlobals();

      vi.stubGlobal('navigator', {
        vibrate: vi.fn().mockImplementation(() => {
          throw new Error('NotAllowedError');
        }),
      });
      expect(Haptics.triggerBudgetWarning()).toBe(false);
      vi.unstubAllGlobals();
    });

    it('handles Web Audio API smoothly and falls back safely when absent or throwing', () => {
      const mockOscillator = {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockGain = {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
      const mockAudioCtx = {
        currentTime: 0,
        destination: {},
        createOscillator: vi.fn().mockReturnValue(mockOscillator),
        createGain: vi.fn().mockReturnValue(mockGain),
        close: vi.fn().mockResolvedValue(undefined),
      };

      function MockAudioContext() {
        return mockAudioCtx;
      }

      vi.stubGlobal('window', {
        AudioContext: MockAudioContext,
      });

      expect(() => Haptics.triggerBudgetWarning()).not.toThrow();
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(660, 0);

      vi.unstubAllGlobals();
    });
  });

  describe('triggerBudgetExceeded', () => {
    it('calls navigator.vibrate([200, 100, 200, 100, 200]) and returns true when supported', () => {
      const vibrateMock = vi.fn().mockReturnValue(true);
      vi.stubGlobal('navigator', {
        vibrate: vibrateMock,
      });

      const result = Haptics.triggerBudgetExceeded();
      expect(vibrateMock).toHaveBeenCalledWith([200, 100, 200, 100, 200]);
      expect(result).toBe(true);
      vi.unstubAllGlobals();
    });

    it('returns false safely when navigator.vibrate is absent or throws', () => {
      vi.stubGlobal('navigator', {});
      expect(Haptics.triggerBudgetExceeded()).toBe(false);
      vi.unstubAllGlobals();

      vi.stubGlobal('navigator', {
        vibrate: vi.fn().mockImplementation(() => {
          throw new Error('NotAllowedError');
        }),
      });
      expect(Haptics.triggerBudgetExceeded()).toBe(false);
      vi.unstubAllGlobals();
    });

    it('handles Web Audio API smoothly and falls back safely when absent or throwing', () => {
      const mockOscillator = {
        type: 'triangle',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockGain = {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
      const mockAudioCtx = {
        currentTime: 0,
        destination: {},
        createOscillator: vi.fn().mockReturnValue(mockOscillator),
        createGain: vi.fn().mockReturnValue(mockGain),
        close: vi.fn().mockResolvedValue(undefined),
      };

      function MockAudioContext() {
        return mockAudioCtx;
      }

      vi.stubGlobal('window', {
        AudioContext: MockAudioContext,
      });

      expect(() => Haptics.triggerBudgetExceeded()).not.toThrow();
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);

      vi.unstubAllGlobals();
    });
  });
});

