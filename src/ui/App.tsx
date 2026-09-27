import React, { useState, useEffect, useMemo } from 'react';
import { ShoppingSession, Money, CartItem } from '../domain/index.js';
import { LocalStorageShoppingSessionRepository } from '../infrastructure/persistence/web/LocalStorageShoppingSessionRepository.js';
import { Header } from './components/Header.js';
import { CartList } from './components/CartList.js';
import { StickyBottomBar } from './components/StickyBottomBar.js';
import { ManualItemModal } from './components/ManualItemModal.js';
import { EditPriceModal } from './components/EditPriceModal.js';
import { FinishModal } from './components/FinishModal.js';

const DEFAULT_STORE_NAME = 'Mi Supermercado';

export const App: React.FC = () => {
  const repository = useMemo(() => new LocalStorageShoppingSessionRepository(), []);

  const [session, setSession] = useState<ShoppingSession | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);

  // Hydrate active session on initial load
  useEffect(() => {
    let mounted = true;

    async function loadActiveSession() {
      try {
        const active = await repository.getActiveSession();
        if (!mounted) return;

        if (active) {
          setSession(active);
        } else {
          const fresh = ShoppingSession.create({ storeName: DEFAULT_STORE_NAME });
          await repository.save(fresh);
          if (mounted) setSession(fresh);
        }
      } catch (err) {
        console.error('Error hydrating session:', err);
        const fallback = ShoppingSession.create({ storeName: DEFAULT_STORE_NAME });
        if (mounted) setSession(fallback);
      }
    }

    loadActiveSession();

    return () => {
      mounted = false;
    };
  }, [repository]);

  // Clone helper to trigger React state updates and persist
  const commitSession = (updatedSession: ShoppingSession) => {
    repository.save(updatedSession).catch((err) => {
      console.error('Failed to save session to storage:', err);
    });

    const cloned = new ShoppingSession({
      id: updatedSession.id,
      startedAt: updatedSession.startedAt,
      endedAt: updatedSession.endedAt,
      status: updatedSession.status,
      storeName: updatedSession.storeName,
      items: updatedSession.items,
    });
    setSession(cloned);
  };

  const handleUpdateStoreName = (name: string) => {
    if (!session) return;
    session.storeName = name;
    commitSession(session);
  };

  const handleAddItem = (name: string, price: Money, isBulk: boolean) => {
    if (!session) return;
    session.addItem({
      name,
      unitPrice: price,
      quantity: 1,
      isBulk,
    });
    commitSession(session);
  };

  const handleIncrementQuantity = (itemId: string) => {
    if (!session) return;
    const item = session.items.find((i) => i.id === itemId);
    if (!item) return;

    session.updateItemQuantity(itemId, item.quantity + 1);
    commitSession(session);
  };

  const handleDecrementQuantity = (itemId: string) => {
    if (!session) return;
    const item = session.items.find((i) => i.id === itemId);
    if (!item) return;

    // Reducir cantidad (o eliminar si es 1)
    session.updateItemQuantity(itemId, item.quantity - 1);
    commitSession(session);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!session) return;
    session.removeItem(itemId);
    commitSession(session);
  };

  const handleSavePrice = (itemId: string, newPrice: Money) => {
    if (!session) return;
    session.updateItemPrice(itemId, newPrice);
    commitSession(session);
  };

  const handleClearCart = () => {
    if (!session || session.items.length === 0) return;
    const confirmClear = window.confirm('¿Deseas vaciar la cesta actual?');
    if (!confirmClear) return;

    session.discard();
    repository.save(session).catch(console.error);

    const freshSession = ShoppingSession.create({
      storeName: session.storeName || DEFAULT_STORE_NAME,
    });
    commitSession(freshSession);
  };

  const handleConfirmFinish = async () => {
    if (!session) return;
    session.complete();
    await repository.save(session);

    const freshSession = ShoppingSession.create({
      storeName: session.storeName || DEFAULT_STORE_NAME,
    });
    commitSession(freshSession);
    setIsFinishModalOpen(false);
  };

  if (!session) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Cargando CestaCuenta...</p>
      </div>
    );
  }

  const items = session.items;
  const lineCount = items.length;
  const totalItemCount = session.totalItemCount();
  const total = session.total();

  return (
    <div className="app-container">
      <Header
        storeName={session.storeName || DEFAULT_STORE_NAME}
        onUpdateStoreName={handleUpdateStoreName}
        lineCount={lineCount}
        itemCount={totalItemCount}
        onClearCart={handleClearCart}
        onOpenFinishModal={() => setIsFinishModalOpen(true)}
      />

      <main className="main-content">
        <CartList
          items={items}
          onIncrementQuantity={handleIncrementQuantity}
          onDecrementQuantity={handleDecrementQuantity}
          onDeleteItem={handleDeleteItem}
          onEditPrice={(item) => setEditingItem(item)}
        />
      </main>

      <StickyBottomBar
        total={total}
        itemCount={totalItemCount}
        onOpenManualModal={() => setIsManualModalOpen(true)}
      />

      <ManualItemModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onAddItem={handleAddItem}
      />

      <EditPriceModal
        isOpen={Boolean(editingItem)}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSavePrice={handleSavePrice}
      />

      <FinishModal
        isOpen={isFinishModalOpen}
        session={session}
        onClose={() => setIsFinishModalOpen(false)}
        onConfirmFinish={handleConfirmFinish}
      />
    </div>
  );
};

export default App;
