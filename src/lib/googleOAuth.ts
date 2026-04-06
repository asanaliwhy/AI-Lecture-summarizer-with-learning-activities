import { API_BASE } from './api'

export interface GoogleOAuthConfig {
    clientId: string
    redirectUri: string
}

interface GoogleOAuthConfigResponse {
    configured?: boolean
    client_id?: string
    redirect_uri?: string
}

function normalizeConfiguredRedirectUri(raw: string | undefined): string {
    const value = (raw || '').trim()
    if (!value) {
        return `${window.location.origin}/callback`
    }

    return value
}

function buildAuthURL(clientId: string, redirectUri: string): string {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function getGoogleOAuthConfigFromEnv(): GoogleOAuthConfig | null {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
    if (!clientId) {
        return null
    }

    const redirectUri = import.meta.env.DEV
        ? `${window.location.origin}/callback`
        : normalizeConfiguredRedirectUri(import.meta.env.VITE_GOOGLE_REDIRECT_URI)

    return { clientId, redirectUri }
}

export async function getGoogleOAuthConfig(): Promise<GoogleOAuthConfig | null> {
    const fromEnv = getGoogleOAuthConfigFromEnv()
    if (fromEnv) {
        return fromEnv
    }

    try {
        const res = await fetch(`${API_BASE}/auth/google/config`)
        if (!res.ok) {
            return null
        }

        const data: GoogleOAuthConfigResponse = await res.json()
        if (!data.configured) {
            return null
        }

        const clientId = (data.client_id || '').trim()
        const redirectUri = normalizeConfiguredRedirectUri(data.redirect_uri)
        if (!clientId) {
            return null
        }

        return { clientId, redirectUri }
    } catch {
        return null
    }
}

export async function buildGoogleAuthURL(): Promise<string | null> {
    const config = await getGoogleOAuthConfig()
    if (!config) {
        return null
    }

    return buildAuthURL(config.clientId, config.redirectUri)
}
