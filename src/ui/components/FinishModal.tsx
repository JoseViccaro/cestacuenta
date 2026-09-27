import React from 'react';
import { X, CheckCheck, ShoppingBag } from 'lucide-react';
import { ShoppingSession } from '../../domain/index.js';

export interface FinishModalProps {
  isOpen: boolean;
  session: ShoppingSession;
  onClose: () => void;
  onConfirmFinish: () => void;
}

export const FinishModal: React.FC<FinishModalProps> = ({
  isOpen,
  session,
  onClose,
  onConfirmFinish,
}) => {
  if (!isOpen) return null;

  const total = session.total();
  const itemCount = session.totalItemCount();
  const lineCount = session.items.length;
  const storeName = session.storeName || 'Supermercado';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-modal-title"
      onClick={onClose}
    >
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingBag size={22} className="scan-phase-badge" />
            <h2 id="finish-modal-title" className="modal-title">
              Resumen de Compra
            </h2>
          </div>
          <button
            type="button"
            className="btn-close-modal"
            onClick={onClose}
            aria-label="Cerrar ventana"
          >
            <X size={20} />
          </button>
        </div>

        <div className="finish-summary-box">
          <div className="summary-row">
            <span>Establecimiento</span>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{storeName}</span>
          </div>

          <div className="summary-row">
            <span>Líneas de producto</span>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{lineCount}</span>
          </div>

          <div className="summary-row">
            <span>Artículos totales</span>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{itemCount}</span>
          </div>

          <div className="summary-row total-row">
            <span>Total a Contrastar</span>
            <span className="summary-total-val">{total.toFormattedString()}</span>
          </div>
        </div>

        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
          Al confirmar, esta sesión se archivará en tu historial local y tendrás una cesta nueva limpia lista para tu próxima compra.
        </p>

        <div className="modal-actions">
          <button
            type="button"
            className="btn-modal-secondary"
            onClick={onClose}
          >
            Volver a la cesta
          </button>
          <button
            type="button"
            className="btn-modal-primary"
            onClick={onConfirmFinish}
          >
            <CheckCheck size={20} />
            <span>Confirmar y cerrar compra</span>
          </button>
        </div>
      </div>
    </div>
  );
};
