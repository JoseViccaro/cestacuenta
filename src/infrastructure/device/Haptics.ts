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

  /**
   * Triggers subtle haptic feedback and an audio cue when speech recognition starts or stops.
   * Safe to call in SSR, Node/Vitest, and environments where navigator.vibrate or AudioContext is missing.
   */
  triggerVoiceCue(type: 'start' | 'stop'): boolean {
    let vibrated = false;
    const duration = type === 'start' ? 40 : 30;

    // Haptic vibration
    if (
      typeof navigator !== 'undefined' &&
      'vibrate' in navigator &&
      typeof navigator.vibrate === 'function'
    ) {
      try {
        vibrated = navigator.vibrate(duration);
      } catch {
        // Ignore vibration permission errors
      }
    }

    // Gentle audio tone cue (Web Audio API)
    try {
      if (typeof window !== 'undefined') {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();

          oscillator.type = 'sine';
          const freq = type === 'start' ? 880 : 440;
          oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);

          gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);

          oscillator.start();
          oscillator.stop(audioCtx.currentTime + 0.08);

          setTimeout(() => {
            audioCtx.close().catch(() => {});
          }, 150);
        }
      }
    } catch {
      // Audio is optional enhancement
    }

    return vibrated;
  },
};
