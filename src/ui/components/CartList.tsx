import React from 'react';
import { ShoppingCart, Trash2, Plus, Minus, Pencil, Scale, Barcode } from 'lucide-react';
import { CartItem } from '../../domain/index.js';

export interface CartListProps {
  items: CartItem[];
  onIncrementQuantity: (itemId: string) => void;
  onDecrementQuantity: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onEditPrice: (item: CartItem) => void;
}

export const CartList: React.FC<CartListProps> = ({
  items,
  onIncrementQuantity,
  onDecrementQuantity,
  onDeleteItem,
  onEditPrice,
}) => {
  if (items.length === 0) {
    return (
      <div className="cart-empty" role="region" aria-label="Cesta vacía">
        <div className="empty-icon-wrap" aria-hidden="true">
          <ShoppingCart size={40} />
        </div>
        <h2 className="empty-title">Cesta vacía</h2>
        <p className="empty-subtitle">
          Cesta vacía. Añadí artículos con el botón inferior
        </p>
      </div>
    );
  }

  return (
    <div className="cart-list" role="list" aria-label="Lista de artículos en la cesta">
      {items.map((item) => (
        <article
          key={item.id}
          className="cart-card"
          role="listitem"
          aria-label={`${item.name}, ${item.quantity} unidades a ${item.unitPrice.toFormattedString()} cada una, subtotal ${item.subtotal().toFormattedString()}`}
        >
          <div className="cart-card-header">
            <div className="item-info">
              <div className="item-title-row">
                <span className="item-name">{item.name}</span>
                {item.isBulk && (
                  <span className="badge badge-bulk" title="Producto pesado a granel">
                    <Scale size={11} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                    Granel / Peso
                  </span>
                )}
                {item.barcode && (
                  <span className="badge badge-barcode" title={`Código: ${item.barcode}`}>
                    <Barcode size={11} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                    {item.barcode}
                  </span>
                )}
              </div>

              <div>
                <button
                  type="button"
                  className="unit-price-interactive"
                  onClick={() => onEditPrice(item)}
                  title="Toca para editar el precio unitario"
                  aria-label={`Precio unitario: ${item.unitPrice.toFormattedString()}. Toca para modificar.`}
                >
                  <span>{item.unitPrice.toFormattedString()} / ud</span>
                  <Pencil size={11} className="edit-hint" />
                </button>
              </div>
            </div>

            <button
              type="button"
              className="btn-delete-item"
              onClick={() => onDeleteItem(item.id)}
              title={`Eliminar ${item.name}`}
              aria-label={`Eliminar ${item.name} de la cesta`}
            >
              <Trash2 size={20} />
            </button>
          </div>

          <div className="cart-card-footer">
            <div className="quantity-controls" role="group" aria-label={`Cantidad para ${item.name}`}>
              <button
                type="button"
                className="btn-qty"
                onClick={() => onDecrementQuantity(item.id)}
                aria-label={`Quitar una unidad de ${item.name}`}
                title="Reducir cantidad"
              >
                <Minus size={18} />
              </button>

              <span className="qty-display" aria-live="polite">
                {item.quantity}
              </span>

              <button
                type="button"
                className="btn-qty"
                onClick={() => onIncrementQuantity(item.id)}
                aria-label={`Añadir otra unidad de ${item.name}`}
                title="Aumentar cantidad"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="item-subtotal-block">
              <span className="subtotal-label">Subtotal</span>
              <span className="subtotal-amount">
                {item.subtotal().toFormattedString()}
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
};
