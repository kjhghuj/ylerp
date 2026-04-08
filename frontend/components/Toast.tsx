import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
    closing?: boolean;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={18} />,
    error: <AlertCircle size={18} />,
    info: <Info size={18} />,
};

const styleMap: Record<ToastType, { light: string; dark: string }> = {
    success: {
        light: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        dark: 'dark:bg-emerald-900/30 dark:border-emerald-800/40 dark:text-emerald-300',
    },
    error: {
        light: 'bg-red-50 border-red-200 text-red-700',
        dark: 'dark:bg-red-900/30 dark:border-red-800/40 dark:text-red-300',
    },
    info: {
        light: 'bg-blue-50 border-blue-200 text-blue-700',
        dark: 'dark:bg-blue-900/30 dark:border-blue-800/40 dark:text-blue-300',
    },
};

const iconColorMap: Record<ToastType, { light: string; dark: string }> = {
    success: { light: 'text-emerald-500', dark: 'dark:text-emerald-400' },
    error: { light: 'text-red-500', dark: 'dark:text-red-400' },
    info: { light: 'text-blue-500', dark: 'dark:text-blue-400' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const counterRef = useRef(0);

    const showToast = useCallback((message: string, type: ToastType = 'success', duration = 3000) => {
        const id = ++counterRef.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.map(t => t.id === id ? { ...t, closing: true } : t));
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 300);
        }, duration);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`
                            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm
                            min-w-[280px] max-w-[400px]
                            transition-all duration-300 ease-out
                            ${styleMap[toast.type].light} ${styleMap[toast.type].dark}
                            ${toast.closing
                                ? 'opacity-0 translate-x-8 scale-95'
                                : 'opacity-100 translate-x-0 scale-100 animate-[slideIn_0.3s_ease-out]'
                            }
                        `}
                    >
                        <span className={`shrink-0 ${iconColorMap[toast.type].light} ${iconColorMap[toast.type].dark}`}>{icons[toast.type]}</span>
                        <span className="flex-1 text-sm font-bold">{toast.message}</span>
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateX(100%) scale(0.95); }
                    to { opacity: 1; transform: translateX(0) scale(1); }
                }
            `}</style>
        </ToastContext.Provider>
    );
};
