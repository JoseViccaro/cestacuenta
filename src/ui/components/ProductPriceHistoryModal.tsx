import React, { useEffect } from 'react';
import { X, Award, Store, Clock } from 'lucide-react';
import { ProductPriceComparisonResult } from '../../domain/entities/PriceObservation.js';
import { PriceTrendBadge } from './PriceTrendBadge.js';

export interface ProductPriceHistoryModalProps {
  readonly isOpen: boolean;
  readonly comparison: ProductPriceComparisonResult | null;
  readonly onClose: () => void;
}

function formatRelativeDate(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 30) return `hace ${diffDays} días`;
  if (diffDays < 60) return 'hace 1 mes';
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `hace ${months} meses`;
  }
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export const ProductPriceHistoryModal: React.FC<ProductPriceHistoryModalProps> = ({
  isOpen,
  comparison,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !comparison) {
    return null;
  }

  const {
    productName,
    barcode,
    currentStore,
    currentPrice,
    sameStoreDelta,
    bestHistoricalObservation,
    isCurrentBest,
    potentialSavings,
    storeComparisons,
    sameStoreObservations,
  } = comparison;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="price-history-modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-history-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="price-history-header">
          <div className="price-history-header-main">
            <h2 id="price-history-modal-title" className="price-history-title">
              {productName}
            </h2>
            {barcode && <span className="price-history-barcode-pill">{barcode}</span>}
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

        {/* Current price context */}
        <div className="price-history-current-context">
          <div className="current-price-group">
            <span className="current-price-label">Precio en cesta:</span>
            <span className="current-price-value">{currentPrice.toFormattedString()}</span>
            <span className="current-price-store">en {currentStore}</span>
          </div>
          {sameStoreDelta && (
            <PriceTrendBadge comparison={comparison} />
          )}
        </div>

        {/* Savings banner if cheaper elsewhere */}
        {potentialSavings.cents > 0 && !isCurrentBest && (
          <div className="price-history-savings-banner">
            <div className="savings-banner-icon">
              <Award size={20} />
            </div>
            <div className="savings-banner-content">
              <span className="savings-banner-highlight">
                Más barato en <strong>{bestHistoricalObservation.storeName}</strong>: {bestHistoricalObservation.price.toFormattedString()}
              </span>
              <span className="savings-banner-diff">
                Ahorro potencial: <strong>{potentialSavings.toFormattedString()}</strong>
              </span>
            </div>
          </div>
        )}

        <div className="price-history-modal-body">
          {/* Store Comparison Table */}
          <div className="price-history-section">
            <h3 className="price-history-section-title">
              <Store size={16} /> Comparativa por supermercado
            </h3>
            <div className="store-comparison-table-wrapper">
              <table className="store-comparison-table">
                <thead>
                  <tr>
                    <th>Establecimiento</th>
                    <th>Último precio</th>
                    <th>Fecha</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {storeComparisons.map((comp) => (
                    <tr
                      key={comp.storeName}
                      className={comp.isCurrentStore ? 'row-current-store' : ''}
                    >
                      <td className="cell-store-name">
                        <span>{comp.storeName}</span>
                        {comp.isCurrentStore && (
                          <span className="store-tag store-tag--current">Actual</span>
                        )}
                        {comp.isCheapest && (
                          <span className="store-tag store-tag--cheapest">Mejor</span>
                        )}
                      </td>
                      <td className="cell-store-price tabular-nums">
                        {comp.latestPrice.toFormattedString()}
                      </td>
                      <td className="cell-store-date">{formatRelativeDate(comp.latestDate)}</td>
                      <td className="cell-store-diff tabular-nums">
                        {comp.isCurrentStore
                          ? '—'
                          : comp.diffVsCurrent
                          ? comp.diffVsCurrent.formattedDiff
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chronological Evolution Timeline at Current Store */}
          <div className="price-history-section">
            <h3 className="price-history-section-title">
              <Clock size={16} /> Evolución en {currentStore}
            </h3>
            {sameStoreObservations.length === 0 ? (
              <p className="price-history-empty-timeline">
                Primera vez que compras este producto en {currentStore}.
              </p>
            ) : (
              <ul className="price-timeline-list">
                {sameStoreObservations.map((obs, idx) => (
                  <li key={`${obs.sessionId}-${idx}`} className="price-timeline-item">
                    <div className="timeline-marker" />
                    <div className="timeline-info">
                      <span className="timeline-date">{formatRelativeDate(obs.date)}</span>
                      {obs.isPromotional && (
                        <span className="promo-badge">Promo aplicada</span>
                      )}
                    </div>
                    <span className="timeline-price tabular-nums">
                      {obs.price.toFormattedString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
