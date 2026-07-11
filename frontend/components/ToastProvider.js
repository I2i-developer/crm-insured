'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import styles from './toast.module.css';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
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
        show({
          type: 'warning',
          title,
          message,
          duration: 0,
          confirm: {
            confirmLabel,
            cancelLabel,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
          }
        });
      })
    )
  }), [show]);

  const handleConfirm = (toast, result) => {
    dismiss(toast.id);
    if (result) toast.confirm.onConfirm();
    else toast.confirm.onCancel();
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
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

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
