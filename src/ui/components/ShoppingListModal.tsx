import React, { useState, useEffect, useRef } from 'react';
import { ShoppingList } from '../../domain/index.js';
import { X, Plus, Trash2, Check, ClipboardList, ListPlus, Sparkles } from 'lucide-react';

export interface ShoppingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  shoppingList: ShoppingList | null;
  onAddItem: (name: string) => void;
  onImportText: (text: string) => void;
  onToggleItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onClearCompleted: () => void;
}

type InputMode = 'single' | 'paste';

export const ShoppingListModal: React.FC<ShoppingListModalProps> = ({
  isOpen,
  onClose,
  shoppingList,
  onAddItem,
  onImportText,
  onToggleItem,
  onDeleteItem,
  onClearCompleted,
}) => {
  const [mode, setMode] = useState<InputMode>('single');
  const [singleInput, setSingleInput] = useState('');
  const [pasteInput, setPasteInput] = useState('');
  const singleInputRef = useRef<HTMLInputElement>(null);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSingleInput('');
      setPasteInput('');
      // Focus appropriate input on open
      setTimeout(() => {
        if (mode === 'single') {
          singleInputRef.current?.focus();
        } else {
          pasteInputRef.current?.focus();
        }
      }, 60);
    }
  }, [isOpen, mode]);

  // Handle Escape key
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

  if (!isOpen) return null;

  const items = shoppingList?.items ?? [];
  const uncheckedItems = items.filter((item) => !item.isChecked);
  const checkedItems = items.filter((item) => item.isChecked);
  const progress = shoppingList?.progress() ?? { total: 0, completed: 0, percentage: 0 };

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = singleInput.trim();
    if (!trimmed) return;
    onAddItem(trimmed);
    setSingleInput('');
    singleInputRef.current?.focus();
  };

  const handleImportLines = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pasteInput.trim();
    if (!trimmed) return;
    onImportText(trimmed);
    setPasteInput('');
    setMode('single');
  };

  const pasteLineCount = pasteInput
    .split('\n')
    .map((l) => l.trim().replace(/^[-*•\d.)\]\s]+/, '').trim())
    .filter((l) => l.length > 0).length;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shopping-list-modal-title"
      onClick={onClose}
    >
      <div
        className="modal-sheet shopping-list-modal-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="shopping-list-modal-title-area">
            <h2 id="shopping-list-modal-title" className="modal-title">
              Lista de la Compra
            </h2>
            {progress.total > 0 && (
              <span className="shopping-list-modal-pill tabular-nums">
                {`${progress.completed}/${progress.total}`}
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn-close-modal"
            onClick={onClose}
            aria-label="Cerrar lista de compra"
          >
            <X size={20} />
          </button>
        </div>

        {/* Input Mode Selector */}
        <div className="shopping-list-mode-toggle" role="tablist" aria-label="Modo de entrada de artículos">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'single'}
            className={`shopping-list-tab ${mode === 'single' ? 'active' : ''}`}
            onClick={() => setMode('single')}
          >
            <Plus size={15} aria-hidden="true" />
            <span>Añadir uno a uno</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'paste'}
            className={`shopping-list-tab ${mode === 'paste' ? 'active' : ''}`}
            onClick={() => setMode('paste')}
          >
            <ClipboardList size={15} aria-hidden="true" />
            <span>Pegar texto</span>
          </button>
        </div>

        {/* Input Forms */}
        {mode === 'single' ? (
          <form onSubmit={handleAddSingle} className="shopping-list-single-form">
            <input
              ref={singleInputRef}
              type="text"
              className="form-input shopping-list-input"
              placeholder="ej. Plátanos de Canarias, Leche..."
              value={singleInput}
              onChange={(e) => setSingleInput(e.target.value)}
              aria-label="Nombre del artículo para la lista de compra"
            />
            <button
              type="submit"
              className="btn-primary-action btn-add-item-action"
              disabled={!singleInput.trim()}
              aria-label="Añadir artículo a la lista"
            >
              <Plus size={18} />
              <span>Añadir</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleImportLines} className="shopping-list-paste-form">
            <textarea
              ref={pasteInputRef}
              className="form-input shopping-list-textarea"
              placeholder={'Pega tu lista aquí (un artículo por línea):\n\nLeche entera\nPan de molde\nHuevos camperos\nManzanas Fuji'}
              rows={4}
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              aria-label="Pega múltiples líneas de artículos"
            />
            <button
              type="submit"
              className="btn-primary-action btn-import-action"
              disabled={pasteLineCount === 0}
              aria-label={`Importar ${pasteLineCount} artículos a la lista`}
            >
              <ListPlus size={18} />
              <span>Importar {pasteLineCount > 0 ? `${pasteLineCount} líneas` : 'líneas'}</span>
            </button>
          </form>
        )}

        {/* Items List */}
        <div className="shopping-list-items-container" role="list" aria-label="Artículos de la lista">
          {items.length === 0 ? (
            <div className="shopping-list-empty-state">
              <Sparkles size={28} className="shopping-list-empty-sparkle" aria-hidden="true" />
              <p className="shopping-list-empty-lead">Tu lista está vacía</p>
              <p className="shopping-list-empty-hint">
                Escribe un artículo arriba o usa la pestaña &quot;Pegar lista completa&quot; para copiar la lista del WhatsApp o notas.
              </p>
            </div>
          ) : (
            <>
              {/* Unchecked Items */}
              {uncheckedItems.map((item) => (
                <div key={item.id} className="shopping-list-row" role="listitem">
                  <button
                    type="button"
                    className="shopping-list-checkbox-btn"
                    onClick={() => onToggleItem(item.id)}
                    aria-label={`Marcar ${item.name} como comprado`}
                  >
                    <span className="shopping-list-checkbox-box" aria-hidden="true" />
                    <span className="shopping-list-row-name">{item.name}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-delete-list-item"
                    onClick={() => onDeleteItem(item.id)}
                    aria-label={`Eliminar ${item.name} de la lista`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {/* Checked Items */}
              {checkedItems.length > 0 && (
                <div className="shopping-list-checked-section">
                  <div className="shopping-list-section-header">
                    <span>{`Comprados (${checkedItems.length})`}</span>
                  </div>
                  {checkedItems.map((item) => (
                    <div
                      key={item.id}
                      className="shopping-list-row shopping-list-row--checked"
                      role="listitem"
                    >
                      <button
                        type="button"
                        className="shopping-list-checkbox-btn"
                        onClick={() => onToggleItem(item.id)}
                        aria-label={`Desmarcar ${item.name}`}
                      >
                        <span className="shopping-list-checkbox-box checked" aria-hidden="true">
                          <Check size={14} />
                        </span>
                        <span className="shopping-list-row-name">{item.name}</span>
                      </button>
                      <button
                        type="button"
                        className="btn-delete-list-item"
                        onClick={() => onDeleteItem(item.id)}
                        aria-label={`Eliminar ${item.name} de la lista`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shopping-list-modal-footer">
          {checkedItems.length > 0 && (
            <button
              type="button"
              className="btn-clear-completed"
              onClick={onClearCompleted}
              aria-label="Limpiar artículos completados de la lista"
            >
              <Trash2 size={15} />
              <span>{`Limpiar comprados (${checkedItems.length})`}</span>
            </button>
          )}
          <button
            type="button"
            className="btn-finish-modal-action"
            onClick={onClose}
            aria-label="Cerrar ventana de lista de compra"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
