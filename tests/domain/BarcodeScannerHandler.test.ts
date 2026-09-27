import { describe, it, expect, beforeEach } from 'vitest';
import { BarcodeScannerHandler } from '../../src/domain/services/BarcodeScannerHandler.js';

describe('BarcodeScannerHandler', () => {
  let handler: BarcodeScannerHandler;

  beforeEach(() => {
    handler = new BarcodeScannerHandler(2000);
  });

  it('permite el primer escaneo de cualquier código válido', () => {
    expect(handler.canProcess('8410123456789')).toBe(true);
  });

  it('bloquea por debounce un segundo escaneo del MISMO código antes de 2000 ms', () => {
    const code = '8410123456789';
    const t0 = 10000;

    expect(handler.canProcess(code, t0)).toBe(true);
    handler.recordScan(code, t0);

    // 500 ms después (dentro del debounce)
    expect(handler.canProcess(code, t0 + 500)).toBe(false);

    // 1999 ms después (dentro del debounce)
    expect(handler.canProcess(code, t0 + 1999)).toBe(false);
  });

  it('permite el escaneo de un código DIFERENTE antes de que transcurran 2000 ms', () => {
    const codeA = '8410123456789';
    const codeB = '5000159459268';
    const t0 = 10000;

    expect(handler.canProcess(codeA, t0)).toBe(true);
    handler.recordScan(codeA, t0);

    // 300 ms después escaneamos otro código distinto
    expect(handler.canProcess(codeB, t0 + 300)).toBe(true);
  });

  it('permite el escaneo del mismo código después de que transcurran 2000 ms', () => {
    const code = '8410123456789';
    const t0 = 10000;

    expect(handler.canProcess(code, t0)).toBe(true);
    handler.recordScan(code, t0);

    // Exactamente 2000 ms después
    expect(handler.canProcess(code, t0 + 2000)).toBe(true);

    // 2500 ms después
    expect(handler.canProcess(code, t0 + 2500)).toBe(true);
  });

  it('limpia el historial de debounce al invocar reset()', () => {
    const code = '8410123456789';
    const t0 = 10000;

    handler.recordScan(code, t0);
    expect(handler.canProcess(code, t0 + 500)).toBe(false);

    handler.reset();

    // Inmediatamente después de reset() se puede procesar el mismo código
    expect(handler.canProcess(code, t0 + 500)).toBe(true);
    expect(handler.getLastBarcode()).toBeNull();
    expect(handler.getLastScanTimestamp()).toBe(0);
  });

  it('soporta duraciones de debounce configurables', () => {
    const shortHandler = new BarcodeScannerHandler(500);
    const code = '8410123456789';
    const t0 = 1000;

    shortHandler.recordScan(code, t0);
    expect(shortHandler.canProcess(code, t0 + 400)).toBe(false);
    expect(shortHandler.canProcess(code, t0 + 500)).toBe(true);
  });

  it('lanza error si se inicializa con debounce negativo', () => {
    expect(() => new BarcodeScannerHandler(-1)).toThrow('debounceMs must be non-negative');
  });

  it('retorna false para códigos vacíos o no válidos en canProcess', () => {
    expect(handler.canProcess('')).toBe(false);
    expect(handler.canProcess('   ')).toBe(false);
    expect(handler.canProcess(null as unknown as string)).toBe(false);
    expect(handler.canProcess(undefined as unknown as string)).toBe(false);
  });

  it('lanza error al intentar registrar códigos vacíos en recordScan', () => {
    expect(() => handler.recordScan('')).toThrow('Barcode must be a non-empty string');
    expect(() => handler.recordScan('   ')).toThrow('Barcode must be a non-empty string');
  });

  it('maneja secuencias alternadas de códigos A -> B -> A', () => {
    const codeA = '8410123456789';
    const codeB = '5000159459268';
    const t0 = 10000;

    handler.recordScan(codeA, t0);
    expect(handler.canProcess(codeA, t0 + 500)).toBe(false);

    // Escaneamos B a t0 + 600
    expect(handler.canProcess(codeB, t0 + 600)).toBe(true);
    handler.recordScan(codeB, t0 + 600);

    // Volver a escanear A a t0 + 700 debe permitirse porque el último fue B
    expect(handler.canProcess(codeA, t0 + 700)).toBe(true);
  });
});
