import React from 'react';
import { Plus, Scan, Info } from 'lucide-react';
import { Money, BudgetMetrics } from '../../domain/index.js';

export interface StickyBottomBarProps {
  total: Money;
  itemCount: number;
  budgetMetrics?: BudgetMetrics | null;
  onOpenManualModal: () => void;
  onScanClick?: () => void;
  onOpenBudgetModal?: () => void;
}

export const StickyBottomBar: React.FC<StickyBottomBarProps> = ({
  total,
  itemCount,
  budgetMetrics,
  onOpenManualModal,
  onScanClick,
  onOpenBudgetModal,
}) => {
  return (
    <footer className="sticky-bottom-bar" role="contentinfo">
      <div className="sticky-bar-inner">
        {budgetMetrics && (
          <div
            className={`budget-gauge budget-gauge--${budgetMetrics.status.toLowerCase()}`}
            role="progressbar"
            aria-valuenow={budgetMetrics.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso del presupuesto"
            onClick={onOpenBudgetModal}
            tabIndex={onOpenBudgetModal ? 0 : undefined}
            onKeyDown={(e) => {
              if (onOpenBudgetModal && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onOpenBudgetModal();
              }
            }}
          >
            <div className="budget-gauge-header">
              <span className="budget-headroom-text">
                {budgetMetrics.status === 'EXCEEDED'
                  ? `Excedido por ${budgetMetrics.overBudget.toFormattedString()}`
                  : `Restan ${budgetMetrics.remaining.toFormattedString()}`}
              </span>
              {budgetMetrics.marginPerPendingItem !== null && (
                <span className="budget-margin-chip">
                  {`~${budgetMetrics.marginPerPendingItem.toFormattedString()}/ítem`}
                </span>
              )}
            </div>
            <div className="budget-progress-track">
              <div
                className="budget-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, budgetMetrics.percentage))}%` }}
              />
            </div>
          </div>
        )}

        <div className="total-display-card">
          <div className="total-meta-info">
            <div className="total-label-row">
              <span>Total en cesta</span>
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
