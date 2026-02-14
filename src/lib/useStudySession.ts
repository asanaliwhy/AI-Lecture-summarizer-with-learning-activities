import { useEffect, useRef } from 'react'
import { api } from './api'

type ActivityType = 'summary' | 'quiz' | 'flashcard'

interface UseStudySessionOptions {
    activityType: ActivityType
    resourceId: string | null | undefined
    enabled?: boolean
    heartbeatIntervalMs?: number
    clientMeta?: Record<string, any>
}

export function useStudySession({
    activityType,
    resourceId,
    enabled = true,
    heartbeatIntervalMs = 30000,
    clientMeta,
}: UseStudySessionOptions) {
    const sessionIdRef = useRef<string | null>(null)
    const stoppedRef = useRef(false)

    useEffect(() => {
        if (!enabled || !resourceId) return

        let isMounted = true
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null

        const sendHeartbeat = () => {
            const sessionId = sessionIdRef.current
            if (!sessionId) return
            api.studySessions.heartbeat(sessionId).catch(() => { })
        }

        const stopSession = () => {
            if (stoppedRef.current) return
            stoppedRef.current = true

            const sessionId = sessionIdRef.current
            if (!sessionId) return
            api.studySessions.stop(sessionId).catch(() => { })
        }

        const startSession = async () => {
            const data = await api.studySessions.start(activityType, resourceId, clientMeta)
            if (!isMounted) return

            const sessionId = data?.session?.id || null
            sessionIdRef.current = sessionId
            stoppedRef.current = false

            if (sessionId) {
                heartbeatTimer = setInterval(sendHeartbeat, heartbeatIntervalMs)
            }
        }

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                sendHeartbeat()
            }
        }

        startSession().catch(() => { })
        document.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
            isMounted = false
            document.removeEventListener('visibilitychange', onVisibilityChange)
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
            }
            stopSession()
        }
    }, [activityType, resourceId, enabled, heartbeatIntervalMs, clientMeta])
}
