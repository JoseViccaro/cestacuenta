import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  Html5QrcodeCameraScanConfig,
} from 'html5-qrcode';
import {
  X,
  Zap,
  ZapOff,
  Keyboard,
  CameraOff,
  AlertCircle,
  Barcode,
  ScanText,
  Loader2,
  Check,
  RotateCcw,
} from 'lucide-react';
import { Money, ShelfTagResult } from '../../domain/index.js';
import { OnDeviceOcrService } from '../../infrastructure/ocr/OnDeviceOcrService.js';
import { Haptics } from '../../infrastructure/device/Haptics.js';

export interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  onShelfTagScanned?: (tag: { name: string; price: Money }) => void;
  isPaused?: boolean;
  cartTotal?: Money;
  cartItemCount?: number;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  onShelfTagScanned,
  isPaused = false,
  cartTotal,
  cartItemCount = 0,
}) => {
  // Mode selection: 'shelftag' (Shelf tag OCR, default) vs 'barcode' (1D Html5Qrcode)
  const [scanMode, setScanMode] = useState<'barcode' | 'shelftag'>('shelftag');

  // Barcode scanner refs & state
  const barcodeScannerRef = useRef<Html5Qrcode | null>(null);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  // Shelf tag camera refs & state
  const shelfVideoRef = useRef<HTMLVideoElement>(null);
  const shelfStreamRef = useRef<MediaStream | null>(null);
  const shelfReticleRef = useRef<HTMLDivElement>(null);

  // Common camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);
  const [isCameraNotFound, setIsCameraNotFound] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Barcode manual input state
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Shelf tag OCR state
  const [isCapturing, setIsCapturing] = useState(false);
  const [detectedTag, setDetectedTag] = useState<ShelfTagResult | null>(null);
  const [editableName, setEditableName] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [autoAdd, setAutoAdd] = useState(false);
  const [recentAddedToast, setRecentAddedToast] = useState<{ name: string; price: string } | null>(null);

  // --- Stop Functions ---
  const stopBarcodeScanner = useCallback(async () => {
    if (barcodeScannerRef.current) {
      try {
        if (barcodeScannerRef.current.isScanning) {
          await barcodeScannerRef.current.stop();
        }
        barcodeScannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping barcode scanner:', err);
      } finally {
        barcodeScannerRef.current = null;
      }
    }
  }, []);

  const stopShelfCamera = useCallback(() => {
    if (shelfStreamRef.current) {
      shelfStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      shelfStreamRef.current = null;
    }
    if (shelfVideoRef.current) {
      shelfVideoRef.current.srcObject = null;
    }
  }, []);

  const stopAllCameras = useCallback(async () => {
    await stopBarcodeScanner();
    stopShelfCamera();
    setIsCameraActive(false);
    setIsTorchOn(false);
    setIsTorchSupported(false);
  }, [stopBarcodeScanner, stopShelfCamera]);

  // --- Start Barcode Scanner ---
  const startBarcodeScanner = useCallback(
    async (isMounted: boolean) => {
      // Small timeout to guarantee DOM node #qr-reader is mounted
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (!isMounted) return;

      const element = document.getElementById('qr-reader');
      if (!element) return;

      try {
        const scanner = new Html5Qrcode('qr-reader', {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        });
        barcodeScannerRef.current = scanner;

        const scanConfig: Html5QrcodeCameraScanConfig = {
          fps: 15,
          disableFlip: false,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(viewfinderWidth * 0.88),
              height: Math.floor(Math.min(minEdge * 0.65, 240)),
            };
          },
          videoConstraints: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
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
          await stopBarcodeScanner();
          return;
        }

        setIsCameraActive(true);
        setErrorMessage(null);

        // Continuous focus
        try {
          const trackCaps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
            focusMode?: string[];
          };
          if (
            trackCaps &&
            'focusMode' in trackCaps &&
            Array.isArray(trackCaps.focusMode) &&
            trackCaps.focusMode.includes('continuous')
          ) {
            await scanner.applyVideoConstraints({
              advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
            });
          }
        } catch {
          // Ignore
        }

        // Torch support check
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
          setErrorMessage('Permiso de cámara denegado. Puedes usar la entrada manual.');
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
    },
    [onScan, stopBarcodeScanner]
  );

  // --- Start Shelf Tag Camera ---
  const startShelfTagCamera = useCallback(async (isMounted: boolean) => {
    // Check mediaDevices support
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      if (isMounted) {
        setErrorMessage('Tu navegador o dispositivo no soporta acceso a la cámara.');
      }
      return;
    }

    try {
      // High-resolution stream for sharp OCR reading of small text
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (!isMounted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      shelfStreamRef.current = stream;

      if (shelfVideoRef.current) {
        shelfVideoRef.current.srcObject = stream;
        try {
          await shelfVideoRef.current.play();
        } catch {
          // Autoplay fallback
        }
      }

      setIsCameraActive(true);
      setErrorMessage(null);

      // Check torch capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
        try {
          const capabilities = videoTrack.getCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
          };
          if (capabilities && capabilities.torch) {
            setIsTorchSupported(true);
          }
        } catch {
          setIsTorchSupported(false);
        }
      }
    } catch (err: unknown) {
      if (!isMounted) return;
      setIsCameraActive(false);

      const errorObj = err as { name?: string; message?: string } | undefined;
      const errName = errorObj?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setIsPermissionDenied(true);
        setErrorMessage('Permiso de cámara denegado. Permite el acceso para leer etiquetas.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setIsCameraNotFound(true);
        setErrorMessage('No se encontró ninguna cámara disponible en el dispositivo.');
      } else {
        setErrorMessage('No se pudo iniciar la cámara para leer etiquetas.');
      }
    }
  }, []);

  // --- Mode Switching ---
  const handleSwitchMode = async (newMode: 'barcode' | 'shelftag') => {
    if (newMode === scanMode) return;

    await stopAllCameras();
    setErrorMessage(null);
    setFeedbackMessage(null);
    setDetectedTag(null);
    setEditableName('');
    setShowManualInput(false);

    setScanMode(newMode);
  };

  // --- Main Lifecycle Effect ---
  useEffect(() => {
    let isMounted = true;

    if (!isOpen) {
      stopAllCameras();
      setShowManualInput(false);
      setErrorMessage(null);
      setFeedbackMessage(null);
      setDetectedTag(null);
      setRecentAddedToast(null);
      setIsPermissionDenied(false);
      setIsCameraNotFound(false);
      setManualCode('');
      setManualError(null);
      setScanMode('shelftag');
      return;
    }

    if (scanMode === 'barcode') {
      startBarcodeScanner(isMounted);
    } else {
      startShelfTagCamera(isMounted);
    }

    return () => {
      isMounted = false;
      stopAllCameras();
    };
  }, [isOpen, scanMode, startBarcodeScanner, startShelfTagCamera, stopAllCameras]);

  // --- Torch Toggle ---
  const handleToggleTorch = async () => {
    if (!isTorchSupported) return;
    const nextTorch = !isTorchOn;

    if (scanMode === 'barcode' && barcodeScannerRef.current) {
      try {
        await barcodeScannerRef.current.applyVideoConstraints({
          advanced: [{ torch: nextTorch } as unknown as MediaTrackConstraintSet],
        });
        setIsTorchOn(nextTorch);
      } catch (err) {
        console.warn('Failed to toggle torch in barcode mode:', err);
      }
    } else if (scanMode === 'shelftag' && shelfStreamRef.current) {
      try {
        const track = shelfStreamRef.current.getVideoTracks()[0];
        if (track) {
          await track.applyConstraints({
            advanced: [{ torch: nextTorch } as unknown as MediaTrackConstraintSet],
          });
          setIsTorchOn(nextTorch);
        }
      } catch (err) {
        console.warn('Failed to toggle torch in shelf tag mode:', err);
      }
    }
  };

  // --- Manual Barcode Submit ---
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

  // --- Capture Shelf Tag OCR ---
  const handleCaptureShelfTag = async () => {
    if (isCapturing) return;

    const video = shelfVideoRef.current;
    const reticle = shelfReticleRef.current;

    if (!video || !reticle || video.videoWidth === 0 || video.videoHeight === 0) {
      setFeedbackMessage('Esperando a que la cámara enfoque...');
      return;
    }

    try {
      setIsCapturing(true);
      setFeedbackMessage(null);

      const videoRect = video.getBoundingClientRect();
      const reticleRect = reticle.getBoundingClientRect();

      // Calculate video crop factoring in object-fit: cover
      const videoRatio = video.videoWidth / video.videoHeight;
      const elemRatio = videoRect.width / videoRect.height;
      let visibleWidth = video.videoWidth;
      let visibleHeight = video.videoHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (videoRatio > elemRatio) {
        visibleWidth = video.videoHeight * elemRatio;
        offsetX = (video.videoWidth - visibleWidth) / 2;
      } else {
        visibleHeight = video.videoWidth / elemRatio;
        offsetY = (video.videoHeight - visibleHeight) / 2;
      }

      const scale = visibleWidth / videoRect.width;
      const cropX = Math.max(0, offsetX + (reticleRect.left - videoRect.left) * scale);
      const cropY = Math.max(0, offsetY + (reticleRect.top - videoRect.top) * scale);
      const cropW = Math.min(video.videoWidth - cropX, reticleRect.width * scale);
      const cropH = Math.min(video.videoHeight - cropY, reticleRect.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(cropW));
      canvas.height = Math.max(1, Math.round(cropH));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setFeedbackMessage('No se pudo inicializar el procesador de imagen.');
        setIsCapturing(false);
        return;
      }

      ctx.drawImage(
        video,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const { text, tag } = await OnDeviceOcrService.recognizeShelfTagFromCanvas(canvas);

      if (tag && tag.price && tag.name) {
        Haptics.triggerScanSuccess();

        if (autoAdd) {
          if (onShelfTagScanned) {
            onShelfTagScanned({
              name: tag.name,
              price: tag.price,
            });
          }
          setRecentAddedToast({
            name: tag.name,
            price: tag.price.format(),
          });
          setTimeout(() => setRecentAddedToast(null), 2500);
          setDetectedTag(null);
          setEditableName('');
          setFeedbackMessage(null);
        } else {
          setDetectedTag(tag);
          setEditableName(tag.name);
          setFeedbackMessage(null);
        }
      } else {
        if (text && text.trim().length > 0) {
          setFeedbackMessage(
            'Texto detectado pero incompleto. Acerca la cámara para encuadrar bien el nombre y el precio.'
          );
        } else {
          setFeedbackMessage(
            'No se detectó texto. Asegúrate de enfocar con buena luz y sin reflejos.'
          );
        }
      }
    } catch (err) {
      console.warn('Shelf tag capture error:', err);
      setFeedbackMessage('Error al leer la etiqueta. Inténtalo de nuevo.');
    } finally {
      setIsCapturing(false);
    }
  };

  // --- Confirm Add Shelf Tag ---
  const handleConfirmAddTag = () => {
    if (!detectedTag) return;
    const finalName = editableName.trim() || detectedTag.name;

    Haptics.triggerScanSuccess();
    if (onShelfTagScanned) {
      onShelfTagScanned({
        name: finalName,
        price: detectedTag.price,
      });
    }

    setRecentAddedToast({
      name: finalName,
      price: detectedTag.price.format(),
    });
    setTimeout(() => setRecentAddedToast(null), 2500);

    // Reset preview so the user can scan the next tag immediately
    setDetectedTag(null);
    setEditableName('');
    setFeedbackMessage(null);
  };

  const handleRetryTag = () => {
    setDetectedTag(null);
    setEditableName('');
    setFeedbackMessage(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className="scanner-fullscreen-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Escáner de productos y etiquetas"
    >
      {/* Top action bar: Mode switcher, Running Cart Header & Controls */}
      <div className="scanner-top-bar">
        <div className="scanner-top-row">
          <div className="scanner-mode-switch" role="tablist" aria-label="Modo de escaneo">
            <button
              type="button"
              role="tab"
              aria-selected={scanMode === 'shelftag'}
              className={`scanner-mode-tab ${scanMode === 'shelftag' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('shelftag')}
            >
              <ScanText size={18} />
              <span>Etiqueta</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scanMode === 'barcode'}
              className={`scanner-mode-tab ${scanMode === 'barcode' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('barcode')}
            >
              <Barcode size={18} />
              <span>Código</span>
            </button>
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

        {/* Real-time session total & item count header */}
        <div className="scanner-cart-indicator" aria-live="polite">
          <span className="cart-indicator-label">Cesta:</span>
          <span className="cart-indicator-amount">
            {cartTotal ? cartTotal.format() : '0,00 €'}
          </span>
          <span className="cart-indicator-count">
            ({cartItemCount} {cartItemCount === 1 ? 'ud' : 'uds'})
          </span>
        </div>
      </div>

      {/* Camera Viewport Container */}
      <div className="scanner-viewport-wrapper">
        {scanMode === 'barcode' ? (
          <div id="qr-reader" className="scanner-qr-reader" />
        ) : (
          <video
            ref={shelfVideoRef}
            playsInline
            autoPlay
            muted
            className="scanner-video-feed"
          />
        )}

        {/* Barcode Focus reticle frame overlay */}
        {scanMode === 'barcode' && isCameraActive && (
          <div className="scanner-reticle-container" aria-hidden="true">
            <div className="scanner-reticle-box">
              <div className="reticle-corner top-left" />
              <div className="reticle-corner top-right" />
              <div className="reticle-corner bottom-left" />
              <div className="reticle-corner bottom-right" />
              <div className="reticle-laser" />
            </div>
            <p className="scanner-hint-text">Enfoca a unos 15-20 cm · Evita reflejos de luz</p>
          </div>
        )}

        {/* Shelf Tag Focus reticle frame overlay */}
        {scanMode === 'shelftag' && isCameraActive && (
          <div className="scanner-reticle-container" aria-hidden="true">
            <div
              ref={shelfReticleRef}
              className="scanner-reticle-box shelf-tag-reticle-box"
            >
              <div className="reticle-corner top-left" />
              <div className="reticle-corner top-right" />
              <div className="reticle-corner bottom-left" />
              <div className="reticle-corner bottom-right" />
              <div className="reticle-laser" />
            </div>
            <p className="scanner-hint-text">
              Encuadra el nombre y el precio de la etiqueta
            </p>
          </div>
        )}

        {/* Capturing loading overlay */}
        {isCapturing && (
          <div className="scanner-capturing-overlay">
            <div className="capturing-spinner-box">
              <Loader2 size={36} className="animate-spin text-primary" />
              <p>Leyendo etiqueta...</p>
            </div>
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

      {/* Bottom control panel */}
      <div className="scanner-bottom-panel">
        {scanMode === 'barcode' ? (
          !showManualInput ? (
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
          )
        ) : detectedTag ? (
          /* Detected Shelf Tag Preview Card */
          <div
            className="shelf-tag-preview-card"
            role="region"
            aria-label="Etiqueta detectada"
          >
            <div className="preview-card-header">
              <span className="preview-badge">Etiqueta detectada</span>
              <span className="preview-price">{detectedTag.price.format()}</span>
            </div>
            {detectedTag.unitRate && (
              <span className="preview-unit-rate">{detectedTag.unitRate}</span>
            )}
            <div className="preview-input-group">
              <label htmlFor="detected-name-input" className="preview-label">
                Producto:
              </label>
              <input
                id="detected-name-input"
                type="text"
                className="preview-name-input"
                value={editableName}
                onChange={(e) => setEditableName(e.target.value)}
                placeholder="Nombre del producto"
              />
            </div>
            <div className="preview-actions">
              <button
                type="button"
                className="btn-retry-tag"
                onClick={handleRetryTag}
              >
                <RotateCcw size={18} />
                <span>Reintentar</span>
              </button>
              <button
                type="button"
                className="btn-add-tag-to-cart"
                onClick={handleConfirmAddTag}
              >
                <Check size={18} />
                <span>Añadir a la cesta</span>
              </button>
            </div>
          </div>
        ) : (
          /* Prominent Shelf Tag Capture Button & Auto-add controls */
          <div className="scanner-shelf-bottom">
            <button
              type="button"
              className="btn-scan-shelf-tag"
              onClick={handleCaptureShelfTag}
              disabled={isCapturing || !isCameraActive}
              aria-label="Escanear Etiqueta"
            >
              {isCapturing ? (
                <>
                  <Loader2 size={24} className="animate-spin" />
                  <span>Leyendo etiqueta...</span>
                </>
              ) : (
                <>
                  <ScanText size={24} />
                  <span>Escanear Etiqueta</span>
                </>
              )}
            </button>

            <div className="scanner-autoadd-wrap">
              <label className="scanner-autoadd-label">
                <input
                  type="checkbox"
                  checked={autoAdd}
                  onChange={(e) => setAutoAdd(e.target.checked)}
                  className="scanner-autoadd-checkbox"
                />
                <span>Auto-añadir al detectar</span>
              </label>
            </div>

            {recentAddedToast && (
              <div className="scanner-recent-toast" role="status">
                <Check size={18} />
                <span>
                  Añadido: <strong>{recentAddedToast.name}</strong> ({recentAddedToast.price})
                </span>
              </div>
            )}

            {feedbackMessage && (
              <p className="shelf-feedback-text">{feedbackMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
