import { useState, useEffect, useCallback } from 'react'

export function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine)

    useEffect(() => {
        const goOnline = () => setIsOnline(true)
        const goOffline = () => setIsOnline(false)
        window.addEventListener('online', goOnline)
        window.addEventListener('offline', goOffline)
        return () => {
            window.removeEventListener('online', goOnline)
            window.removeEventListener('offline', goOffline)
        }
    }, [])

    return isOnline
}

/**
 * Retry wrapper for API calls — retries on network failure (not on 4xx errors).
 * Usage: const data = await withRetry(() => api.summaries.get(id))
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delayMs = 1000,
): Promise<T> {
    let lastError: any
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn()
        } catch (err: any) {
            lastError = err
            // Don't retry on client errors (4xx)
            if (err?.status && err.status >= 400 && err.status < 500) throw err
            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)))
            }
        }
    }
    throw lastError
}
