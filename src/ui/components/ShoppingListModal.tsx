import React, { useState, useEffect, useRef } from 'react';
import { ShoppingList } from '../../domain/index.js';
import {
  X,
  Plus,
  Trash2,
  Check,
  ClipboardList,
  ListPlus,
  Sparkles,
  Mic,
  MicOff,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { useVoiceShoppingList } from '../hooks/useVoiceShoppingList.js';
import { VoiceRecognitionAdapter } from '../../infrastructure/device/VoiceRecognitionAdapter.js';

export interface ShoppingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  shoppingList: ShoppingList | null;
  onAddItem: (name: string) => void;
  onImportText: (text: string) => void;
  onToggleItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onClearCompleted: () => void;
  initialMode?: 'single' | 'paste' | 'voice';
}

type InputMode = 'single' | 'paste' | 'voice';

export const ShoppingListModal: React.FC<ShoppingListModalProps> = ({
  isOpen,
  onClose,
  shoppingList,
  onAddItem,
  onImportText,
  onToggleItem,
  onDeleteItem,
  onClearCompleted,
  initialMode = 'single',
}) => {
  const [mode, setMode] = useState<InputMode>(initialMode);
  const [singleInput, setSingleInput] = useState('');
  const [pasteInput, setPasteInput] = useState('');
  const [inlineListening, setInlineListening] = useState(false);
  const singleInputRef = useRef<HTMLInputElement>(null);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);
  const inlineAdapterRef = useRef<VoiceRecognitionAdapter | null>(null);

  const voice = useVoiceShoppingList();

  useEffect(() => {
    if (isOpen) {
      if (initialMode) {
        setMode(initialMode);
      }
      setSingleInput('');
      setPasteInput('');
      // Focus appropriate input on open
      setTimeout(() => {
        if (mode === 'single') {
          singleInputRef.current?.focus();
        } else if (mode === 'paste') {
          pasteInputRef.current?.focus();
        }
      }, 60);
    }
  }, [isOpen, initialMode]);

  const handleClose = () => {
    if (voice.isListening) {
      voice.stopListening();
    }
    if (inlineListening && inlineAdapterRef.current) {
      inlineAdapterRef.current.abort();
      setInlineListening(false);
    }
    onClose();
  };

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const items = shoppingList?.items ?? [];
  const uncheckedItems = items.filter((item) => !item.isChecked);
  const checkedItems = items.filter((item) => item.isChecked);
  const progress = shoppingList?.progress() ?? { total: 0, completed: 0, percentage: 0 };

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = singleInput.trim();
    if (!trimmed) return;
    onAddItem(trimmed);
    setSingleInput('');
    singleInputRef.current?.focus();
  };

  const handleImportLines = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pasteInput.trim();
    if (!trimmed) return;
    onImportText(trimmed);
    setPasteInput('');
    setMode('single');
  };

  const handleToggleInlineMic = () => {
    if (inlineListening) {
      inlineAdapterRef.current?.stop();
      setInlineListening(false);
      return;
    }

    if (!inlineAdapterRef.current) {
      inlineAdapterRef.current = new VoiceRecognitionAdapter();
    }

    if (!inlineAdapterRef.current.isSupported()) {
      alert('El reconocimiento de voz no está disponible en este navegador.');
      return;
    }

    setInlineListening(true);
    inlineAdapterRef.current.start({
      onStateChange: (s) => {
        if (s === 'idle') setInlineListening(false);
      },
      onInterimResult: (transcript) => {
        setSingleInput(transcript);
      },
      onFinalResult: (transcript) => {
        const cleaned = transcript.trim();
        if (cleaned) {
          const formatted = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
          setSingleInput(formatted);
        }
        inlineAdapterRef.current?.stop();
        setInlineListening(false);
      },
      onError: () => {
        setInlineListening(false);
      },
    });
  };

  const pasteLineCount = pasteInput
    .split('\n')
    .map((l) => l.trim().replace(/^[-*•\d.)\]\s]+/, '').trim())
    .filter((l) => l.length > 0).length;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shopping-list-modal-title"
      onClick={handleClose}
    >
      <div
        className="modal-sheet shopping-list-modal-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="shopping-list-modal-title-area">
            <h2 id="shopping-list-modal-title" className="modal-title">
              Lista de la Compra
            </h2>
            {progress.total > 0 && (
              <span className="shopping-list-modal-pill tabular-nums">
                {`${progress.completed}/${progress.total}`}
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn-close-modal"
            onClick={handleClose}
            aria-label="Cerrar lista de compra"
          >
            <X size={20} />
          </button>
        </div>

        {/* Input Mode Selector */}
        <div className="shopping-list-mode-toggle" role="tablist" aria-label="Modo de entrada de artículos">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'single'}
            className={`shopping-list-tab ${mode === 'single' ? 'active' : ''}`}
            onClick={() => setMode('single')}
          >
            <Plus size={15} aria-hidden="true" />
            <span>Añadir uno a uno</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'paste'}
            className={`shopping-list-tab ${mode === 'paste' ? 'active' : ''}`}
            onClick={() => setMode('paste')}
          >
            <ClipboardList size={15} aria-hidden="true" />
            <span>Pegar texto</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'voice'}
            className={`shopping-list-tab ${mode === 'voice' ? 'active' : ''}`}
            onClick={() => setMode('voice')}
          >
            <Mic size={15} aria-hidden="true" />
            <span>Voz</span>
          </button>
        </div>

        {/* Input Forms */}
        {mode === 'single' ? (
          <form onSubmit={handleAddSingle} className="shopping-list-single-form">
            <div className="shopping-list-input-wrapper">
              <input
                ref={singleInputRef}
                type="text"
                className="form-input shopping-list-input"
                placeholder="ej. Plátanos de Canarias, Leche..."
                value={singleInput}
                onChange={(e) => setSingleInput(e.target.value)}
                aria-label="Nombre del artículo para la lista de compra"
              />
              <button
                type="button"
                className={`btn-inline-mic ${inlineListening ? 'btn-inline-mic--listening' : ''}`}
                onClick={handleToggleInlineMic}
                aria-label={inlineListening ? 'Detener dictado en este campo' : 'Dictar por voz en este campo'}
                title="Dictar por voz"
              >
                <Mic size={18} />
              </button>
            </div>
            <button
              type="submit"
              className="btn-primary-action btn-add-item-action"
              disabled={!singleInput.trim()}
              aria-label="Añadir artículo a la lista"
            >
              <Plus size={18} />
              <span>Añadir</span>
            </button>
          </form>
        ) : mode === 'paste' ? (
          <form onSubmit={handleImportLines} className="shopping-list-paste-form">
            <textarea
              ref={pasteInputRef}
              className="form-input shopping-list-textarea"
              placeholder={'Pega tu lista aquí (un artículo por línea):\n\nLeche entera\nPan de molde\nHuevos camperos\nManzanas Fuji'}
              rows={4}
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              aria-label="Pega múltiples líneas de artículos"
            />
            <button
              type="submit"
              className="btn-primary-action btn-import-action"
              disabled={pasteLineCount === 0}
              aria-label={`Importar ${pasteLineCount} artículos a la lista`}
            >
              <ListPlus size={18} />
              <span>Importar {pasteLineCount > 0 ? `${pasteLineCount} líneas` : 'líneas'}</span>
            </button>
          </form>
        ) : (
          <div className="shopping-list-voice-container">
            {!voice.isSupported ? (
              <div className="voice-fallback-card" role="alert">
                <AlertCircle size={28} className="voice-fallback-icon" />
                <div className="voice-fallback-content">
                  <h4 className="voice-fallback-title">Dictado por voz no disponible</h4>
                  <p className="voice-fallback-desc">
                    Tu navegador actual no admite la API de voz. Puedes usar el micrófono integrado en el
                    teclado de tu teléfono para dictar en cualquier campo.
                  </p>
                  <div className="voice-fallback-actions">
                    <button
                      type="button"
                      className="btn-switch-tab"
                      onClick={() => setMode('single')}
                    >
                      <span>Ir a Añadir uno a uno</span>
                      <ArrowRight size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn-switch-tab"
                      onClick={() => setMode('paste')}
                    >
                      <span>Ir a Pegar texto</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {voice.errorMessage && (
                  <div className="voice-error-banner" role="alert">
                    <AlertCircle size={18} className="voice-error-icon" />
                    <div className="voice-error-text">
                      {voice.errorType === 'network' ? (
                        <>
                          <strong>Sin conexión:</strong> El dictado por voz del navegador requiere internet. Puedes usar el micrófono del teclado de tu móvil para dictar sin conexión.
                        </>
                      ) : (
                        voice.errorMessage
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-clear-error"
                      onClick={voice.clearError}
                      aria-label="Cerrar aviso de error"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Central Microphone Button Area */}
                <div className="voice-mic-hero">
                  <button
                    type="button"
                    className={`btn-voice-mic ${voice.isListening ? 'btn-voice-mic--listening' : ''}`}
                    onClick={voice.isListening ? voice.stopListening : voice.startListening}
                    aria-label={voice.isListening ? 'Detener dictado por voz' : 'Iniciar dictado por voz'}
                  >
                    {voice.isListening ? (
                      <div className="voice-mic-active-inner">
                        <MicOff size={32} />
                      </div>
                    ) : (
                      <Mic size={32} />
                    )}
                  </button>
                  <span className="voice-status-label">
                    {voice.isListening
                      ? 'Escuchando... Toca para detener'
                      : 'Toca el micrófono para dictar'}
                  </span>
                  {voice.isListening && (
                    <div className="voice-wave-indicator" aria-hidden="true">
                      <span className="wave-bar bar-1" />
                      <span className="wave-bar bar-2" />
                      <span className="wave-bar bar-3" />
                      <span className="wave-bar bar-4" />
                      <span className="wave-bar bar-5" />
                    </div>
                  )}
                </div>

                {/* Live Interim Transcript Display */}
                <div className="voice-transcript-box" aria-live="polite">
                  {voice.interimTranscript ? (
                    <span className="voice-interim-text">{voice.interimTranscript}</span>
                  ) : voice.isListening ? (
                    <span className="voice-transcript-hint">
                      Habla ahora (ej. &quot;leche, huevos, tres plátanos y pan&quot;)...
                    </span>
                  ) : voice.stagedItems.length === 0 ? (
                    <span className="voice-transcript-placeholder">
                      Di varios artículos seguidos con &quot;y&quot; o comas y se añadirán a la vista previa para revisarlos.
                    </span>
                  ) : null}
                </div>

                {/* Staging Chips Preview Area */}
                {voice.stagedItems.length > 0 && (
                  <div className="voice-staging-area">
                    <div className="voice-staging-header">
                      <span>Artículos para añadir ({voice.stagedItems.length})</span>
                      <button
                        type="button"
                        className="btn-clear-staging"
                        onClick={voice.clearStaging}
                      >
                        Limpiar todo
                      </button>
                    </div>
                    <div className="voice-staging-chips" role="region" aria-label="Artículos detectados">
                      {voice.stagedItems.map((item, idx) => (
                        <div key={`${item}-${idx}`} className="voice-staging-chip">
                          <span className="voice-chip-name">{item}</span>
                          <button
                            type="button"
                            className="btn-chip-remove"
                            onClick={() => voice.removeStagedItem(idx)}
                            aria-label={`Eliminar ${item} de la vista previa`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="btn-primary-action btn-commit-staged-action"
                      onClick={() => voice.commitStagedItems(onAddItem)}
                    >
                      <Plus size={18} />
                      <span>
                        Añadir {voice.stagedItems.length}{' '}
                        {voice.stagedItems.length === 1 ? 'artículo' : 'artículos'} a la lista
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Items List */}
        <div className="shopping-list-items-container" role="list" aria-label="Artículos de la lista">
          {items.length === 0 ? (
            <div className="shopping-list-empty-state">
              <Sparkles size={28} className="shopping-list-empty-sparkle" aria-hidden="true" />
              <p className="shopping-list-empty-lead">Tu lista está vacía</p>
              <p className="shopping-list-empty-hint">
                Escribe un artículo arriba o usa la pestaña &quot;Pegar texto&quot; o &quot;Voz&quot; para añadir rápidamente.
              </p>
            </div>
          ) : (
            <>
              {/* Unchecked Items */}
              {uncheckedItems.map((item) => (
                <div key={item.id} className="shopping-list-row" role="listitem">
                  <button
                    type="button"
                    className="shopping-list-checkbox-btn"
                    onClick={() => onToggleItem(item.id)}
                    aria-label={`Marcar ${item.name} como comprado`}
                  >
                    <span className="shopping-list-checkbox-box" aria-hidden="true" />
                    <span className="shopping-list-row-name">{item.name}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-delete-list-item"
                    onClick={() => onDeleteItem(item.id)}
                    aria-label={`Eliminar ${item.name} de la lista`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {/* Checked Items */}
              {checkedItems.length > 0 && (
                <div className="shopping-list-checked-section">
                  <div className="shopping-list-section-header">
                    <span>{`Comprados (${checkedItems.length})`}</span>
                  </div>
                  {checkedItems.map((item) => (
                    <div
                      key={item.id}
                      className="shopping-list-row shopping-list-row--checked"
                      role="listitem"
                    >
                      <button
                        type="button"
                        className="shopping-list-checkbox-btn"
                        onClick={() => onToggleItem(item.id)}
                        aria-label={`Desmarcar ${item.name}`}
                      >
                        <span className="shopping-list-checkbox-box checked" aria-hidden="true">
                          <Check size={14} />
                        </span>
                        <span className="shopping-list-row-name">{item.name}</span>
                      </button>
                      <button
                        type="button"
                        className="btn-delete-list-item"
                        onClick={() => onDeleteItem(item.id)}
                        aria-label={`Eliminar ${item.name} de la lista`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shopping-list-modal-footer">
          {checkedItems.length > 0 && (
            <button
              type="button"
              className="btn-clear-completed"
              onClick={onClearCompleted}
              aria-label="Limpiar artículos completados de la lista"
            >
              <Trash2 size={15} />
              <span>{`Limpiar comprados (${checkedItems.length})`}</span>
            </button>
          )}
          <button
            type="button"
            className="btn-finish-modal-action"
            onClick={handleClose}
            aria-label="Cerrar ventana de lista de compra"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
