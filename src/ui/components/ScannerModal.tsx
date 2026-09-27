import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  Html5QrcodeCameraScanConfig,
} from 'html5-qrcode';
import { X, Zap, ZapOff, Keyboard, CameraOff, AlertCircle } from 'lucide-react';

export interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  isPaused?: boolean;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  isPaused = false,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const [isCameraNotFound, setIsCameraNotFound] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
        setIsCameraActive(false);
        setIsTorchOn(false);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!isOpen) {
      stopScanner();
      setShowManualInput(false);
      setErrorMessage(null);
      setIsPermissionDenied(false);
      setIsCameraNotFound(false);
      setManualCode('');
      setManualError(null);
      return;
    }

    const initScanner = async () => {
      // Small timeout to guarantee DOM node #qr-reader is mounted
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!isMounted) return;

      const element = document.getElementById('qr-reader');
      if (!element) return;

      try {
        const scanner = new Html5Qrcode('qr-reader', {
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        });
        scannerRef.current = scanner;

        const scanConfig: Html5QrcodeCameraScanConfig = {
          fps: 20,
          disableFlip: false, // Essential for laptop front-facing webcams (mirrored feed)
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(minEdge * 0.9),
              height: Math.floor(minEdge * 0.8), // taller box so barcode is covered easily
            };
          },
          aspectRatio: 1.0,
        };

        await scanner.start(
          { facingMode: 'environment' },
          scanConfig,
          (decodedText) => {
            if (isPausedRef.current) return;
            if (decodedText && decodedText.trim().length > 0) {
              onScan(decodedText.trim());
            }
          },
          () => {
            // Per-frame non-detection callback, silent
          }
        );

        if (!isMounted) {
          await stopScanner();
          return;
        }

        setIsCameraActive(true);
        setErrorMessage(null);

        // Check torch / flash capability
        try {
          let torchAvailable = false;
          const trackCaps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
          };
          if (trackCaps && 'torch' in trackCaps) {
            torchAvailable = Boolean(trackCaps.torch);
          }
          if (!torchAvailable) {
            const caps = scanner.getRunningTrackCameraCapabilities();
            if (caps?.torchFeature?.()?.isSupported?.()) {
              torchAvailable = true;
            }
          }
          setIsTorchSupported(torchAvailable);
        } catch {
          setIsTorchSupported(false);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setIsCameraActive(false);

        const errorObj = err as { name?: string; message?: string } | undefined;
        const errName = errorObj?.name || '';
        const errMsg = errorObj?.message || String(err);

        if (errName === 'NotAllowedError' || errMsg.includes('Permission denied')) {
          setIsPermissionDenied(true);
          setErrorMessage('Permiso de cámara denegado. Puedes usar la entrada manual sin interrumpir tu compra.');
          setShowManualInput(true);
        } else if (errName === 'NotFoundError' || errMsg.includes('DevicesNotFoundError')) {
          setIsCameraNotFound(true);
          setErrorMessage('No se encontró ninguna cámara trasera en el dispositivo.');
          setShowManualInput(true);
        } else {
          setErrorMessage('No se pudo acceder a la cámara. Introduce el código manualmente.');
          setShowManualInput(true);
        }
      }
    };

    initScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen, onScan, stopScanner]);

  const handleToggleTorch = async () => {
    if (!scannerRef.current || !isTorchSupported) return;
    try {
      const nextTorch = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as unknown as MediaTrackConstraintSet],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('Failed to toggle torch:', err);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) {
      setManualError('Introduce un código de barras');
      return;
    }
    setManualError(null);
    onScan(trimmed);
    setManualCode('');
  };

  if (!isOpen) return null;

  return (
    <div
      className="scanner-fullscreen-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Escáner de códigos de barras"
    >
      {/* Top action bar: Torch & Close */}
      <div className="scanner-top-bar">
        <div className="scanner-top-title">
          <span>Escanear producto</span>
        </div>

        <div className="scanner-top-controls">
          {isTorchSupported && isCameraActive && (
            <button
              type="button"
              className={`scanner-control-btn ${isTorchOn ? 'active' : ''}`}
              onClick={handleToggleTorch}
              aria-label={isTorchOn ? 'Apagar linterna' : 'Encender linterna'}
              title={isTorchOn ? 'Apagar linterna' : 'Encender linterna'}
            >
              {isTorchOn ? <ZapOff size={22} /> : <Zap size={22} />}
            </button>
          )}

          <button
            type="button"
            className="scanner-control-btn close-btn"
            onClick={onClose}
            aria-label="Cerrar escáner"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Camera Viewport Container */}
      <div className="scanner-viewport-wrapper">
        <div id="qr-reader" className="scanner-qr-reader" />

        {/* Focus reticle frame overlay when camera is running */}
        {isCameraActive && (
          <div className="scanner-reticle-container" aria-hidden="true">
            <div className="scanner-reticle-box">
              <div className="reticle-corner top-left" />
              <div className="reticle-corner top-right" />
              <div className="reticle-corner bottom-left" />
              <div className="reticle-corner bottom-right" />
              <div className="reticle-laser" />
            </div>
            <p className="scanner-hint-text">Enfoca el código de barras dentro del marco</p>
          </div>
        )}

        {/* Fallback / Error state if camera is denied or unavailable */}
        {errorMessage && (
          <div className="scanner-fallback-banner">
            <div className="fallback-icon-wrap">
              {isPermissionDenied || isCameraNotFound ? (
                <CameraOff size={32} />
              ) : (
                <AlertCircle size={32} />
              )}
            </div>
            <p className="fallback-message">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* Bottom control panel: Toggle Manual Input */}
      <div className="scanner-bottom-panel">
        {!showManualInput ? (
          <button
            type="button"
            className="btn-toggle-manual"
            onClick={() => setShowManualInput(true)}
            aria-label="Teclear código de barras manualmente"
          >
            <Keyboard size={20} />
            <span>Teclear código manualmente</span>
          </button>
        ) : (
          <form className="scanner-manual-form" onSubmit={handleManualSubmit}>
            <div className="manual-input-row">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                className={`scanner-manual-input ${manualError ? 'input-error' : ''}`}
                placeholder="Ej. 8410123456789"
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value);
                  if (manualError) setManualError(null);
                }}
                aria-label="Número de código de barras"
              />
              <button type="submit" className="btn-manual-submit">
                Añadir
              </button>
            </div>
            {manualError && <span className="scanner-manual-error">{manualError}</span>}
            {isCameraActive && (
              <button
                type="button"
                className="btn-hide-manual"
                onClick={() => setShowManualInput(false)}
              >
                Volver a la cámara
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
