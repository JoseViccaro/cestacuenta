import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App.js';
import { ErrorBoundary } from './ui/components/ErrorBoundary.js';
import './ui/styles.css';

// Automatic silent update lifecycle for mobile Standalone PWAs
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  let refreshing = false;
  const hasExistingController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // When a newer Service Worker takes control, seamlessly reload the new assets once
    if (hasExistingController && !refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  const checkUpdate = () => {
    navigator.serviceWorker.ready
      .then((reg) => reg.update())
      .catch(() => {});
  };

  checkUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkUpdate();
    }
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento raíz #root no encontrado en el DOM');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
