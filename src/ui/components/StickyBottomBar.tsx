import React from 'react';
import { Plus, Scan, Info } from 'lucide-react';
import { Money } from '../../domain/index.js';

export interface StickyBottomBarProps {
  total: Money;
  itemCount: number;
  onOpenManualModal: () => void;
  onScanClick?: () => void;
}

export const StickyBottomBar: React.FC<StickyBottomBarProps> = ({
  total,
  itemCount,
  onOpenManualModal,
  onScanClick,
}) => {
  return (
    <footer className="sticky-bottom-bar" role="contentinfo">
      <div className="sticky-bar-inner">
        <div className="total-display-card">
          <div className="total-meta-info">
            <div className="total-label-row">
              <span>Total Estimado</span>
              <span className="meta-pill">
                {itemCount} {itemCount === 1 ? 'ud' : 'uds'}
              </span>
            </div>
            <div
              className="total-disclaimer"
              title="Este importe es una estimación precisa. El ticket emitido por la caja registradora prevalece."
            >
              <Info size={12} />
              <span>El ticket final prevalece</span>
            </div>
          </div>

          <div
            className="total-highlight"
            aria-live="polite"
            aria-atomic="true"
            aria-label={`Total estimado: ${total.toFormattedString()}`}
          >
            {total.toFormattedString()}
          </div>
        </div>

        <div className="bottom-actions-row">
          <button
            type="button"
            className="btn-primary-action"
            onClick={onScanClick}
            aria-label="Escanear código de barras"
          >
            <Scan size={22} strokeWidth={2.5} />
            <span>Escanear</span>
          </button>

          <button
            type="button"
            className="btn-secondary-action"
            onClick={onOpenManualModal}
            aria-label="Añadir artículo manual a la cesta"
          >
            <Plus size={18} />
            <span>+ Manual</span>
          </button>
        </div>
      </div>
    </footer>
  );
};
