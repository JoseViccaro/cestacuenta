export const Haptics = {
  /**
   * Triggers a short 100ms haptic vibration pulse on supported devices.
   * Safe to call in SSR, Node/Vitest, and environments where navigator.vibrate is missing or restricted.
   */
  triggerScanSuccess(): boolean {
    if (
      typeof navigator !== 'undefined' &&
      'vibrate' in navigator &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        return navigator.vibrate(100);
      } catch {
        return false;
      }
    }
    return false;
  },
};
