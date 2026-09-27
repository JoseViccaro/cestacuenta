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
});
