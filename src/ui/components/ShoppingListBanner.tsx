import React from 'react';
import { ShoppingList } from '../../domain/index.js';
import { ListTodo, Check, Plus, ChevronRight, CheckCircle2 } from 'lucide-react';

export interface ShoppingListBannerProps {
  shoppingList: ShoppingList | null;
  onOpenModal: () => void;
  onToggleItem: (itemId: string) => void;
}

export const ShoppingListBanner: React.FC<ShoppingListBannerProps> = ({
  shoppingList,
  onOpenModal,
  onToggleItem,
}) => {
  const items = shoppingList?.items ?? [];

  // Empty state: No shopping list or 0 items
  if (!shoppingList || items.length === 0) {
    return (
      <section className="shopping-list-banner shopping-list-banner--empty" aria-label="Lista de la compra">
        <div className="shopping-list-empty-content">
          <div className="shopping-list-empty-text">
            <ListTodo size={18} className="shopping-list-icon" aria-hidden="true" />
            <span>¿Tienes una lista para hoy?</span>
          </div>
          <button
            type="button"
            className="btn-create-shopping-list"
            onClick={onOpenModal}
            aria-label="Crear o pegar lista de compra"
          >
            <Plus size={16} aria-hidden="true" />
            <span>+ Crear o pegar lista de compra</span>
          </button>
        </div>
      </section>
    );
  }

  const progress = shoppingList.progress();
  const pendingItems = items.filter((item) => !item.isChecked);
  const isAllCompleted = items.length > 0 && pendingItems.length === 0;
  const progressText = `${progress.completed} de ${progress.total} comprados (${progress.percentage}%)`;

  return (
    <section className="shopping-list-banner" aria-label="Lista de la compra en curso">
      <div className="shopping-list-header-row">
        <button
          type="button"
          className="shopping-list-title-btn"
          onClick={onOpenModal}
          aria-label="Abrir modal para gestionar lista de compra"
          title="Ver o editar lista completa"
        >
          <div className="shopping-list-title-left">
            <ListTodo size={17} className="shopping-list-icon" aria-hidden="true" />
            <span className="shopping-list-title">Lista de compra</span>
          </div>
          <div className="shopping-list-progress-summary">
            <span className="shopping-list-progress-text tabular-nums">
              {progressText}
            </span>
            <ChevronRight size={16} className="shopping-list-chevron" aria-hidden="true" />
          </div>
        </button>
      </div>

      <div
        className="shopping-list-progress-bar-track"
        role="progressbar"
        aria-valuenow={progress.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso de compra: ${progress.completed} de ${progress.total} artículos comprados`}
      >
        <div
          className="shopping-list-progress-bar-fill"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {isAllCompleted ? (
        <div className="shopping-list-completed-notice">
          <CheckCircle2 size={16} className="shopping-list-completed-icon" aria-hidden="true" />
          <span>¡Todos los artículos de la lista comprados!</span>
        </div>
      ) : (
        <div
          className="pending-chips"
          role="region"
          aria-label="Artículos pendientes de compra. Toca para marcar como comprado."
        >
          {pendingItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="pending-chip"
              onClick={() => onToggleItem(item.id)}
              aria-label={`Marcar ${item.name} como comprado`}
              title={`Toca para marcar ${item.name} como comprado`}
            >
              <span className="pending-chip-check-icon" aria-hidden="true">
                <Check size={14} />
              </span>
              <span className="pending-chip-name">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};
