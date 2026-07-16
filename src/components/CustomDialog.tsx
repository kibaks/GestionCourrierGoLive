import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faExclamationTriangle, faInfoCircle, faTimes } from '@fortawesome/free-solid-svg-icons';

export interface DialogOptions {
  title?: string;
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  confirmText?: string;
  cancelText?: string;
  /** 'alert' = un seul bouton OK, 'confirm' = Annuler + Confirmer, 'prompt' = avec input texte */
  variant?: 'alert' | 'confirm' | 'prompt';
  inputLabel?: string;
  inputPlaceholder?: string;
  defaultValue?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
  onClose?: () => void;
}

interface CustomDialogProps extends DialogOptions {
  isOpen: boolean;
  onClose: () => void;
}

const CustomDialog: React.FC<CustomDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Annuler',
  variant = 'confirm',
  inputLabel,
  inputPlaceholder,
  defaultValue = '',
  onConfirm,
  onCancel,
  onClose
}) => {
  const [inputValue, setInputValue] = React.useState(defaultValue);
  
  React.useEffect(() => {
    if (isOpen) setInputValue(defaultValue);
  }, [isOpen, defaultValue]);
  
  if (!isOpen) return null;

  const isPrompt = variant === 'prompt';
  const isAlert = variant === 'alert' || (onConfirm !== undefined && !onCancel && !isPrompt);
  const isConfirm = onConfirm !== undefined;
  const showCancelButton = isConfirm || isPrompt;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return faCheckCircle;
      case 'warning':
        return faExclamationTriangle;
      case 'error':
        return faExclamationTriangle;
      default:
        return faInfoCircle;
    }
  };

  const getIconColor = () => {
    switch (type) {
      case 'success': return 'text-emerald-600';
      case 'warning': return 'text-amber-600';
      case 'error': return 'text-rose-600';
      default: return 'text-blue-600';
    }
  };

  const getButtonColor = () => {
    switch (type) {
      case 'success': return 'bg-emerald-600 hover:bg-emerald-700 shadow-sm hover:shadow-md';
      case 'warning': return 'bg-amber-600 hover:bg-amber-700 shadow-sm hover:shadow-md';
      case 'error': return 'bg-rose-600 hover:bg-rose-700 shadow-sm hover:shadow-md';
      default: return 'bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow-md';
    }
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm(isPrompt ? inputValue : undefined);
    }
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  const headerStyles: Record<string, string> = {
    success: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white',
    warning: 'border-amber-200/80 bg-gradient-to-br from-amber-50 to-white',
    error: 'border-rose-200/80 bg-gradient-to-br from-rose-50 to-white',
    info: 'border-blue-200/80 bg-gradient-to-br from-blue-50 to-white',
  };
  const iconBgStyles: Record<string, string> = {
    success: 'bg-emerald-100 text-emerald-600',
    warning: 'bg-amber-100 text-amber-600',
    error: 'bg-rose-100 text-rose-600',
    info: 'bg-blue-100 text-blue-600',
  };
  const t = type || 'info';

  return (
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4">
      {/* Backdrop — flou doux */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300 animate-fadeIn"
        onClick={isAlert ? undefined : !isConfirm ? handleCancel : undefined}
        aria-hidden
      />
      
      {/* Dialog — carte surélevée, bords arrondis */}
      <div 
        className="relative bg-white rounded-2xl max-w-md w-full mx-4 overflow-hidden shadow-dialog ring-1 ring-slate-200/80 transform transition-all duration-300 animate-slideIn z-[10000000]" 
        onClick={(e) => e.stopPropagation()} 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="dialog-title"
      >
        {/* Header — dégradé léger selon le type */}
        <div className={`flex items-center justify-between px-6 py-5 border-b ${headerStyles[t] || headerStyles.info}`}>
          <div className="flex items-center gap-4">
            <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${iconBgStyles[t] || iconBgStyles.info} shadow-sm`}>
              <FontAwesomeIcon icon={getIcon()} className="text-lg" />
            </div>
            <h3 id="dialog-title" className="text-lg font-semibold text-slate-800 tracking-tight">
              {title || (type === 'success' ? 'Succès' : type === 'warning' ? 'Attention' : type === 'error' ? 'Erreur' : 'Information')}
            </h3>
          </div>
          {(showCancelButton || !isConfirm || isAlert) && (
            <button
              type="button"
              onClick={isAlert ? handleConfirm : handleCancel}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors p-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              aria-label="Fermer"
            >
              <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body — lisibilité et espace */}
        <div className="px-6 py-6 space-y-4">
          {message && <p className="text-slate-600 whitespace-pre-line leading-relaxed text-[15px]">{message}</p>}
          {isPrompt && (
            <div>
              {inputLabel && <label className="block text-sm font-medium text-slate-700 mb-1.5">{inputLabel}</label>}
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputPlaceholder}
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              />
            </div>
          )}
        </div>

        {/* Footer — boutons cohérents */}
        <div className={`flex ${showCancelButton ? 'justify-end gap-3' : 'justify-end'} px-6 py-4 border-t border-slate-100 bg-slate-50/80`}>
          {showCancelButton && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${getButtonColor()} hover:shadow-md focus:ring-blue-500`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomDialog;

