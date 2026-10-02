import React, { useState } from 'react';
import { Store, Pencil, Check, Trash2, ShoppingBag, History, Download, Search, X, ListTodo, Wallet } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall.js';
import { BudgetMetrics } from '../../domain/index.js';

export interface HeaderProps {
  storeName: string;
  onUpdateStoreName: (name: string) => void;
  lineCount: number;
  itemCount: number;
  onClearCart: () => void;
  onOpenFinishModal: () => void;
  onOpenHistory?: () => void;
  onOpenHistoryModal?: () => void;
  onOpenShoppingList?: () => void;
  shoppingListProgress?: { completed: number; total: number };
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  budgetMetrics?: BudgetMetrics | null;
  onOpenBudgetModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  storeName,
  onUpdateStoreName,
  lineCount,
  itemCount,
  onClearCart,
  onOpenFinishModal,
  onOpenHistory,
  onOpenHistoryModal,
  onOpenShoppingList,
  shoppingListProgress,
  searchQuery = '',
  onSearchChange,
  budgetMetrics,
  onOpenBudgetModal,
}) => {
  const [isEditingStore, setIsEditingStore] = useState(false);
  const [tempStoreName, setTempStoreName] = useState(storeName);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { isInstallable, promptInstall } = usePwaInstall();

  const handleOpenHistory = onOpenHistory || onOpenHistoryModal;

  const handleStartEdit = () => {
    setTempStoreName(storeName);
    setIsEditingStore(true);
  };

  const handleSaveStore = () => {
    const trimmed = tempStoreName.trim();
    if (trimmed.length > 0) {
      onUpdateStoreName(trimmed);
    }
    setIsEditingStore(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveStore();
    } else if (e.key === 'Escape') {
      setIsEditingStore(false);
    }
  };

  return (
    <header className="app-header" role="banner">
      <div className="header-top-row">
        <div className="header-left">
          {isEditingStore ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="text"
                className="store-name-input"
                value={tempStoreName}
                onChange={(e) => setTempStoreName(e.target.value)}
                onBlur={handleSaveStore}
                onKeyDown={handleKeyDown}
                autoFocus
                aria-label="Nombre del supermercado o tienda"
              />
              <button
                type="button"
                onClick={handleSaveStore}
                className="btn-header-action"
                aria-label="Confirmar nombre de la tienda"
              >
                <Check size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="store-badge-btn"
              onClick={handleStartEdit}
              title="Toca para editar el nombre de la tienda"
              aria-label={`Tienda: ${storeName}. Toca para cambiar el nombre.`}
            >
              <Store size={18} className="store-edit-icon" />
              <span className="store-name-text">{storeName}</span>
              <Pencil size={12} className="store-edit-icon" />
            </button>
          )}
        </div>

        <div className="header-meta">
          <span className="meta-pill">
            {lineCount} {lineCount === 1 ? 'línea' : 'líneas'}
          </span>
          <span>•</span>
          <span>
            {itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}
          </span>
        </div>
      </div>

      <div className="header-actions">
        {onSearchChange && lineCount > 0 && (
          <button
            type="button"
            className={`btn-header-action ${isSearchOpen ? 'active' : ''}`}
            onClick={() => {
              setIsSearchOpen(!isSearchOpen);
              if (isSearchOpen && onSearchChange) {
                onSearchChange('');
              }
            }}
            title={isSearchOpen ? 'Cerrar búsqueda' : 'Buscar artículo'}
            aria-label={isSearchOpen ? 'Cerrar búsqueda' : 'Buscar artículo en la lista'}
          >
            {isSearchOpen ? <X size={16} /> : <Search size={16} />}
          </button>
        )}

        {isInstallable && (
          <button
            type="button"
            className="btn-header-action primary"
            onClick={promptInstall}
            title="Instalar CestaCuenta como app"
            aria-label="Instalar app en la pantalla de inicio"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-text)' }}
          >
            <Download size={16} />
            <span>Instalar</span>
          </button>
        )}

        {onOpenBudgetModal && (
          <button
            type="button"
            className="btn-header-action budget-pill-btn"
            onClick={onOpenBudgetModal}
            title={
              budgetMetrics
                ? `Presupuesto: ${budgetMetrics.limit.toFormattedString()}`
                : 'Configurar presupuesto de compra'
            }
            aria-label={
              budgetMetrics
                ? `Presupuesto: ${budgetMetrics.limit.toFormattedString()}. Estado: ${budgetMetrics.status}. Toca para modificar.`
                : 'Configurar presupuesto de compra'
            }
          >
            <Wallet size={16} />
            <span>{budgetMetrics ? budgetMetrics.limit.toFormattedString() : '+ Presupuesto'}</span>
            {budgetMetrics && (
              <span
                className={`budget-status-dot budget-status-dot--${budgetMetrics.status.toLowerCase()}`}
                aria-hidden="true"
              />
            )}
          </button>
        )}

        {onOpenShoppingList && (
          <button
            type="button"
            className="btn-header-action"
            onClick={onOpenShoppingList}
            title="Ver lista de compra"
            aria-label="Ver lista de compra"
          >
            <ListTodo size={16} />
            <span>Lista</span>
            {shoppingListProgress && shoppingListProgress.total > 0 && (
              <span className="header-badge-pill tabular-nums">
                {shoppingListProgress.completed}/{shoppingListProgress.total}
              </span>
            )}
          </button>
        )}

        {handleOpenHistory && (
          <button
            type="button"
            className="btn-header-action"
            onClick={handleOpenHistory}
            title="Ver historial de compras"
            aria-label="Ver historial de compras"
          >
            <History size={16} />
            <span>Historial</span>
          </button>
        )}

        {lineCount > 0 && (
          <>
            <button
              type="button"
              className="btn-header-action danger"
              onClick={onClearCart}
              title="Vaciar cesta actual"
              aria-label="Vaciar cesta"
            >
              <Trash2 size={16} />
              <span>Vaciar</span>
            </button>

            <button
              type="button"
              className="btn-header-action"
              onClick={onOpenFinishModal}
              title="Finalizar compra"
              aria-label="Finalizar compra"
            >
              <ShoppingBag size={16} />
              <span>Finalizar</span>
            </button>
          </>
        )}
      </div>

      {isSearchOpen && onSearchChange && (
        <div className="header-search-row" style={{ width: '100%', marginTop: '8px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="store-name-input"
              style={{
                width: '100%',
                paddingLeft: '34px',
                paddingRight: searchQuery ? '32px' : '10px',
                backgroundColor: 'var(--bg-surface-elevated)',
                borderRadius: '8px',
                border: '1px solid var(--border-bold)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
              }}
              placeholder="Buscar por nombre o código..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoFocus
              aria-label="Buscar artículo en la cesta"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label="Borrar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
