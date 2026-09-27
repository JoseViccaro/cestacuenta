import { useState, useEffect, useCallback } from 'react';

export interface UseServiceWorkerUpdateReturn {
  isUpdateAvailable: boolean;
  updateApp: () => void;
  dismissUpdate: () => void;
}

export function useServiceWorkerUpdate(): UseServiceWorkerUpdateReturn {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

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

    // Listen for service worker registration
    navigator.serviceWorker.ready
      .then((reg) => {
        registration = reg;

        // If a new worker is already waiting, flag update immediately
        if (reg.waiting) {
          setIsUpdateAvailable(true);
        }

        // Detect new versions entering the update lifecycle
        reg.addEventListener('updatefound', () => {
          const installingWorker = reg.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setIsUpdateAvailable(true);
            }
          });
        });

        // Trigger an immediate check on startup
        checkForUpdates();
      })
      .catch((err) => {
        console.debug('ServiceWorker ready error:', err);
      });

    // Check for updates when user returns to the app (unminimizes / unlocks screen)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };

    const handleFocus = () => {
      checkForUpdates();
    };

    // If new worker took control via skipWaiting / clientsClaim
    const handleControllerChange = () => {
      setIsUpdateAvailable(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Periodic check every 60 seconds while app is in use
    const intervalId = window.setInterval(checkForUpdates, 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.clearInterval(intervalId);
    };
  }, []);

  const updateApp = useCallback(() => {
    window.location.reload();
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
