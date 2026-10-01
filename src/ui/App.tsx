import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingSession,
  Money,
  CartItem,
  ProductReference,
  BarcodeScannerHandler,
  ProductLookupService,
  ProductLookupResult,
  ShoppingList,
  ShoppingListMatcherService,
} from '../domain/index.js';
import { LocalStorageShoppingSessionRepository } from '../infrastructure/persistence/web/LocalStorageShoppingSessionRepository.js';
import { LocalStorageProductCatalogRepository } from '../infrastructure/persistence/web/LocalStorageProductCatalogRepository.js';
import { LocalStorageShoppingListRepository } from '../infrastructure/persistence/web/LocalStorageShoppingListRepository.js';
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
import { ShoppingListBanner } from './components/ShoppingListBanner.js';
import { ShoppingListModal } from './components/ShoppingListModal.js';

const DEFAULT_STORE_NAME = 'Mi Supermercado';

interface UndoState {
  itemId: string;
  previousQuantity: number;
  itemName: string;
}

export const App: React.FC = () => {
  const repository = useMemo(() => new LocalStorageShoppingSessionRepository(), []);
  const catalogRepository = useMemo(() => new LocalStorageProductCatalogRepository(), []);
  const listRepository = useMemo(() => new LocalStorageShoppingListRepository(), []);
  const offClient = useMemo(() => new OpenFoodFactsClient(), []);
  const productLookupService = useMemo(
    () => new ProductLookupService(catalogRepository, offClient),
    [catalogRepository, offClient]
  );
  const barcodeScannerHandler = useMemo(() => new BarcodeScannerHandler(2000), []);

  const [session, setSession] = useState<ShoppingSession | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [isShoppingListModalOpen, setIsShoppingListModalOpen] = useState(false);
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

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // Hydrate active shopping list on initial load
  useEffect(() => {
    let mounted = true;

    async function loadActiveList() {
      try {
        const active = await listRepository.getActiveList();
        if (!mounted) return;
        if (active) {
          setShoppingList(active);
        }
      } catch (err) {
        console.error('Error hydrating shopping list:', err);
      }
    }

    loadActiveList();

    return () => {
      mounted = false;
    };
  }, [listRepository]);

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

  const commitShoppingList = (updatedList: ShoppingList) => {
    listRepository.save(updatedList).catch((err) => {
      console.error('Failed to save shopping list to storage:', err);
    });

    const cloned = new ShoppingList({
      id: updatedList.id,
      title: updatedList.title,
      createdAt: updatedList.createdAt,
      updatedAt: updatedList.updatedAt,
      items: updatedList.items,
    });
    setShoppingList(cloned);
  };

  const checkAndCrossOffShoppingList = (itemName: string, cartItemId: string) => {
    if (!shoppingList || shoppingList.items.length === 0) return null;
    const matched = ShoppingListMatcherService.findMatch(itemName, shoppingList.items);
    if (matched) {
      shoppingList.checkItem(matched.id, cartItemId);
      commitShoppingList(shoppingList);
      return matched;
    }
    return null;
  };

  const handleToggleListItem = (itemId: string) => {
    if (!shoppingList) return;
    shoppingList.toggleItem(itemId);
    commitShoppingList(shoppingList);
  };

  const handleAddListItem = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const list = shoppingList ?? ShoppingList.create({ title: 'Lista de la compra' });
    list.addItem(trimmed);
    commitShoppingList(list);
  };

  const handleImportListText = (text: string) => {
    const lines = text
      .split('\n')
      .map((l) => l.trim().replace(/^[-*•\d.)\]\s]+/, '').trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) return;

    const list = shoppingList ?? ShoppingList.create({ title: 'Lista de la compra' });
    for (const line of lines) {
      list.addItem(line);
    }
    commitShoppingList(list);
  };

  const handleDeleteListItem = (itemId: string) => {
    if (!shoppingList) return;
    shoppingList.removeItem(itemId);
    commitShoppingList(shoppingList);
  };

  const handleClearCompletedList = () => {
    if (!shoppingList) return;
    shoppingList.clearCompleted();
    commitShoppingList(shoppingList);
  };

  const handleUpdateStoreName = (name: string) => {
    if (!session) return;
    session.storeName = name;
    commitSession(session);
  };

  const handleAddItem = (name: string, price: Money, isBulk: boolean) => {
    if (!session) return;
    const newItem = session.addItem({
      name,
      unitPrice: price,
      quantity: 1,
      isBulk,
    });
    commitSession(session);

    const matched = checkAndCrossOffShoppingList(name, newItem.id);
    if (matched) {
      setToastMessage(`✓ Tachado: ${matched.name}`);
      setIsToastOpen(true);
    }
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
    if (item.quantity <= 1) {
      session.removeItem(itemId);
      if (shoppingList) {
        const unchecked = shoppingList.uncheckByCartItemId(itemId);
        if (unchecked) {
          commitShoppingList(shoppingList);
        }
      }
    } else {
      session.updateItemQuantity(itemId, item.quantity - 1);
    }
    commitSession(session);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!session) return;
    session.removeItem(itemId);
    commitSession(session);

    if (shoppingList) {
      const unchecked = shoppingList.uncheckByCartItemId(itemId);
      if (unchecked) {
        commitShoppingList(shoppingList);
      }
    }
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

      const matched = checkAndCrossOffShoppingList(existingItem.name, item.id);

      setUndoState({
        itemId: item.id,
        previousQuantity: existingItem.quantity,
        itemName: existingItem.name,
      });
      if (matched) {
        setToastMessage(`✓ Tachado: ${matched.name}`);
      } else {
        setToastMessage(`Añadido: ${existingItem.name} (${item.quantity} uds en total)`);
      }
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

    const matched = checkAndCrossOffShoppingList(name, item.id);

    setUndoState({
      itemId: item.id,
      previousQuantity: 0,
      itemName: item.name,
    });
    if (matched) {
      setToastMessage(`✓ Tachado: ${matched.name}`);
    } else {
      setToastMessage(`Añadido: ${item.name}`);
    }
    setIsToastOpen(true);

    setIsScanPriceModalOpen(false);
    setPendingScanCode(null);
    setPendingLookupResult(null);
  };

  const handleShelfTagScanned = (tag: { name: string; price: Money }) => {
    if (!session) return;

    const newItem = session.addItem({
      name: tag.name,
      unitPrice: tag.price,
      quantity: 1,
      isBulk: false,
    });
    commitSession(session);
    Haptics.triggerScanSuccess();

    const matched = checkAndCrossOffShoppingList(tag.name, newItem.id);

    setUndoState({
      itemId: newItem.id,
      previousQuantity: 0,
      itemName: newItem.name,
    });
    if (matched) {
      setToastMessage(`✓ Tachado: ${matched.name}`);
    } else {
      setToastMessage(`Añadido: ${newItem.name} (${newItem.unitPrice.format()})`);
    }
    setIsToastOpen(true);
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
      if (shoppingList) {
        const unchecked = shoppingList.uncheckByCartItemId(undoState.itemId);
        if (unchecked) {
          commitShoppingList(shoppingList);
        }
      }
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

  const q = searchQuery.trim().toLowerCase();
  const filteredItems = q
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.barcode && item.barcode.toLowerCase().includes(q))
      )
    : items;

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
        onOpenShoppingList={() => setIsShoppingListModalOpen(true)}
        shoppingListProgress={
          shoppingList && shoppingList.items.length > 0
            ? {
                completed: shoppingList.progress().completed,
                total: shoppingList.progress().total,
              }
            : undefined
        }
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <ShoppingListBanner
        shoppingList={shoppingList}
        onOpenModal={() => setIsShoppingListModalOpen(true)}
        onToggleItem={handleToggleListItem}
      />

      <main className="main-content">
        <CartList
          items={filteredItems}
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
        onShelfTagScanned={handleShelfTagScanned}
        isPaused={isScanPriceModalOpen}
        cartTotal={total}
        cartItemCount={totalItemCount}
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

      <ShoppingListModal
        isOpen={isShoppingListModalOpen}
        onClose={() => setIsShoppingListModalOpen(false)}
        shoppingList={shoppingList}
        onAddItem={handleAddListItem}
        onImportText={handleImportListText}
        onToggleItem={handleToggleListItem}
        onDeleteItem={handleDeleteListItem}
        onClearCompleted={handleClearCompletedList}
      />
    </div>
  );
};

export default App;
