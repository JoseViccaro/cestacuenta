import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  VoiceRecognitionAdapter,
  IVoiceRecognitionAdapter,
  VoiceRecognitionState,
  VoiceRecognitionErrorType,
  VoiceRecognitionError,
} from '../../infrastructure/device/VoiceRecognitionAdapter.js';
import { SpokenShoppingListParser } from '../../domain/services/SpokenShoppingListParser.js';

export interface UseVoiceShoppingListOptions {
  adapter?: IVoiceRecognitionAdapter;
  onAutoParse?: (items: string[]) => void;
}

export interface UseVoiceShoppingListReturn {
  isSupported: boolean;
  state: VoiceRecognitionState;
  isListening: boolean;
  interimTranscript: string;
  rawTranscript: string;
  stagedItems: string[];
  errorMessage: string | null;
  errorType: VoiceRecognitionErrorType | null;
  startListening: () => void;
  stopListening: () => void;
  removeStagedItem: (index: number) => void;
  updateStagedItem: (index: number, newName: string) => void;
  addStagedItem: (name: string) => void;
  setRawTranscript: (text: string) => void;
  reparseRawTranscript: () => void;
  clearStaging: () => void;
  commitStagedItems: (onCommit: (itemName: string) => void) => void;
  clearError: () => void;
}

export function useVoiceShoppingList(
  options?: UseVoiceShoppingListOptions
): UseVoiceShoppingListReturn {
  const adapter = useMemo(
    () => options?.adapter ?? new VoiceRecognitionAdapter(),
    [options?.adapter]
  );

  const [state, setState] = useState<VoiceRecognitionState>('idle');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [rawTranscript, setRawTranscript] = useState<string>('');
  const [stagedItems, setStagedItems] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<VoiceRecognitionErrorType | null>(null);

  const interimRef = useRef<string>('');
  interimRef.current = interimTranscript;

  const onAutoParseRef = useRef(options?.onAutoParse);
  onAutoParseRef.current = options?.onAutoParse;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      adapter.abort();
    };
  }, [adapter]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setErrorType(null);
  }, []);

  const removeStagedItem = useCallback((index: number) => {
    setStagedItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateStagedItem = useCallback((index: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setStagedItems((prev) => prev.filter((_, i) => i !== index));
    } else {
      setStagedItems((prev) => prev.map((item, i) => (i === index ? trimmed : item)));
    }
  }, []);

  const addStagedItem = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed) {
      setStagedItems((prev) => [...prev, trimmed]);
    }
  }, []);

  const clearStaging = useCallback(() => {
    setStagedItems([]);
    setRawTranscript('');
    setInterimTranscript('');
  }, []);

  const reparseRawTranscript = useCallback(() => {
    if (rawTranscript.trim()) {
      const items = SpokenShoppingListParser.parse(rawTranscript);
      setStagedItems(items);
    }
  }, [rawTranscript]);

  const commitStagedItems = useCallback(
    (onCommit: (itemName: string) => void) => {
      if (stagedItems.length === 0) return;
      stagedItems.forEach((item) => {
        onCommit(item);
      });
      clearStaging();
    },
    [stagedItems, clearStaging]
  );

  const startListening = useCallback(() => {
    clearError();
    adapter.start({
      onStateChange: (newState) => {
        setState(newState);
      },
      onInterimResult: (transcript) => {
        setInterimTranscript(transcript);
      },
      onFinalResult: (transcript) => {
        setInterimTranscript('');
        setRawTranscript((prev) => (prev ? `${prev}, ${transcript}` : transcript));
        const parsed = SpokenShoppingListParser.parse(transcript);
        if (parsed.length > 0) {
          setStagedItems((prev) => [...prev, ...parsed]);
          onAutoParseRef.current?.(parsed);
        }
      },
      onError: (err: VoiceRecognitionError) => {
        setErrorMessage(err.message);
        setErrorType(err.type);
      },
    });
  }, [adapter, clearError]);

  const stopListening = useCallback(() => {
    // If there is pending interim speech that didn't fire final result yet, parse it
    if (interimRef.current.trim()) {
      const pendingText = interimRef.current.trim();
      const parsed = SpokenShoppingListParser.parse(pendingText);
      if (parsed.length > 0) {
        setStagedItems((prev) => [...prev, ...parsed]);
      }
      setRawTranscript((prev) => (prev ? `${prev}, ${pendingText}` : pendingText));
      setInterimTranscript('');
    }
    adapter.stop();
  }, [adapter]);

  return {
    isSupported: adapter.isSupported(),
    state,
    isListening: state === 'listening' || state === 'starting',
    interimTranscript,
    rawTranscript,
    stagedItems,
    errorMessage,
    errorType,
    startListening,
    stopListening,
    removeStagedItem,
    updateStagedItem,
    addStagedItem,
    setRawTranscript,
    reparseRawTranscript,
    clearStaging,
    commitStagedItems,
    clearError,
  };
}
