import React, { useState, useEffect, useRef } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { CartItem, Money } from '../../domain/index.js';

export interface EditPriceModalProps {
  isOpen: boolean;
  item: CartItem | null;
  onClose: () => void;
  onSavePrice: (itemId: string, newPrice: Money) => void;
}

export const EditPriceModal: React.FC<EditPriceModalProps> = ({
  isOpen,
  item,
  onClose,
  onSavePrice,
}) => {
  const [priceInput, setPriceInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && item) {
      setPriceInput(item.unitPrice.toDecimalString());
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handlePriceChange = (val: string) => {
    setPriceInput(val);
    if (!val.trim()) {
      setError(null);
      return;
    }
    try {
      const parsed = Money.parse(val);
      if (parsed.cents <= 0) {
        setError('El precio debe ser superior a cero');
      } else {
        setError(null);
      }
    } catch {
      setError('Formato no válido (ej: 1,45 o 0,80)');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceInput.trim()) {
      setError('Introduce un precio');
      return;
    }

    try {
      const parsedMoney = Money.parse(priceInput);
      if (parsedMoney.cents <= 0) {
        setError('El precio debe ser superior a cero');
        return;
      }
      onSavePrice(item.id, parsedMoney);
      onClose();
    } catch {
      setError('Formato no válido (ej: 1,45 o 0,80)');
    }
  };

  let isPriceValid = false;
  try {
    if (priceInput.trim()) {
      const parsed = Money.parse(priceInput);
      isPriceValid = parsed.cents > 0;
    }
  } catch {
    isPriceValid = false;
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-price-title"
      onClick={onClose}
    >
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 id="edit-price-title" className="modal-title">
              Modificar Precio Unitario
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {item.name}
            </p>
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label htmlFor="edit-unit-price" className="form-label">
              Nuevo precio unitario en Euros (€)
            </label>
            <input
              id="edit-unit-price"
              ref={inputRef}
              type="text"
              inputMode="decimal"
              className={`form-input form-input-price ${error ? 'input-error' : ''}`}
              value={priceInput}
              onChange={(e) => handlePriceChange(e.target.value)}
              aria-required="true"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'edit-price-error' : undefined}
            />
            {error && (
              <div id="edit-price-error" className="input-feedback-error" role="alert">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-modal-secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-modal-primary"
              disabled={!isPriceValid}
            >
              <Check size={18} />
              <span>Guardar precio</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
