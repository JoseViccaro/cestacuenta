import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App.js';
import { ErrorBoundary } from './ui/components/ErrorBoundary.js';
import './ui/styles.css';

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
