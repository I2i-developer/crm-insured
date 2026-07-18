'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import styles from './toast.module.css';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const show = useCallback((toast) => {
    const id = nextId.current;
    nextId.current += 1;

    const nextToast = {
      id,
      type: toast.type || 'info',
      title: toast.title || 'Notice',
      message: toast.message || '',
      duration: toast.duration ?? 4200,
      confirm: toast.confirm || null
    };

    setToasts(current => [nextToast, ...current].slice(0, 5));

    if (!nextToast.confirm && nextToast.duration > 0) {
      window.setTimeout(() => dismiss(id), nextToast.duration);
    }

    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    show,
    success: (message, title = 'Success') => show({ type: 'success', title, message }),
    error: (message, title = 'Something went wrong') => show({ type: 'error', title, message, duration: 6000 }),
    info: (message, title = 'Info') => show({ type: 'info', title, message }),
    warning: (message, title = 'Attention') => show({ type: 'warning', title, message }),
    confirm: ({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) => (
      new Promise(resolve => {
        setConfirmDialog({
          title,
          message,
          confirmLabel,
          cancelLabel,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false)
        });
      })
    )
  }), [show]);

  const handleConfirm = (toast, result) => {
    dismiss(toast.id);
    if (result) toast.confirm.onConfirm();
    else toast.confirm.onCancel();
  };

  const handleDialogClose = (result) => {
    const dialog = confirmDialog;
    setConfirmDialog(null);
    if (!dialog) return;
    if (result) dialog.onConfirm();
    else dialog.onCancel();
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {confirmDialog && (
        <div className={styles.confirmOverlay} role="presentation" onMouseDown={() => handleDialogClose(false)}>
          <div className={styles.confirmDialog} role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.confirmIcon}>
              <WarningIcon />
            </div>
            <div className={styles.confirmContent}>
              <h2 id="confirm-title">{confirmDialog.title}</h2>
              {confirmDialog.message && <p>{confirmDialog.message}</p>}
            </div>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => handleDialogClose(false)}>
                {confirmDialog.cancelLabel}
              </button>
              <button type="button" className={styles.confirmBtn} onClick={() => handleDialogClose(true)}>
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={styles.viewport} aria-live="polite" aria-relevant="additions">
        {toasts.map(toast => (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.type] || ''}`}>
            <span className={styles.bar}></span>
            <div className={styles.content}>
              <p className={styles.title}>{toast.title}</p>
              {toast.message && <p className={styles.message}>{toast.message}</p>}
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => toast.confirm ? handleConfirm(toast, false) : dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              x
            </button>
            {toast.confirm && (
              <div className={styles.actions}>
                <button type="button" className={styles.cancelBtn} onClick={() => handleConfirm(toast, false)}>
                  {toast.confirm.cancelLabel}
                </button>
                <button type="button" className={styles.confirmBtn} onClick={() => handleConfirm(toast, true)}>
                  {toast.confirm.confirmLabel}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
      <path d="M12 9v4"/>
      <path d="M12 17h.01"/>
    </svg>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
