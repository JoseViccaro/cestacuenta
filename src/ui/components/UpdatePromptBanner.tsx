import React from 'react';
import { Sparkles, RefreshCw, X } from 'lucide-react';

export interface UpdatePromptBannerProps {
  isOpen: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
}

export const UpdatePromptBanner: React.FC<UpdatePromptBannerProps> = ({
  isOpen,
  onUpdate,
  onDismiss,
}) => {
  if (!isOpen) return null;

  return (
    <aside
      className="update-banner-container"
      role="alert"
      aria-live="assertive"
      aria-label="Aviso de actualización disponible"
    >
      <div className="update-banner-card">
        <div className="update-banner-icon-wrap" aria-hidden="true">
          <Sparkles size={20} className="update-banner-sparkle" />
        </div>

        <div className="update-banner-text">
          <span className="update-banner-title">¡Nueva versión disponible!</span>
          <span className="update-banner-desc">Hay mejoras y correcciones listas para tu compra.</span>
        </div>

        <div className="update-banner-actions">
          <button
            type="button"
            className="btn-update-now"
            onClick={onUpdate}
            aria-label="Actualizar la aplicación ahora"
          >
            <RefreshCw size={15} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            className="btn-update-dismiss"
            onClick={onDismiss}
            aria-label="Cerrar aviso de actualización"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};
