import React from 'react';
import { X, CheckCheck, ShoppingBag, Download } from 'lucide-react';
import { ShoppingSession, ExportService } from '../../domain/index.js';

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

        <div className="modal-actions modal-actions-column">
          <button
            type="button"
            className="btn-modal-export"
            onClick={() => {
              const csv = ExportService.sessionToCsv(session);
              const dateStr =
                session.startedAt instanceof Date
                  ? session.startedAt.toISOString().slice(0, 10)
                  : new Date(session.startedAt).toISOString().slice(0, 10);
              const cleanStore = (session.storeName || 'compra')
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-');
              ExportService.downloadBlob(
                csv,
                `cestacuenta-${cleanStore}-${dateStr}.csv`,
                'text/csv;charset=utf-8;'
              );
            }}
            aria-label="Exportar detalle de la compra a CSV"
          >
            <Download size={18} />
            <span>Exportar detalle a CSV</span>
          </button>

          <div className="modal-actions-row">
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
              <span>Confirmar y archivar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
