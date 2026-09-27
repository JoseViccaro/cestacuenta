export class BarcodeScannerHandler {
  private lastBarcode: string | null = null;
  private lastScanTimestamp: number = 0;
  readonly debounceMs: number;

  constructor(debounceMs: number = 2000) {
    if (debounceMs < 0) {
      throw new Error('debounceMs must be non-negative');
    }
    this.debounceMs = debounceMs;
  }

  canProcess(barcode: string, now: number = Date.now()): boolean {
    if (!barcode || typeof barcode !== 'string') {
      return false;
    }

    const trimmed = barcode.trim();
    if (trimmed.length === 0) {
      return false;
    }

    // If no previous scan, or scanned a different barcode, process immediately
    if (this.lastBarcode === null || this.lastBarcode !== trimmed) {
      return true;
    }

    // Same barcode as last scan: check if debounce window has elapsed
    return now - this.lastScanTimestamp >= this.debounceMs;
  }

  recordScan(barcode: string, now: number = Date.now()): void {
    if (!barcode || typeof barcode !== 'string') {
      throw new Error('Barcode must be a non-empty string');
    }

    const trimmed = barcode.trim();
    if (trimmed.length === 0) {
      throw new Error('Barcode must be a non-empty string');
    }

    this.lastBarcode = trimmed;
    this.lastScanTimestamp = now;
  }

  reset(): void {
    this.lastBarcode = null;
    this.lastScanTimestamp = 0;
  }

  getLastBarcode(): string | null {
    return this.lastBarcode;
  }

  getLastScanTimestamp(): number {
    return this.lastScanTimestamp;
  }
}
