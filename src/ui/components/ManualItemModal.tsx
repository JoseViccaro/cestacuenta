import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, AlertCircle, Check, ScanText } from 'lucide-react';
import { Money } from '../../domain/index.js';
import { OcrPriceScannerModal } from './OcrPriceScannerModal.js';

export interface ManualItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (name: string, price: Money, isBulk: boolean) => void;
}

export const ManualItemModal: React.FC<ManualItemModalProps> = ({
  isOpen,
  onClose,
  onAddItem,
}) => {
  const [name, setName] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOcrOpen, setIsOcrOpen] = useState(false);
  const priceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPriceInput('');
      setIsBulk(false);
      setError(null);
      setIsOcrOpen(false);
      // Autofocus the price input on open for quick entry
      setTimeout(() => {
        priceInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

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
      setError('Introduce un precio');
      return;
    }

    try {
      const parsedMoney = Money.parse(priceInput);
      if (parsedMoney.cents <= 0) {
        setError('El precio debe ser superior a cero');
        return;
      }
      const finalName = name.trim().length > 0 ? name.trim() : 'Artículo general';
      onAddItem(finalName, parsedMoney, isBulk);
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
      aria-labelledby="manual-modal-title"
      onClick={onClose}
    >
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="manual-modal-title" className="modal-title">
            Añadir Producto Manual
          </h2>
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
            <div className="form-label-row">
              <label htmlFor="manual-item-price" className="form-label">
                Precio en Euros (€) *
              </label>
              <button
                type="button"
                className="btn-ocr-trigger"
                onClick={() => setIsOcrOpen(true)}
                title="Leer precio con cámara desde la estantería"
                aria-label="Leer precio con cámara"
              >
                <ScanText size={15} />
                <span>Leer precio con cámara</span>
              </button>
            </div>
            <input
              id="manual-item-price"
              ref={priceInputRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={`form-input form-input-price ${error ? 'input-error' : ''}`}
              placeholder="0,00"
              value={priceInput}
              onChange={(e) => handlePriceChange(e.target.value)}
              aria-required="true"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'manual-price-error' : undefined}
            />
            {error && (
              <div id="manual-price-error" className="input-feedback-error" role="alert">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="manual-item-name" className="form-label">
              Nombre del artículo (opcional)
            </label>
            <input
              id="manual-item-name"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="form-input"
              placeholder="Artículo general (ej. Manzanas, Pan...)"
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

      <OcrPriceScannerModal
        isOpen={isOcrOpen}
        onClose={() => setIsOcrOpen(false)}
        onPriceDetected={(detectedPrice) => {
          handlePriceChange(detectedPrice.toDecimalString());
          setIsOcrOpen(false);
        }}
      />
    </div>
  );
};
