import React, { useEffect } from 'react';
import { RotateCcw, CheckCircle2 } from 'lucide-react';

export interface ToastUndoProps {
  isOpen: boolean;
  message: string;
  onUndo: () => void;
  onClose: () => void;
  durationMs?: number;
}

export const ToastUndo: React.FC<ToastUndoProps> = ({
  isOpen,
  message,
  onUndo,
  onClose,
  durationMs = 4000,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      onClose();
    }, durationMs);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, message, onClose, durationMs]);

  if (!isOpen) return null;

  return (
    <div
      className="toast-undo-container"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="toast-undo-content">
        <CheckCircle2 size={18} className="toast-icon-success" />
        <span className="toast-undo-message">{message}</span>
      </div>

      <button
        type="button"
        className="toast-undo-btn"
        onClick={() => {
          onUndo();
          onClose();
        }}
        aria-label="Deshacer último escaneo"
      >
        <RotateCcw size={16} />
        <span>Deshacer</span>
      </button>
    </div>
  );
};
