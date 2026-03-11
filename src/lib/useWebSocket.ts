import { useEffect, useRef, useCallback, useState } from 'react'
import { API_BASE, api, refreshAccessToken, tryRefreshOnce } from './api'

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
    const reconnectAttemptsRef = useRef(0)
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

        const scheduleReconnect = (reason: string) => {
            if (unmountedRef.current) return

            if (reconnectTimerRef.current) {
                window.clearTimeout(reconnectTimerRef.current)
            }

            const delay = reconnectDelayRef.current
            reconnectAttemptsRef.current += 1
            console.warn(
                `[WebSocket] reconnect attempt #${reconnectAttemptsRef.current} in ${delay}ms (${reason})`
            )

            reconnectTimerRef.current = window.setTimeout(() => {
                if (!unmountedRef.current) connect()
            }, delay)

            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000)
        }

        let token = localStorage.getItem('access_token')
        if (!token) {
            token = await refreshAccessToken()
            if (!token) {
                console.warn('[WebSocket] no access token and refresh failed; skipping connect')
                isConnectingRef.current = false
                return
            }
        }

        let ticket: string
        try {
            const response = await api.ws.getTicket()
            ticket = response.ticket
            console.debug('[WebSocket] fetched fresh ticket')
        } catch (err) {
            console.error('[WebSocket] failed to fetch ticket:', err)
            isConnectingRef.current = false
            scheduleReconnect('ticket fetch failed')
            return
        }

        if (unmountedRef.current) {
            isConnectingRef.current = false
            return
        }

        const apiUrl = new URL(API_BASE)
        const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${apiUrl.host}${apiUrl.pathname}/ws?ticket=${encodeURIComponent(ticket)}`

        let ws: WebSocket
        try {
            ws = new WebSocket(wsUrl)
        } catch (err) {
            console.error('[WebSocket] constructor failed:', err)
            isConnectingRef.current = false
            scheduleReconnect('WebSocket constructor failed')
            return
        }

        ws.onopen = () => {
            setIsConnected(true)
            reconnectDelayRef.current = 3000
            reconnectAttemptsRef.current = 0
            isConnectingRef.current = false
            console.log('[WebSocket] connected:', wsUrl)
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

        ws.onclose = async (event) => {
            setIsConnected(false)
            isConnectingRef.current = false

            console.warn(
                `[WebSocket] closed code=${event.code} reason=${event.reason || '(empty)'} clean=${event.wasClean}`
            )

            if (unmountedRef.current) return

            // Refresh only when token is likely expired; avoid refresh storms.
            try {
                const payloadBase64 = token.split('.')[1]
                if (payloadBase64) {
                    const payload = JSON.parse(atob(payloadBase64))
                    const nowSec = Math.floor(Date.now() / 1000)
                    const expSec = Number(payload?.exp || 0)
                    if (expSec > 0 && expSec <= nowSec + 30) {
                        await tryRefreshOnce()
                    }
                }
            } catch {
                // ignore parse errors
            }

            scheduleReconnect(`socket closed (${event.code})`)
        }

        ws.onerror = (event) => {
            console.error('[WebSocket] error event:', event)
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
