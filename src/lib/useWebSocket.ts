import { useEffect, useRef, useCallback, useState } from 'react'
import { API_BASE, refreshAccessToken } from './api'

interface WSMessage {
    type: string
    payload: any
}

interface UseWebSocketOptions {
    onStatusUpdate?: (payload: any) => void
    onCompleted?: (payload: any) => void
    onError?: (payload: any) => void
    onMessage?: (msg: WSMessage) => void
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
    const wsRef = useRef<WebSocket | null>(null)
    const reconnectTimerRef = useRef<number>()
    const reconnectDelayRef = useRef(3000)
    const isConnectingRef = useRef(false)
    const unmountedRef = useRef(false)
    const optionsRef = useRef<UseWebSocketOptions>(options)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        optionsRef.current = options
    }, [options])

    const connect = useCallback(async () => {
        if (isConnectingRef.current || unmountedRef.current) return
        isConnectingRef.current = true

        let token = localStorage.getItem('access_token')
        if (!token) {
            token = await refreshAccessToken()
            if (!token) {
                isConnectingRef.current = false
                return
            }
        }

        const apiUrl = new URL(API_BASE)
        const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${apiUrl.host}${apiUrl.pathname}/ws?token=${encodeURIComponent(token)}`

        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
            setIsConnected(true)
            reconnectDelayRef.current = 3000
            isConnectingRef.current = false
            console.log('WebSocket connected')
        }

        ws.onmessage = (event) => {
            try {
                const msg: WSMessage = JSON.parse(event.data)

                optionsRef.current.onMessage?.(msg)

                switch (msg.type) {
                    case 'status_update':
                        optionsRef.current.onStatusUpdate?.(msg.payload)
                        break
                    case 'completed':
                        optionsRef.current.onCompleted?.(msg.payload)
                        break
                    case 'error':
                        optionsRef.current.onError?.(msg.payload)
                        break
                }
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e)
            }
        }

        ws.onclose = async () => {
            setIsConnected(false)
            isConnectingRef.current = false

            if (unmountedRef.current) return

            // Refresh only when token is likely expired; avoid refresh storms.
            try {
                const payloadBase64 = token.split('.')[1]
                if (payloadBase64) {
                    const payload = JSON.parse(atob(payloadBase64))
                    const nowSec = Math.floor(Date.now() / 1000)
                    const expSec = Number(payload?.exp || 0)
                    if (expSec > 0 && expSec <= nowSec + 30) {
                        await refreshAccessToken()
                    }
                }
            } catch {
                // ignore parse errors
            }

            reconnectTimerRef.current = window.setTimeout(() => {
                connect()
            }, reconnectDelayRef.current)

            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000)
        }

        ws.onerror = () => {
            ws.close()
        }

        wsRef.current = ws
    }, [])

    useEffect(() => {
        unmountedRef.current = false
        connect()

        return () => {
            unmountedRef.current = true
            clearTimeout(reconnectTimerRef.current)
            wsRef.current?.close()
        }
    }, [connect])

    return { isConnected }
}
