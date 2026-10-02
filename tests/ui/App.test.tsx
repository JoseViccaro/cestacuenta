import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { App, cloneSession, handleBudgetTransition } from '../../src/ui/App.js';
import { ShoppingSession } from '../../src/domain/entities/ShoppingSession.js';
import { Money } from '../../src/domain/value-objects/Money.js';
import { Haptics } from '../../src/infrastructure/device/Haptics.js';

describe('App Integration - Budget Control and Edge Detector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('cloneSession helper', () => {
    it('preserves budgetLimit on session clones across state updates', () => {
      const original = ShoppingSession.create({ storeName: 'Mercadona' });
      original.setBudgetLimit(Money.fromCents(5000));
      original.addItem({
        name: 'Leche',
        unitPrice: Money.fromCents(120),
        quantity: 1,
      });

      const cloned = cloneSession(original);

      expect(cloned.id).toBe(original.id);
      expect(cloned.storeName).toBe('Mercadona');
      expect(cloned.items).toHaveLength(1);
      expect(cloned.budgetLimit).toBeDefined();
      expect(cloned.budgetLimit?.cents).toBe(5000);
      expect(cloned.budgetStatus()).toBe('NORMAL');
    });
  });

  describe('Edge-triggered budget status transition detector', () => {
    it('upward crossing from NORMAL to WARNING triggers Haptics.triggerBudgetWarning and displays warning toast', () => {
      const warningSpy = vi.spyOn(Haptics, 'triggerBudgetWarning').mockReturnValue(true);
      const exceededSpy = vi.spyOn(Haptics, 'triggerBudgetExceeded').mockReturnValue(true);

      const session = ShoppingSession.create();
      session.setBudgetLimit(Money.fromCents(5000)); // 50,00 €
      session.addItem({
        name: 'Item',
        unitPrice: Money.fromCents(4100), // 41,00 € (82%)
        quantity: 1,
      });
      const metrics = session.budgetMetrics();

      const result = handleBudgetTransition(
        'NORMAL',
        'WARNING',
        metrics,
        {
          onWarning: () => Haptics.triggerBudgetWarning(),
          onExceeded: () => Haptics.triggerBudgetExceeded(),
        }
      );

      expect(warningSpy).toHaveBeenCalledTimes(1);
      expect(exceededSpy).not.toHaveBeenCalled();
      expect(result.triggeredWarning).toBe(true);
      expect(result.toastMessage).toBe('Atención: Has alcanzado el 80% de tu presupuesto');
    });

    it('upward crossing from WARNING to EXCEEDED triggers Haptics.triggerBudgetExceeded and displays alert toast', () => {
      const warningSpy = vi.spyOn(Haptics, 'triggerBudgetWarning').mockReturnValue(true);
      const exceededSpy = vi.spyOn(Haptics, 'triggerBudgetExceeded').mockReturnValue(true);

      const session = ShoppingSession.create();
      session.setBudgetLimit(Money.fromCents(5000)); // 50,00 €
      session.addItem({
        name: 'Item',
        unitPrice: Money.fromCents(5500), // 55,00 € (exceeded by 5,00 €)
        quantity: 1,
      });
      const metrics = session.budgetMetrics();

      const result = handleBudgetTransition(
        'WARNING',
        'EXCEEDED',
        metrics,
        {
          onWarning: () => Haptics.triggerBudgetWarning(),
          onExceeded: () => Haptics.triggerBudgetExceeded(),
        }
      );

      expect(exceededSpy).toHaveBeenCalledTimes(1);
      expect(warningSpy).not.toHaveBeenCalled();
      expect(result.triggeredExceeded).toBe(true);
      expect(result.toastMessage).toBe('Presupuesto superado: Te has pasado por 5,00 €');
    });

    it('subsequent item additions while remaining in EXCEEDED do NOT trigger duplicate alerts or toasts', () => {
      const warningSpy = vi.spyOn(Haptics, 'triggerBudgetWarning').mockReturnValue(true);
      const exceededSpy = vi.spyOn(Haptics, 'triggerBudgetExceeded').mockReturnValue(true);

      const session = ShoppingSession.create();
      session.setBudgetLimit(Money.fromCents(5000));
      session.addItem({
        name: 'Item 1',
        unitPrice: Money.fromCents(5500),
        quantity: 1,
      });
      const metrics = session.budgetMetrics();

      const result = handleBudgetTransition(
        'EXCEEDED',
        'EXCEEDED',
        metrics,
        {
          onWarning: () => Haptics.triggerBudgetWarning(),
          onExceeded: () => Haptics.triggerBudgetExceeded(),
        }
      );

      expect(warningSpy).not.toHaveBeenCalled();
      expect(exceededSpy).not.toHaveBeenCalled();
      expect(result.triggeredWarning).toBe(false);
      expect(result.triggeredExceeded).toBe(false);
      expect(result.toastMessage).toBeNull();
    });

    it('downward status transition updates status silently without sensory alerts or warning toasts', () => {
      const warningSpy = vi.spyOn(Haptics, 'triggerBudgetWarning').mockReturnValue(true);
      const exceededSpy = vi.spyOn(Haptics, 'triggerBudgetExceeded').mockReturnValue(true);

      const session = ShoppingSession.create();
      session.setBudgetLimit(Money.fromCents(5000));
      session.addItem({
        name: 'Item',
        unitPrice: Money.fromCents(4200),
        quantity: 1,
      });
      const metrics = session.budgetMetrics();

      const result = handleBudgetTransition(
        'EXCEEDED',
        'WARNING',
        metrics,
        {
          onWarning: () => Haptics.triggerBudgetWarning(),
          onExceeded: () => Haptics.triggerBudgetExceeded(),
        }
      );

      expect(warningSpy).not.toHaveBeenCalled();
      expect(exceededSpy).not.toHaveBeenCalled();
      expect(result.triggeredWarning).toBe(false);
      expect(result.triggeredExceeded).toBe(false);
      expect(result.toastMessage).toBeNull();
    });
  });

  describe('App initial render smoke test', () => {
    it('renders loading state without throwing error', () => {
      const html = renderToString(<App />);
      expect(html).toContain('Cargando CestaCuenta...');
    });
  });
});
