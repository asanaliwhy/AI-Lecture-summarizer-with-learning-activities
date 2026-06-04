import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
    id: number
    message: string
    type: ToastType
    duration?: number
}

interface ToastContextType {
    toast: (message: string, type?: ToastType, duration?: number) => void
    success: (message: string) => void
    error: (message: string) => void
    warning: (message: string) => void
    info: (message: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

let toastId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    const addToast = useCallback(
        (message: string, type: ToastType = 'info', duration = 4000) => {
            const id = ++toastId
            setToasts((prev) => [...prev, { id, message, type, duration }])
            if (duration > 0) {
                setTimeout(() => removeToast(id), duration)
            }
        },
        [removeToast],
    )

    const ctx: ToastContextType = {
        toast: addToast,
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error', 6000),
        warning: (msg) => addToast(msg, 'warning', 5000),
        info: (msg) => addToast(msg, 'info'),
    }

    return (
        <ToastContext.Provider value={ctx}>
            {children}
            {/* Toast Container */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
    const [isExiting, setIsExiting] = useState(false)

    const handleDismiss = () => {
        setIsExiting(true)
        setTimeout(onDismiss, 200)
    }

    const icons = {
        success: <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />,
        error: <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />,
        warning: <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />,
        info: <Info className="h-5 w-5 text-blue-500 flex-shrink-0" />,
    }

    const styles = {
        success: 'border-green-200 bg-green-50 dark:bg-green-950/50 dark:border-green-800',
        error: 'border-red-200 bg-red-50 dark:bg-red-950/50 dark:border-red-800',
        warning: 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/50 dark:border-yellow-800',
        info: 'border-blue-200 bg-blue-50 dark:bg-blue-950/50 dark:border-blue-800',
    }

    return (
        <div
            className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-200',
                styles[toast.type],
                isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-in slide-in-from-right-5',
            )}
        >
            {icons[toast.type]}
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button
                onClick={handleDismiss}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}

export function useToast() {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used within a ToastProvider')
    return ctx
}
