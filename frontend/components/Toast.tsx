import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Toaster } from './ui/sonner';

type ToastType = 'success' | 'error' | 'info';
interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}
const ToastContext = createContext<ToastContextType>({ showToast: () => {} });
export const useToast = () => useContext(ToastContext);

/** Keep the existing business API while Sonner owns presentation and timers. */
export const ToastProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const owned = useRef(new Set<string | number>());
  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 3000) => {
    const id = toast[type](message, {
      duration,
      onDismiss: item => owned.current.delete(item.id),
      onAutoClose: item => owned.current.delete(item.id),
    });
    owned.current.add(id);
  }, []);
  useEffect(() => {
    const ids = owned.current;
    return () => { ids.forEach(id => toast.dismiss(id)); ids.clear(); };
  }, []);
  return <ToastContext.Provider value={{ showToast }}>{children}<Toaster offset={{ top: '72px', right: '16px' }} /></ToastContext.Provider>;
};
