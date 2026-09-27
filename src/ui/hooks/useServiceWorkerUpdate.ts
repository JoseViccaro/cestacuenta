import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseServiceWorkerUpdateReturn {
  isUpdateAvailable: boolean;
  updateApp: () => void;
  dismissUpdate: () => void;
}

export function useServiceWorkerUpdate(): UseServiceWorkerUpdateReturn {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let registration: ServiceWorkerRegistration | undefined;

    const checkForUpdates = () => {
      if (registration) {
        registration.update().catch((err) => {
          console.debug('Service Worker update check error:', err);
        });
      }
    };

    // When the new worker activates after SKIP_WAITING, reload once
    let refreshing = false;
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Listen for service worker registration
    navigator.serviceWorker.ready
      .then((reg) => {
        registration = reg;

        // If a new worker is already waiting in background (requires an existing active controller)
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorkerRef.current = reg.waiting;
          setIsUpdateAvailable(true);
        }

        // Detect newly installed worker waiting for activation
        reg.addEventListener('updatefound', () => {
          const installingWorker = reg.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            // Only prompt if there is an existing controller (i.e. this is an update, not first visit)
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              waitingWorkerRef.current = installingWorker;
              setIsUpdateAvailable(true);
            }
          });
        });

        // Trigger an update check on startup
        checkForUpdates();
      })
      .catch((err) => {
        console.debug('ServiceWorker ready error:', err);
      });

    // Check for updates when user returns to the app
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };

    const handleFocus = () => {
      checkForUpdates();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Periodic check every 60 seconds while app is active
    const intervalId = window.setInterval(checkForUpdates, 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.clearInterval(intervalId);
    };
  }, []);

  const updateApp = useCallback(() => {
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
  }, []);

  return {
    isUpdateAvailable: isUpdateAvailable && !isDismissed,
    updateApp,
    dismissUpdate,
  };
}
