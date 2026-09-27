export const Haptics = {
  /**
   * Triggers a short 100ms haptic vibration pulse and an audible scan confirmation beep.
   * Safe to call in SSR, Node/Vitest, and environments where navigator.vibrate or AudioContext is missing.
   */
  triggerScanSuccess(): boolean {
    let vibrated = false;

    // Haptic vibration
    if (
      typeof navigator !== 'undefined' &&
      'vibrate' in navigator &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        vibrated = navigator.vibrate(100);
      } catch {
        // Ignore vibration permission errors
      }
    }

    // Audible confirmation beep (Web Audio API)
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1760, audioCtx.currentTime); // A6 beep (classic POS tone)

        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);

        // Close context after playback to conserve device audio hardware resources
        setTimeout(() => {
          audioCtx.close().catch(() => {});
        }, 200);
      }
    } catch {
      // Audio is optional enhancement; safe fallback
    }

    return vibrated;
  },
};
