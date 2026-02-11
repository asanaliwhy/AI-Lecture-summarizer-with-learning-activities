import React from 'react'
import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '../../lib/useNetwork'

export function OfflineBanner() {
    const isOnline = useOnlineStatus()

    if (isOnline) return null

    return (
        <div className="fixed top-0 left-0 right-0 z-[200] bg-yellow-500 text-yellow-950 text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
            <WifiOff className="h-4 w-4" />
            You're offline. Some features may not work until you reconnect.
        </div>
    )
}
