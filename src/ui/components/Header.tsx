import React, { useState } from 'react';
import { Store, Pencil, Check, Trash2, ShoppingBag, History, Download } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';

export interface HeaderProps {
  storeName: string;
  onUpdateStoreName: (name: string) => void;
  lineCount: number;
  itemCount: number;
  onClearCart: () => void;
  onOpenFinishModal: () => void;
  onOpenHistory?: () => void;
  onOpenHistoryModal?: () => void;
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
}) => {
  const [isEditingStore, setIsEditingStore] = useState(false);
  const [tempStoreName, setTempStoreName] = useState(storeName);
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
        {isInstallable && (
          <button
            type="button"
            className="btn-header-action primary"
            onClick={promptInstall}
            title="Instalar CestaCuenta como app"
            aria-label="Instalar app en la pantalla de inicio"
            style={{ backgroundColor: '#059669', color: '#ffffff' }}
          >
            <Download size={16} />
            <span>Instalar</span>
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
    </header>
  );
};
