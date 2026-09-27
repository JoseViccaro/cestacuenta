import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  History,
  Download,
  Calendar,
  Store,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Check,
  Barcode,
  Scale,
  ShoppingBag,
} from 'lucide-react';
import {
  ShoppingSession,
  ShoppingSessionRepository,
  ExportService,
} from '../../domain/index.js';

export interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionRepository: ShoppingSessionRepository;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  sessionRepository,
}) => {
  const [history, setHistory] = useState<ShoppingSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const pastSessions = await sessionRepository.listHistory(100, 0);
      setHistory(pastSessions);
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionRepository]);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      setExpandedSessionIds(new Set());
      setFeedbackMessage(null);
    }
  }, [isOpen, loadHistory]);

  // Handle escape key to close modal
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

  const toggleExpand = (sessionId: string) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 3500);
  };

  const handleExportAll = () => {
    if (history.length === 0) return;
    const csv = ExportService.historyToCsv(history);
    const dateStr = new Date().toISOString().slice(0, 10);
    ExportService.downloadBlob(
      csv,
      `cestacuenta-historial-${dateStr}.csv`,
      'text/csv;charset=utf-8;'
    );
    showFeedback('¡Historial completo descargado como CSV!');
  };

  const handleExportSingleSession = (session: ShoppingSession, e: React.MouseEvent) => {
    e.stopPropagation();
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
    showFeedback(`¡Compra en ${session.storeName || 'Supermercado'} exportada!`);
  };

  const formatSessionDate = (date: Date | string): string => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return 'Fecha no disponible';
      return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return String(date);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
      onClick={onClose}
    >
      <div
        className="modal-sheet history-modal-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="history-icon-badge" aria-hidden="true">
              <History size={22} />
            </div>
            <div>
              <h2 id="history-modal-title" className="modal-title">
                Historial de Compras
              </h2>
              <p className="history-subtitle">
                {history.length} {history.length === 1 ? 'compra registrada' : 'compras registradas'}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-close-modal"
            onClick={onClose}
            aria-label="Cerrar historial"
          >
            <X size={20} />
          </button>
        </div>

        {/* Global Action Bar */}
        {history.length > 0 && (
          <div className="history-global-actions">
            <button
              type="button"
              className="btn-export-all"
              onClick={handleExportAll}
              aria-label="Descargar todo el historial en formato CSV"
            >
              <Download size={18} />
              <span>Descargar todo el historial (CSV)</span>
            </button>
          </div>
        )}

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div className="history-feedback-toast" role="status" aria-live="polite">
            <Check size={16} />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Content list or Loading/Empty state */}
        <div className="history-content-scroll" tabIndex={0} aria-label="Lista de compras anteriores">
          {isLoading ? (
            <div className="history-empty-state">
              <p style={{ color: 'var(--text-secondary)' }}>Cargando compras anteriores...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="history-empty-state">
              <div className="history-empty-icon" aria-hidden="true">
                <ShoppingBag size={48} />
              </div>
              <h3 className="history-empty-title">Aún no hay compras finalizadas</h3>
              <p className="history-empty-description">
                Cuando completes una sesión de compra desde el botón «Finalizar», aparecerá aquí
                organizada por fecha para que puedas consultar su desglose y exportarla a CSV o JSON.
              </p>
            </div>
          ) : (
            <div className="history-cards-list">
              {history.map((session) => {
                const isExpanded = expandedSessionIds.has(session.id);
                const total = session.total();
                const totalItemCount = session.totalItemCount();
                const lineCount = session.items.length;
                const formattedDate = formatSessionDate(session.startedAt);
                const store = session.storeName?.trim() || 'Compra en supermercado';
                const detailId = `history-detail-${session.id}`;
                const triggerId = `history-trigger-${session.id}`;

                return (
                  <article
                    key={session.id}
                    className={`history-card ${isExpanded ? 'is-expanded' : ''}`}
                    aria-labelledby={triggerId}
                  >
                    <div
                      className="history-card-header"
                      onClick={() => toggleExpand(session.id)}
                      role="button"
                      id={triggerId}
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-controls={detailId}
                      aria-label={`${store}, fecha ${formattedDate}, ${totalItemCount} artículos, total ${total.toFormattedString()}. Toca para ${isExpanded ? 'ocultar' : 'ver'} desglose.`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpand(session.id);
                        }
                      }}
                    >
                      <div className="history-card-info">
                        <div className="history-card-topline">
                          <span className="history-date">
                            <Calendar size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            {formattedDate}
                          </span>
                          <span className="history-store-tag">
                            <Store size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            {store}
                          </span>
                        </div>

                        <div className="history-card-metrics">
                          <span className="history-count">
                            {totalItemCount} {totalItemCount === 1 ? 'artículo' : 'artículos'} ({lineCount} {lineCount === 1 ? 'línea' : 'líneas'})
                          </span>
                          <span className="history-total-price">
                            {total.toFormattedString()}
                          </span>
                        </div>
                      </div>

                      <div className="history-card-actions">
                        <button
                          type="button"
                          className="btn-export-session"
                          onClick={(e) => handleExportSingleSession(session, e)}
                          title={`Exportar esta compra (${store}) a CSV`}
                          aria-label={`Exportar compra del ${formattedDate} en ${store} a CSV`}
                        >
                          <FileSpreadsheet size={16} />
                          <span className="btn-export-session-text">CSV</span>
                        </button>

                        <div className="history-accordion-indicator" aria-hidden="true">
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                      </div>
                    </div>

                    {/* Accordion detail */}
                    {isExpanded && (
                      <div
                        id={detailId}
                        className="history-card-body"
                        role="region"
                        aria-labelledby={triggerId}
                      >
                        <h4 className="history-breakdown-title">
                          Desglose de productos ({lineCount})
                        </h4>

                        {session.items.length === 0 ? (
                          <p className="history-item-empty">No se registraron productos en esta compra.</p>
                        ) : (
                          <div className="history-items-table">
                            {session.items.map((item) => (
                              <div key={item.id} className="history-item-row">
                                <div className="history-item-col-info">
                                  <span className="history-item-name">{item.name}</span>
                                  <div className="history-item-badges">
                                    {item.isBulk && (
                                      <span className="badge badge-bulk">
                                        <Scale size={10} style={{ marginRight: '3px' }} />
                                        Granel
                                      </span>
                                    )}
                                    {item.barcode && (
                                      <span className="badge badge-barcode">
                                        <Barcode size={10} style={{ marginRight: '3px' }} />
                                        {item.barcode}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="history-item-col-calc">
                                  <span className="history-item-unit">
                                    {item.quantity} × {item.unitPrice.toFormattedString()}
                                  </span>
                                  {item.discount.cents > 0 && (
                                    <span className="history-item-discount">
                                      Desc: -{item.discount.toFormattedString()}
                                    </span>
                                  )}
                                  <span className="history-item-subtotal">
                                    {item.subtotal().toFormattedString()}
                                  </span>
                                </div>
                              </div>
                            ))}

                            <div className="history-breakdown-total-row">
                              <span>Total final de compra</span>
                              <span className="history-breakdown-total-val">
                                {total.toFormattedString()}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
