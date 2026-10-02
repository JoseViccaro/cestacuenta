import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  StorePriceHistoryService,
  ProductPriceComparisonResult,
  BudgetStatus,
  BudgetMetrics,
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
import { ProductPriceHistoryModal } from './components/ProductPriceHistoryModal.js';
import { SetBudgetModal } from './components/SetBudgetModal.js';

const DEFAULT_STORE_NAME = 'Mi Supermercado';

export function cloneSession(session: ShoppingSession): ShoppingSession {
  return new ShoppingSession({
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    status: session.status,
    storeName: session.storeName,
    items: session.items,
    budgetLimit: session.budgetLimit,
  });
}

export function handleBudgetTransition(
  previousStatus: BudgetStatus,
  currentStatus: BudgetStatus,
  budgetMetrics: BudgetMetrics | null,
  callbacks?: {
    onWarning?: () => void;
    onExceeded?: () => void;
  }
): { triggeredWarning: boolean; triggeredExceeded: boolean; toastMessage: string | null } {
  if (previousStatus === currentStatus) {
    return { triggeredWarning: false, triggeredExceeded: false, toastMessage: null };
  }

  if ((previousStatus === 'NONE' || previousStatus === 'NORMAL') && currentStatus === 'WARNING') {
    callbacks?.onWarning?.();
    return {
      triggeredWarning: true,
      triggeredExceeded: false,
      toastMessage: 'Atención: Has alcanzado el 80% de tu presupuesto',
    };
  }

  if (previousStatus !== 'EXCEEDED' && currentStatus === 'EXCEEDED' && budgetMetrics) {
    callbacks?.onExceeded?.();
    return {
      triggeredWarning: false,
      triggeredExceeded: true,
      toastMessage: `Presupuesto superado: Te has pasado por ${budgetMetrics.overBudget.toFormattedString()}`,
    };
  }

  return { triggeredWarning: false, triggeredExceeded: false, toastMessage: null };
}

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
  const storePriceHistoryService = useMemo(() => new StorePriceHistoryService(), []);
  const productLookupService = useMemo(
    () => new ProductLookupService(catalogRepository, offClient, storePriceHistoryService),
    [catalogRepository, offClient, storePriceHistoryService]
  );
  const barcodeScannerHandler = useMemo(() => new BarcodeScannerHandler(2000), []);

  const [session, setSession] = useState<ShoppingSession | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [isShoppingListModalOpen, setIsShoppingListModalOpen] = useState(false);
  const [shoppingListModalMode, setShoppingListModalMode] = useState<'single' | 'paste' | 'voice'>('single');
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

  // Price History Modal state
  const [selectedPriceComparison, setSelectedPriceComparison] = useState<ProductPriceComparisonResult | null>(null);
  const [isPriceHistoryModalOpen, setIsPriceHistoryModalOpen] = useState(false);

  const handleViewPriceHistory = (comparison: ProductPriceComparisonResult) => {
    setSelectedPriceComparison(comparison);
    setIsPriceHistoryModalOpen(true);
  };

  // Undo Toast state
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isToastOpen, setIsToastOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Budget Control state
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const lastBudgetStatusRef = useRef<BudgetStatus>('NONE');

  const pendingItemCount = shoppingList ? shoppingList.pendingCount() : 0;
  const budgetMetrics = session ? session.budgetMetrics(pendingItemCount) : null;
  const currentBudgetStatus = budgetMetrics ? budgetMetrics.status : 'NONE';

  // Edge-triggered budget threshold transition detector
  useEffect(() => {
    const previousStatus = lastBudgetStatusRef.current;
    if (previousStatus !== currentBudgetStatus) {
      const result = handleBudgetTransition(
        previousStatus,
        currentBudgetStatus,
        budgetMetrics,
        {
          onWarning: () => Haptics.triggerBudgetWarning(),
          onExceeded: () => Haptics.triggerBudgetExceeded(),
        }
      );

      if (result.toastMessage) {
        setToastMessage(result.toastMessage);
        setIsToastOpen(true);
      }

      lastBudgetStatusRef.current = currentBudgetStatus;
    }
  }, [currentBudgetStatus, budgetMetrics]);

  // Hydrate store price history on initial load
  useEffect(() => {
    let mounted = true;

    async function hydratePriceHistory() {
      try {
        const pastSessions = await repository.listHistory();
        if (mounted && pastSessions) {
          storePriceHistoryService.buildIndex(pastSessions);
        }
      } catch (err) {
        console.error('Failed to hydrate price history:', err);
      }
    }

    hydratePriceHistory();

    return () => {
      mounted = false;
    };
  }, [repository, storePriceHistoryService]);

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

    const cloned = cloneSession(updatedSession);
    setSession(cloned);
  };

  const handleSetBudgetLimit = (limit: Money | null) => {
    if (!session) return;
    session.setBudgetLimit(limit);
    commitSession(session);
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

    // Incrementally update price history index
    storePriceHistoryService.indexSession(session);

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
      const lookupResult = await productLookupService.lookup(trimmed, session.storeName);
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
        budgetMetrics={budgetMetrics}
        onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
      />

      <ShoppingListBanner
        shoppingList={shoppingList}
        onOpenModal={() => {
          setShoppingListModalMode('single');
          setIsShoppingListModalOpen(true);
        }}
        onOpenVoiceModal={() => {
          setShoppingListModalMode('voice');
          setIsShoppingListModalOpen(true);
        }}
        onToggleItem={handleToggleListItem}
      />

      <main className="main-content">
        <CartList
          items={filteredItems}
          currentStore={session.storeName}
          priceHistoryService={storePriceHistoryService}
          onIncrementQuantity={handleIncrementQuantity}
          onDecrementQuantity={handleDecrementQuantity}
          onDeleteItem={handleDeleteItem}
          onEditPrice={(item) => setEditingItem(item)}
          onViewPriceHistory={handleViewPriceHistory}
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
        budgetMetrics={budgetMetrics}
        onOpenManualModal={() => setIsManualModalOpen(true)}
        onScanClick={() => setIsScannerOpen(true)}
        onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
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
        currentStore={session.storeName}
        priceHistoryService={storePriceHistoryService}
        onClose={handleCloseScanPriceModal}
        onConfirm={handleConfirmScanPrice}
        onViewPriceHistory={handleViewPriceHistory}
      />

      <ManualItemModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onAddItem={handleAddItem}
      />

      <EditPriceModal
        isOpen={Boolean(editingItem)}
        item={editingItem}
        currentStore={session.storeName}
        priceHistoryService={storePriceHistoryService}
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
        initialMode={shoppingListModalMode}
        onClose={() => setIsShoppingListModalOpen(false)}
        shoppingList={shoppingList}
        onAddItem={handleAddListItem}
        onImportText={handleImportListText}
        onToggleItem={handleToggleListItem}
        onDeleteItem={handleDeleteListItem}
        onClearCompleted={handleClearCompletedList}
      />

      <ProductPriceHistoryModal
        isOpen={isPriceHistoryModalOpen}
        comparison={selectedPriceComparison}
        onClose={() => {
          setIsPriceHistoryModalOpen(false);
          setSelectedPriceComparison(null);
        }}
      />

      <SetBudgetModal
        isOpen={isBudgetModalOpen}
        currentBudget={session?.budgetLimit ?? null}
        currentTotal={total}
        pendingItemCount={pendingItemCount}
        onClose={() => setIsBudgetModalOpen(false)}
        onSaveBudget={handleSetBudgetLimit}
      />
    </div>
  );
};

export default App;
