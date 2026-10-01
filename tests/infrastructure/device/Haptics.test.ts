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
});

