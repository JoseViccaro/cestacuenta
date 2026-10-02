import React, { useState, useEffect, useMemo } from 'react';
import { X, Wallet, Trash2, Check } from 'lucide-react';
import { Money } from '../../domain/value-objects/Money.js';

export interface SetBudgetModalProps {
  isOpen: boolean;
  currentBudget: Money | null;
  currentTotal: Money;
  pendingItemCount: number;
  onClose: () => void;
  onSaveBudget: (budget: Money | null) => void;
}

const PRESETS = [20, 30, 50, 75, 100];

export const SetBudgetModal: React.FC<SetBudgetModalProps> = ({
  isOpen,
  currentBudget,
  currentTotal,
  pendingItemCount,
  onClose,
  onSaveBudget,
}) => {
  const [inputValue, setInputValue] = useState<string>(() =>
    currentBudget ? currentBudget.toDecimalString() : ''
  );

  useEffect(() => {
    if (isOpen) {
      if (currentBudget) {
        setInputValue(currentBudget.toDecimalString());
      } else {
        setInputValue('');
      }
    }
  }, [isOpen, currentBudget]);

  const parsedLimit = useMemo<Money | null>(() => {
    const trimmed = inputValue.trim().replace(',', '.');
    if (!trimmed) return null;
    const num = parseFloat(trimmed);
    if (isNaN(num) || num <= 0) return null;
    const cents = Math.round(num * 100);
    return Money.fromCents(cents);
  }, [inputValue]);

  if (!isOpen) {
    return null;
  }

  const handleSelectPreset = (euroAmount: number) => {
    setInputValue(euroAmount.toString());
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (parsedLimit) {
      onSaveBudget(parsedLimit);
      onClose();
    }
  };

  const handleClearBudget = () => {
    onSaveBudget(null);
    onClose();
  };

  // Preview calculations
  let remaining: Money | null = null;
  let overBudget: Money | null = null;
  let marginPerItem: Money | null = null;

  if (parsedLimit) {
    if (currentTotal.cents <= parsedLimit.cents) {
      remaining = parsedLimit.subtract(currentTotal);
      overBudget = Money.zero();
    } else {
      remaining = Money.zero();
      overBudget = currentTotal.subtract(parsedLimit);
    }

    if (pendingItemCount > 0) {
      if (remaining.cents === 0) {
        marginPerItem = Money.zero();
      } else {
        const cents = Math.floor(remaining.cents / pendingItemCount);
        marginPerItem = Money.fromCents(cents);
      }
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-sheet budget-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="modal-header">
          <div className="modal-title-row">
            <Wallet size={20} className="modal-title-icon" />
            <h2 className="modal-title">Presupuesto de compra</h2>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          <label className="budget-input-label" htmlFor="budget-input">
            Límite de gasto deseado (€)
          </label>
          <div className="budget-input-wrapper">
            <input
              id="budget-input"
              type="text"
              inputMode="decimal"
              className="budget-amount-input"
              placeholder="Ej. 50"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
              aria-label="Importe del presupuesto en euros"
            />
            <span className="budget-currency-suffix">€</span>
          </div>

          <div className="preset-chips-section">
            <span className="preset-chips-title">Preajustes rápidos:</span>
            <div className="preset-chips-grid">
              {PRESETS.map((preset) => {
                const isSelected = parsedLimit?.cents === preset * 100;
                return (
                  <button
                    key={preset}
                    type="button"
                    className={`preset-chip ${isSelected ? 'preset-chip--selected' : ''}`}
                    onClick={() => handleSelectPreset(preset)}
                  >
                    {`${preset} €`}
                  </button>
                );
              })}
            </div>
          </div>

          {parsedLimit && (
            <div className="budget-preview-box">
              <div className="preview-row">
                <span className="preview-label">Total cesta actual:</span>
                <span className="preview-value">{currentTotal.toFormattedString()}</span>
              </div>
              {overBudget && overBudget.cents > 0 ? (
                <div className="preview-row preview-row--danger">
                  <span className="preview-label">Excedido por:</span>
                  <span className="preview-value tabular-nums">{`+${overBudget.toFormattedString()}`}</span>
                </div>
              ) : remaining ? (
                <div className="preview-row preview-row--success">
                  <span className="preview-label">Restante disponible:</span>
                  <span className="preview-value tabular-nums">{remaining.toFormattedString()}</span>
                </div>
              ) : null}

              {pendingItemCount > 0 && marginPerItem && (
                <div className="preview-row preview-row--pending">
                  <span className="preview-label">
                    {`Margen por ítem (${pendingItemCount} pendientes):`}
                  </span>
                  <span className="preview-value tabular-nums">
                    {`~${marginPerItem.toFormattedString()}/ítem`}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="modal-actions-column">
            <button
              type="submit"
              className="btn-primary-action btn-full-width"
              disabled={!parsedLimit}
            >
              <Check size={18} />
              <span>Guardar</span>
            </button>

            {currentBudget && (
              <button
                type="button"
                className="budget-danger-btn btn-full-width"
                onClick={handleClearBudget}
              >
                <Trash2 size={16} />
                <span>Eliminar presupuesto</span>
              </button>
            )}

            <button
              type="button"
              className="btn-secondary-action btn-full-width"
              onClick={onClose}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
