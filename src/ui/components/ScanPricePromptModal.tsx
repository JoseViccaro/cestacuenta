import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, AlertCircle, Barcode, Check, Database, Globe, Scale } from 'lucide-react';
import { Money, ProductLookupSource } from '../../domain/index.js';

export interface ScanPricePromptModalProps {
  isOpen: boolean;
  barcode: string;
  initialName?: string;
  initialPrice?: Money;
  isScale?: boolean;
  source?: ProductLookupSource;
  onClose: () => void;
  onConfirm: (name: string, price: Money, isBulk: boolean) => void;
}

export const ScanPricePromptModal: React.FC<ScanPricePromptModalProps> = ({
  isOpen,
  barcode,
  initialName,
  initialPrice,
  isScale,
  source,
  onClose,
  onConfirm,
}) => {
  const [name, setName] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const defaultName =
        initialName && initialName.trim().length > 0
          ? initialName.trim()
          : `Producto ${barcode}`;
      setName(defaultName);
      setPriceInput(initialPrice ? initialPrice.toDecimalString() : '');
      setIsBulk(Boolean(isScale));
      setError(null);
      // Autofocus the price input for fast supermarket aisle entry
      setTimeout(() => {
        priceInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, barcode, initialName, initialPrice, isScale]);

  if (!isOpen) return null;

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
      setError('Introduce el precio del lineal');
      return;
    }

    try {
      const parsedMoney = Money.parse(priceInput);
      if (parsedMoney.cents <= 0) {
        setError('El precio debe ser superior a cero');
        return;
      }
      const finalName = name.trim().length > 0 ? name.trim() : `Producto ${barcode}`;
      onConfirm(finalName, parsedMoney, isBulk);
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
      aria-labelledby="scan-price-title"
      onClick={onClose}
    >
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 id="scan-price-title" className="modal-title">
              Nuevo Producto Escaneado
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
              <div className="scanned-barcode-pill">
                <Barcode size={16} />
                <span>{barcode}</span>
              </div>
              {source === 'LOCAL' && (
                <span className="badge-source badge-source-local" title="Recuperado del catálogo local">
                  <Database size={13} />
                  <span>Catálogo local</span>
                </span>
              )}
              {source === 'OPEN_FOOD_FACTS' && (
                <span className="badge-source badge-source-off" title="Encontrado en Open Food Facts">
                  <Globe size={13} />
                  <span>Encontrado en Open Food Facts</span>
                </span>
              )}
              {isScale && (
                <span className="badge-source badge-source-scale" title="Producto pesado en balanza">
                  <Scale size={13} />
                  <span>Producto de balanza</span>
                </span>
              )}
            </div>
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
            <label htmlFor="scan-item-price" className="form-label">
              Precio en lineal (€) *
            </label>
            <input
              id="scan-item-price"
              ref={priceInputRef}
              type="text"
              inputMode="decimal"
              className={`form-input form-input-price ${error ? 'input-error' : ''}`}
              placeholder="0,00"
              value={priceInput}
              onChange={(e) => handlePriceChange(e.target.value)}
              aria-required="true"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'scan-price-error' : undefined}
            />
            {error && (
              <div id="scan-price-error" className="input-feedback-error" role="alert">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="scan-item-name" className="form-label">
              Nombre del artículo
            </label>
            <input
              id="scan-item-name"
              type="text"
              className="form-input"
              placeholder={`Producto ${barcode}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              style={{ display: 'none' }}
              checked={isBulk}
              onChange={(e) => setIsBulk(e.target.checked)}
            />
            <div className="checkbox-custom" aria-hidden="true">
              {isBulk && <Check size={16} strokeWidth={3} />}
            </div>
            <span className="checkbox-label-text">
              Es producto a granel / al peso
            </span>
          </label>

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
              <Plus size={18} />
              <span>Añadir a la cesta</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
