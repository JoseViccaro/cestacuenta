import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Header } from '../../src/ui/components/Header.js';
import { Money } from '../../src/domain/value-objects/Money.js';
import { BudgetMetrics } from '../../src/domain/entities/ShoppingSession.js';

describe('Header Component - Budget Pill Action', () => {
  const defaultProps = {
    storeName: 'Mercadona',
    onUpdateStoreName: vi.fn(),
    lineCount: 2,
    itemCount: 4,
    onClearCart: vi.fn(),
    onOpenFinishModal: vi.fn(),
    onOpenBudgetModal: vi.fn(),
  };

  it('renders "+ Presupuesto" button with wallet icon when budgetMetrics is null or undefined', () => {
    const htmlNull = renderToString(
      <Header {...defaultProps} budgetMetrics={null} />
    );
    expect(htmlNull).toContain('budget-pill-btn');
    expect(htmlNull).toContain('+ Presupuesto');
    expect(htmlNull).toContain('Configurar presupuesto de compra');

    const htmlUndefined = renderToString(
      <Header {...defaultProps} budgetMetrics={undefined} />
    );
    expect(htmlUndefined).toContain('budget-pill-btn');
    expect(htmlUndefined).toContain('+ Presupuesto');
  });

  it('renders budget cap amount and status dot when budgetMetrics is provided', () => {
    const metrics: BudgetMetrics = {
      limit: Money.fromCents(5000), // 50,00 €
      total: Money.fromCents(2000),
      remaining: Money.fromCents(3000),
      overBudget: Money.zero(),
      percentage: 40,
      status: 'NORMAL',
      marginPerPendingItem: null,
    };

    const html = renderToString(
      <Header {...defaultProps} budgetMetrics={metrics} />
    );

    expect(html).toContain('budget-pill-btn');
    expect(html).toContain('50,00 €');
    expect(html).toContain('budget-status-dot');
    expect(html).toContain('budget-status-dot--normal');
    expect(html).toContain('Presupuesto: 50,00 €');
  });

  it('reflects warning and exceeded status dot classes', () => {
    const metricsWarning: BudgetMetrics = {
      limit: Money.fromCents(10000),
      total: Money.fromCents(8500),
      remaining: Money.fromCents(1500),
      overBudget: Money.zero(),
      percentage: 85,
      status: 'WARNING',
      marginPerPendingItem: null,
    };

    const htmlWarning = renderToString(
      <Header {...defaultProps} budgetMetrics={metricsWarning} />
    );
    expect(htmlWarning).toContain('budget-status-dot--warning');

    const metricsExceeded: BudgetMetrics = {
      limit: Money.fromCents(10000),
      total: Money.fromCents(11000),
      remaining: Money.zero(),
      overBudget: Money.fromCents(1000),
      percentage: 110,
      status: 'EXCEEDED',
      marginPerPendingItem: null,
    };

    const htmlExceeded = renderToString(
      <Header {...defaultProps} budgetMetrics={metricsExceeded} />
    );
    expect(htmlExceeded).toContain('budget-status-dot--exceeded');
  });
});
