import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SetBudgetModal } from '../../src/ui/components/SetBudgetModal.js';
import { Money } from '../../src/domain/value-objects/Money.js';

describe('SetBudgetModal Component', () => {
  const defaultProps = {
    isOpen: true,
    currentBudget: null,
    currentTotal: Money.fromCents(1250), // 12,50 €
    pendingItemCount: 2,
    onClose: vi.fn(),
    onSaveBudget: vi.fn(),
  };

  it('returns empty string / null when isOpen is false', () => {
    const html = renderToString(<SetBudgetModal {...defaultProps} isOpen={false} />);
    expect(html).toBe('');
  });

  it('renders modal dialog sheet with title "Presupuesto de compra" when isOpen is true', () => {
    const html = renderToString(<SetBudgetModal {...defaultProps} />);
    expect(html).toContain('modal-backdrop');
    expect(html).toContain('Presupuesto de compra');
    expect(html).toContain('Guardar');
    expect(html).toContain('Cancelar');
  });

  it('renders 5 preset chips: 20 €, 30 €, 50 €, 75 €, 100 €', () => {
    const html = renderToString(<SetBudgetModal {...defaultProps} />);
    expect(html).toContain('20 €');
    expect(html).toContain('30 €');
    expect(html).toContain('50 €');
    expect(html).toContain('75 €');
    expect(html).toContain('100 €');
  });

  it('renders live preview breakdown displaying current cart total and headroom when budget is active', () => {
    const html = renderToString(
      <SetBudgetModal
        {...defaultProps}
        currentBudget={Money.fromCents(3000)} // 30,00 €
        currentTotal={Money.fromCents(1250)}  // 12,50 €
        pendingItemCount={2}
      />
    );

    // Cart total
    expect(html).toContain('12,50 €');
    // Remaining headroom: 30.00 - 12.50 = 17.50 €
    expect(html).toContain('17,50 €');
    // Margin per pending item: 1750 / 2 = 875 -> 8,75 €
    expect(html).toContain('8,75 €/ítem');
  });

  it('renders "Eliminar presupuesto" button only when currentBudget is present', () => {
    const htmlWithoutBudget = renderToString(<SetBudgetModal {...defaultProps} currentBudget={null} />);
    expect(htmlWithoutBudget).not.toContain('Eliminar presupuesto');

    const htmlWithBudget = renderToString(
      <SetBudgetModal {...defaultProps} currentBudget={Money.fromCents(5000)} />
    );
    expect(htmlWithBudget).toContain('Eliminar presupuesto');
  });
});
