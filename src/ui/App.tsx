import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingSession,
  Money,
  CartItem,
  ProductReference,
  BarcodeScannerHandler,
  ProductLookupService,
  ProductLookupResult,
} from '../domain/index.js';
import { LocalStorageShoppingSessionRepository } from '../infrastructure/persistence/web/LocalStorageShoppingSessionRepository.js';
import { LocalStorageProductCatalogRepository } from '../infrastructure/persistence/web/LocalStorageProductCatalogRepository.js';
import { OpenFoodFactsClient } from '../infrastructure/external/OpenFoodFactsClient.js';
import { Haptics } from '../infrastructure/device/Haptics.js';
import { Header } from './components/Header.js';
import { CartList } from './components/CartList.js';
import { StickyBottomBar } from './components/StickyBottomBar.js';
import { ManualItemModal } from './components/ManualItemModal.js';
import { EditPriceModal } from './components/EditPriceModal.js';
import { FinishModal } from './components/FinishModal.js';
import { ScannerModal } from './components/ScannerModal.js';
import { ScanPricePromptModal } from './components/ScanPricePromptModal.js';
import { ToastUndo } from './components/ToastUndo.js';
import { HistoryModal } from './components/HistoryModal.js';

const DEFAULT_STORE_NAME = 'Mi Supermercado';

interface UndoState {
  itemId: string;
  previousQuantity: number;
  itemName: string;
}

export const App: React.FC = () => {
  const repository = useMemo(() => new LocalStorageShoppingSessionRepository(), []);
  const catalogRepository = useMemo(() => new LocalStorageProductCatalogRepository(), []);
  const offClient = useMemo(() => new OpenFoodFactsClient(), []);
  const productLookupService = useMemo(
    () => new ProductLookupService(catalogRepository, offClient),
    [catalogRepository, offClient]
  );
  const barcodeScannerHandler = useMemo(() => new BarcodeScannerHandler(2000), []);

  const [session, setSession] = useState<ShoppingSession | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Scanner and ScanPrice state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [pendingScanCode, setPendingScanCode] = useState<string | null>(null);
  const [pendingLookupResult, setPendingLookupResult] = useState<ProductLookupResult | null>(null);
  const [isScanPriceModalOpen, setIsScanPriceModalOpen] = useState(false);

  // Undo Toast state
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isToastOpen, setIsToastOpen] = useState(false);

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

    // Increment history key so HistoryModal reloads the completed purchase
    setHistoryRefreshKey((k) => k + 1);

    const freshSession = ShoppingSession.create({
      storeName: session.storeName || DEFAULT_STORE_NAME,
    });
    commitSession(freshSession);
    setIsFinishModalOpen(false);
  };

  // Barcode scanning flow (Fase 2 & 3)
  const handleBarcodeScanned = async (barcode: string) => {
    if (!session) return;

    const trimmed = barcode.trim();
    if (!trimmed) return;

    if (!barcodeScannerHandler.canProcess(trimmed)) {
      return;
    }
    barcodeScannerHandler.recordScan(trimmed);

    // Look for existing item in active cart with matching barcode
    const existingItem = session.items.find((item) => item.barcode === trimmed);

    if (existingItem) {
      // Existing item in cart: auto-increment +1, haptics, toast with undo
      const { item } = session.scanBarcode(
        trimmed,
        existingItem.unitPrice,
        existingItem.name,
        existingItem.isBulk
      );
      commitSession(session);
      Haptics.triggerScanSuccess();

      setUndoState({
        itemId: item.id,
        previousQuantity: existingItem.quantity,
        itemName: existingItem.name,
      });
      setToastMessage(`Añadido: ${existingItem.name} (${item.quantity} uds en total)`);
      setIsToastOpen(true);
    } else {
      // New barcode in cart: lookup in local catalog / Open Food Facts / Scale
      const lookupResult = await productLookupService.lookup(trimmed);
      setPendingScanCode(trimmed);
      setPendingLookupResult(lookupResult);
      setIsScanPriceModalOpen(true);
    }
  };

  const handleConfirmScanPrice = (name: string, price: Money, isBulk: boolean) => {
    if (!session || !pendingScanCode) return;

    const barcode = pendingScanCode;
    const { item } = session.scanBarcode(barcode, price, name, isBulk);
    commitSession(session);
    Haptics.triggerScanSuccess();

    // Guardar o actualizar la referencia en el catálogo local
    const productRef = new ProductReference({
      barcode,
      name,
      lastPrice: price,
      updatedAt: new Date(),
    });
    catalogRepository.save(productRef).catch((err) => {
      console.error('Failed to save product reference to catalog:', err);
    });

    setUndoState({
      itemId: item.id,
      previousQuantity: 0,
      itemName: item.name,
    });
    setToastMessage(`Añadido: ${item.name}`);
    setIsToastOpen(true);

    setIsScanPriceModalOpen(false);
    setPendingScanCode(null);
    setPendingLookupResult(null);
  };

  const handleCloseScanPriceModal = () => {
    setIsScanPriceModalOpen(false);
    setPendingScanCode(null);
    setPendingLookupResult(null);
    barcodeScannerHandler.reset();
  };

  const handleUndo = () => {
    if (!session || !undoState) return;

    if (undoState.previousQuantity <= 0) {
      session.removeItem(undoState.itemId);
    } else {
      session.updateItemQuantity(undoState.itemId, undoState.previousQuantity);
    }
    commitSession(session);

    setUndoState(null);
    setIsToastOpen(false);
    barcodeScannerHandler.reset();
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
        onOpenHistory={() => setIsHistoryModalOpen(true)}
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

      <ToastUndo
        isOpen={isToastOpen}
        message={toastMessage}
        onUndo={handleUndo}
        onClose={() => setIsToastOpen(false)}
      />

      <StickyBottomBar
        total={total}
        itemCount={totalItemCount}
        onOpenManualModal={() => setIsManualModalOpen(true)}
        onScanClick={() => setIsScannerOpen(true)}
      />

      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
        isPaused={isScanPriceModalOpen}
      />

      <ScanPricePromptModal
        isOpen={isScanPriceModalOpen}
        barcode={pendingScanCode || ''}
        initialName={pendingLookupResult?.name}
        initialPrice={pendingLookupResult?.suggestedPrice}
        isScale={pendingLookupResult?.isScale}
        source={pendingLookupResult?.source}
        onClose={handleCloseScanPriceModal}
        onConfirm={handleConfirmScanPrice}
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

      <HistoryModal
        key={historyRefreshKey}
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        sessionRepository={repository}
      />
    </div>
  );
};

export default App;
