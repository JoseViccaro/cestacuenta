import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ScanText, Zap, ZapOff, CameraOff, AlertCircle, Loader2 } from 'lucide-react';
import { Money } from '../../domain/index.js';
import { OnDeviceOcrService } from '../../infrastructure/ocr/OnDeviceOcrService.js';
import { Haptics } from '../../infrastructure/device/Haptics.js';

export interface OcrPriceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPriceDetected: (price: Money) => void;
}

export const OcrPriceScannerModal: React.FC<OcrPriceScannerModalProps> = ({
  isOpen,
  onClose,
  onPriceDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  useEffect(() => {
    let isMounted = true;

    if (!isOpen) {
      stopCamera();
      setIsProcessing(false);
      setErrorMessage(null);
      setFeedbackMessage(null);
      return;
    }

    const startCamera = async () => {
      setErrorMessage(null);
      setFeedbackMessage(null);

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

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // Autoplay could be blocked until interaction
          }
        }

        setIsCameraActive(true);

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
          setErrorMessage('Permiso de cámara denegado. Permite el acceso para leer etiquetas.');
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setErrorMessage('No se encontró ninguna cámara disponible en el dispositivo.');
        } else {
          setErrorMessage('No se pudo iniciar la cámara para leer el precio.');
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  const handleToggleTorch = async () => {
    if (!streamRef.current || !isTorchSupported) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        const nextTorch = !isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextTorch } as unknown as MediaTrackConstraintSet],
        });
        setIsTorchOn(nextTorch);
      }
    } catch (err) {
      console.warn('Failed to toggle torch:', err);
    }
  };

  const handleCapturePrice = async () => {
    if (isProcessing) return;

    const video = videoRef.current;
    const reticle = reticleRef.current;

    if (!video || !reticle || video.videoWidth === 0 || video.videoHeight === 0) {
      setFeedbackMessage('Esperando a que la cámara enfoque...');
      return;
    }

    try {
      setIsProcessing(true);
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
      const cropX = offsetX + (reticleRect.left - videoRect.left) * scale;
      const cropY = offsetY + (reticleRect.top - videoRect.top) * scale;
      const cropW = reticleRect.width * scale;
      const cropH = reticleRect.height * scale;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(cropW));
      canvas.height = Math.max(1, Math.round(cropH));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setFeedbackMessage('No se pudo inicializar el procesador de imagen.');
        setIsProcessing(false);
        return;
      }

      // Draw the cropped reticle area
      ctx.drawImage(
        video,
        Math.max(0, cropX),
        Math.max(0, cropY),
        Math.min(video.videoWidth, cropW),
        Math.min(video.videoHeight, cropH),
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Perform OCR
      const { text, price } = await OnDeviceOcrService.recognizePriceFromCanvas(canvas);

      if (price && price.cents > 0) {
        Haptics.triggerScanSuccess();
        stopCamera();
        onPriceDetected(price);
        onClose();
        return;
      }

      // If no valid price was extracted, provide helpful user feedback
      if (text && text.trim().length > 0) {
        setFeedbackMessage(
          `Texto leído ("${text.trim().slice(0, 30)}"), pero no se identificó un precio válido. Intenta acercar la cámara.`
        );
      } else {
        setFeedbackMessage('No se detectó el precio. Asegura buena iluminación y encuadra solo la etiqueta.');
      }
    } catch (err) {
      console.warn('Error capturing price via OCR:', err);
      setFeedbackMessage('Error al procesar la imagen. Intenta de nuevo.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="ocr-scanner-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Reconocimiento de precio de estantería"
    >
      {/* Top Header Bar */}
      <div className="ocr-top-bar">
        <div className="ocr-top-title">
          <ScanText size={18} />
          <span>Escanear precio de estantería</span>
        </div>

        <div className="ocr-top-controls">
          {isTorchSupported && isCameraActive && (
            <button
              type="button"
              className={`ocr-control-btn ${isTorchOn ? 'active' : ''}`}
              onClick={handleToggleTorch}
              aria-label={isTorchOn ? 'Apagar linterna' : 'Encender linterna'}
              title={isTorchOn ? 'Apagar linterna' : 'Encender linterna'}
            >
              {isTorchOn ? <ZapOff size={22} /> : <Zap size={22} />}
            </button>
          )}

          <button
            type="button"
            className="ocr-control-btn close-btn"
            onClick={handleClose}
            aria-label="Cerrar escáner de precio"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Camera Viewport Area */}
      <div className="ocr-viewport-wrapper">
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="ocr-camera-video"
          aria-hidden="true"
        />

        {/* Reticle Guide Frame */}
        {isCameraActive && (
          <div className="ocr-reticle-container" aria-hidden="true">
            <div ref={reticleRef} className="ocr-reticle-box">
              <div className="ocr-corner top-left" />
              <div className="ocr-corner top-right" />
              <div className="ocr-corner bottom-left" />
              <div className="ocr-corner bottom-right" />
              <div className="ocr-reticle-line" />
            </div>
            <p className="ocr-guide-text">
              Encuadrá el precio en la estantería (ej. 1,45 €)
            </p>
          </div>
        )}

        {/* Processing State Indicator */}
        {isProcessing && (
          <div className="ocr-processing-indicator" role="status" aria-live="polite">
            <Loader2 size={32} className="spin-animation" />
            <span className="ocr-processing-text">Leyendo precio...</span>
          </div>
        )}

        {/* Feedback message (e.g. price not found) */}
        {feedbackMessage && !isProcessing && (
          <div className="ocr-feedback-banner" role="alert">
            <AlertCircle size={18} />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Camera error / permission fallback */}
        {errorMessage && (
          <div className="ocr-error-banner">
            <CameraOff size={36} />
            <p>{errorMessage}</p>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Panel */}
      <div className="ocr-bottom-bar">
        <button
          type="button"
          className="btn-ocr-capture"
          onClick={handleCapturePrice}
          disabled={!isCameraActive || isProcessing}
          aria-label="Leer precio de la estantería"
        >
          {isProcessing ? (
            <>
              <Loader2 size={20} className="spin-animation" />
              <span>Leyendo precio...</span>
            </>
          ) : (
            <>
              <ScanText size={20} />
              <span>Leer precio</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="btn-ocr-cancel"
          onClick={handleClose}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};
