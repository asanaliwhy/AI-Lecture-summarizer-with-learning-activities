import React, { useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { cn } from '../../lib/utils'
import { Button } from './Button'
import { AlertTriangle, Loader2 } from 'lucide-react'

export interface ConfirmDialogProps {
    open: boolean
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'default' | 'destructive'
    loading?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'default',
    loading = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const cancelRef = useRef<HTMLButtonElement>(null)
    const dialogRef = useRef<HTMLDivElement>(null)

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !loading) {
                onCancel()
            }
        },
        [onCancel, loading],
    )

    // Focus the cancel button when the dialog opens & trap Escape
    useEffect(() => {
        if (!open) return

        cancelRef.current?.focus()
        document.addEventListener('keydown', handleKeyDown)
        // Prevent background scroll
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.body.style.overflow = prev
        }
    }, [open, handleKeyDown])

    if (!open) return null

    const isDestructive = variant === 'destructive'

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="presentation"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={loading ? undefined : onCancel}
                aria-hidden="true"
            />

            {/* Dialog panel */}
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-description"
                className="relative z-10 w-full max-w-md mx-4 rounded-2xl border bg-background p-6 shadow-2xl animate-in zoom-in-95 fade-in duration-200"
            >
                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div
                        className={cn(
                            'flex h-14 w-14 items-center justify-center rounded-full',
                            isDestructive
                                ? 'bg-red-100 dark:bg-red-950/40'
                                : 'bg-amber-100 dark:bg-amber-950/40',
                        )}
                    >
                        <AlertTriangle
                            className={cn(
                                'h-7 w-7',
                                isDestructive
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-amber-600 dark:text-amber-400',
                            )}
                        />
                    </div>
                </div>

                {/* Title */}
                <h2
                    id="confirm-dialog-title"
                    className="text-center text-lg font-semibold tracking-tight"
                >
                    {title}
                </h2>

                {/* Description */}
                <p
                    id="confirm-dialog-description"
                    className="mt-2 text-center text-sm text-muted-foreground leading-relaxed"
                >
                    {description}
                </p>

                {/* Actions */}
                <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-center gap-2">
                    <Button
                        ref={cancelRef}
                        variant="outline"
                        onClick={onCancel}
                        disabled={loading}
                        className="w-full sm:w-auto"
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={isDestructive ? 'destructive' : 'default'}
                        onClick={onConfirm}
                        disabled={loading}
                        className="w-full sm:w-auto"
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
