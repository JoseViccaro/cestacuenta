import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StickyBottomBar } from '../../src/ui/components/StickyBottomBar.js';
import { Money } from '../../src/domain/value-objects/Money.js';
import { BudgetMetrics } from '../../src/domain/entities/ShoppingSession.js';

describe('StickyBottomBar Component - Budget Gauge Integration', () => {
  const defaultProps = {
    total: Money.fromCents(2500),
    itemCount: 3,
    onOpenManualModal: vi.fn(),
    onScanClick: vi.fn(),
    onOpenBudgetModal: vi.fn(),
  };

  it('does NOT render .budget-gauge when budgetMetrics is null or undefined', () => {
    const htmlNull = renderToString(
      <StickyBottomBar {...defaultProps} budgetMetrics={null} />
    );
    expect(htmlNull).not.toContain('budget-gauge');

    const htmlUndefined = renderToString(
      <StickyBottomBar {...defaultProps} budgetMetrics={undefined} />
    );
    expect(htmlUndefined).not.toContain('budget-gauge');
  });

  it('renders .budget-gauge with WAI-ARIA attributes when budgetMetrics is provided', () => {
    const metrics: BudgetMetrics = {
      limit: Money.fromCents(5000),
      total: Money.fromCents(2500),
      remaining: Money.fromCents(2500),
      overBudget: Money.zero(),
      percentage: 50,
      status: 'NORMAL',
      marginPerPendingItem: null,
    };

    const html = renderToString(
      <StickyBottomBar {...defaultProps} budgetMetrics={metrics} />
    );

    expect(html).toContain('budget-gauge');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-label="Progreso del presupuesto"');
    expect(html).toContain('budget-gauge--normal');
    expect(html).toContain('Restan 25,00 €');
  });

  it('applies warning status modifier class when status is WARNING', () => {
    const metrics: BudgetMetrics = {
      limit: Money.fromCents(5000),
      total: Money.fromCents(4500),
      remaining: Money.fromCents(500),
      overBudget: Money.zero(),
      percentage: 90,
      status: 'WARNING',
      marginPerPendingItem: null,
    };

    const html = renderToString(
      <StickyBottomBar {...defaultProps} budgetMetrics={metrics} />
    );

    expect(html).toContain('budget-gauge--warning');
    expect(html).toContain('Restan 5,00 €');
  });

  it('applies exceeded status modifier class and shows overBudget readout when status is EXCEEDED', () => {
    const metrics: BudgetMetrics = {
      limit: Money.fromCents(5000),
      total: Money.fromCents(5500),
      remaining: Money.zero(),
      overBudget: Money.fromCents(500),
      percentage: 110,
      status: 'EXCEEDED',
      marginPerPendingItem: Money.zero(),
    };

    const html = renderToString(
      <StickyBottomBar {...defaultProps} budgetMetrics={metrics} />
    );

    expect(html).toContain('budget-gauge--exceeded');
    expect(html).toContain('Excedido por 5,00 €');
  });

  it('displays pending item margin chip when marginPerPendingItem is present', () => {
    const metrics: BudgetMetrics = {
      limit: Money.fromCents(5000),
      total: Money.fromCents(2000),
      remaining: Money.fromCents(3000),
      overBudget: Money.zero(),
      percentage: 40,
      status: 'NORMAL',
      marginPerPendingItem: Money.fromCents(750),
    };

    const html = renderToString(
      <StickyBottomBar {...defaultProps} budgetMetrics={metrics} />
    );

    expect(html).toContain('budget-margin-chip');
    expect(html).toContain('~7,50 €/ítem');
  });
});
