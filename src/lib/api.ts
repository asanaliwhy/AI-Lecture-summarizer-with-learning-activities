export const API_BASE = 'http://localhost:8081/api/v1'

// ─── Token Management ───
function getAccessToken(): string | null {
    return localStorage.getItem('access_token')
}

function getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token')
}

export function setTokens(access: string, refresh: string) {
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
}

export function clearTokens() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
}

// ─── Fetch Wrapper ───
async function apiFetch<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getAccessToken()
    const headers: Record<string, string> = {
        ...(options.headers as Record<string, string>),
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    // Don't set Content-Type for FormData (browser sets boundary automatically)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    })

    // Try refresh on 401
    if (res.status === 401 && getRefreshToken()) {
        const refreshed = await tryRefresh()
        if (refreshed) {
            headers['Authorization'] = `Bearer ${getAccessToken()}`
            const retry = await fetch(`${API_BASE}${path}`, { ...options, headers })
            if (!retry.ok) {
                const err = await retry.json().catch(() => ({}))
                throw new ApiError(retry.status, err?.error?.message || 'Request failed', err?.error?.fields)
            }
            return retry.json()
        } else {
            clearTokens()
            window.location.href = '/login'
            throw new ApiError(401, 'Session expired')
        }
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new ApiError(res.status, err?.error?.message || 'Request failed', err?.error?.fields)
    }

    // 204 No Content
    if (res.status === 204) return {} as T

    return res.json()
}

async function tryRefresh(): Promise<boolean> {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false

    try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        })

        if (!res.ok) return false

        const data = await res.json()
        setTokens(data.access_token, data.refresh_token)
        return true
    } catch {
        return false
    }
}

export async function refreshAccessToken(): Promise<string | null> {
    const ok = await tryRefresh()
    return ok ? getAccessToken() : null
}

// ─── Error Class ───
export class ApiError extends Error {
    status: number
    fields?: Record<string, string>

    constructor(status: number, message: string, fields?: Record<string, string>) {
        super(message)
        this.status = status
        this.fields = fields
    }
}

export type DashboardGoalType = 'summary' | 'quiz' | 'flashcard'

export interface DashboardStatsResponse {
    summaries?: number
    quizzes_taken?: number
    flashcard_decks?: number
    study_hours?: number
    summaries_trend?: number
    quizzes_trend?: number
    flashcards_trend?: number
    study_hours_trend?: number
    weekly_goal_target?: number
    weekly_goal_type?: DashboardGoalType
    weekly_summaries?: number
    weekly_quizzes?: number
    weekly_flashcards?: number
}

export interface DashboardRecentItemResponse {
    id?: string | number
    type?: string
    title?: string
    created_at?: string
    createdAt?: string
    progress?: number
    completion?: number
}

export interface DashboardRecentResponse {
    recent?: DashboardRecentItemResponse[]
    items?: DashboardRecentItemResponse[]
}

export interface DashboardStreakResponse {
    current_streak?: number
    longest_streak?: number
    last_activity_date?: string
}

export interface DashboardActivityResponse {
    activity?: number[]
    days?: number[]
}

export interface SummarySectionResponse {
    title?: string
    body?: string
    content?: string
    key_concepts?: string[]
}

export interface SummaryListItemResponse {
    id: string
    content_id?: string
    title?: string
    source?: string
    source_type?: string
    config?: {
        source?: string
        source_type?: string
        content_id?: string
        format?: string
        length?: string
        focus_areas?: string[]
        target_audience?: string
        language?: string
    }
    tags?: string[]
    is_favorite?: boolean
    created_at?: string
    read_time?: string
    readTime?: string
    word_count?: number
    wordCount?: number
    progress?: number
    completion?: number
}

export interface SummaryDetailResponse extends SummaryListItemResponse {
    format?: 'cornell' | 'bullets' | 'paragraph' | 'smart' | string
    length_setting?: string
    content_raw?: string
    content?: string
    body?: string
    cornell_cues?: string
    cornell_notes?: string
    cornell_summary?: string
    sections?: SummarySectionResponse[]
    summary_text?: string
    source_url?: string
    source_duration?: string
    duration?: string
}

export interface GenerateSummaryPayload {
    content_id: string
    format: string
    length: string
    focus_areas: string[]
    target_audience: string
    language: string
}

// ─── API Methods ───
export const api = {
    // Auth
    auth: {
        register: (data: { full_name: string; email: string; password: string }) =>
            apiFetch<{ message: string; user_id: string }>('/auth/register', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        login: (data: { email: string; password: string }) =>
            apiFetch<{ access_token: string; refresh_token: string }>('/auth/login', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        logout: () =>
            apiFetch('/auth/logout', {
                method: 'POST',
                body: JSON.stringify({ refresh_token: getRefreshToken() }),
            }),

        verifyEmail: (token: string) =>
            apiFetch<{ access_token: string; refresh_token: string }>(`/auth/verify-email?token=${token}`),

        resendVerification: (email: string) =>
            apiFetch('/auth/resend-verification', {
                method: 'POST',
                body: JSON.stringify({ email }),
            }),
    },

    // Content
    content: {
        validateYouTube: (url: string) =>
            apiFetch<{ valid: boolean; metadata: any; content_id: string }>('/content/validate-youtube', {
                method: 'POST',
                body: JSON.stringify({ url }),
            }),

        upload: (file: File) => {
            const formData = new FormData()
            formData.append('file', file)
            return apiFetch<{ content_id: string; filename: string; mime_type: string }>('/content/upload', {
                method: 'POST',
                body: formData,
            })
        },

        get: (id: string) => apiFetch<any>(`/content/${id}`),

        supportedFormats: () => apiFetch<{ formats: string[] }>('/content/supported-formats'),
    },

    // Summaries
    summaries: {
        generate: (data: GenerateSummaryPayload) =>
            apiFetch<{ summary_id: string; job_id: string }>('/summaries/generate', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        list: (params?: Record<string, string>) => {
            const qs = params ? '?' + new URLSearchParams(params).toString() : ''
            return apiFetch<{ summaries: SummaryListItemResponse[]; total: number }>(`/summaries${qs}`)
        },

        get: (id: string) => apiFetch<SummaryDetailResponse>(`/summaries/${id}`),

        update: (id: string, data: { title?: string; tags?: string[] }) =>
            apiFetch(`/summaries/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            }),

        delete: (id: string) =>
            apiFetch(`/summaries/${id}`, { method: 'DELETE' }),

        toggleFavorite: (id: string) =>
            apiFetch(`/summaries/${id}/favorite`, { method: 'PUT' }),

        regenerate: (id: string, data?: Partial<GenerateSummaryPayload>) =>
            apiFetch<{ job_id: string; summary_id: string }>(`/summaries/${id}/regenerate`, {
                method: 'POST',
                body: JSON.stringify(data || {}),
            }),
    },

    // Quizzes
    quizzes: {
        generate: (data: any) =>
            apiFetch<{ quiz_id: string; job_id: string }>('/quizzes/generate', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        list: () => apiFetch<{ quizzes: any[] }>('/quizzes'),

        get: (id: string) => apiFetch<any>(`/quizzes/${id}`),

        startAttempt: (quizId: string) =>
            apiFetch<{ attempt?: any; attempt_id?: string; started_at?: string }>(`/quizzes/${quizId}/start`, { method: 'POST' }),

        saveProgress: (attemptId: string, data: any) =>
            apiFetch(`/quiz-attempts/${attemptId}/save-progress`, {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        submitAttempt: (attemptId: string) =>
            apiFetch<{ attempt?: any; attempt_id?: string; score_percent?: number; correct_count?: number; total?: number }>(`/quiz-attempts/${attemptId}/submit`, {
                method: 'POST',
            }),

        getAttempt: (attemptId: string) =>
            apiFetch<any>(`/quiz-attempts/${attemptId}`),
    },

    // Flashcards
    flashcards: {
        generate: (data: any) =>
            apiFetch<{ deck_id?: string; job_id?: string; deck?: any; job?: any }>('/flashcards/generate', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        listDecks: () => apiFetch<{ decks: any[] }>('/flashcards/decks'),

        getDeck: (id: string) => apiFetch<any>(`/flashcards/decks/${id}`),

        getDeckStats: (id: string) => apiFetch<any>(`/flashcards/decks/${id}/stats`),

        rateCard: (cardId: string, rating: number) =>
            apiFetch(`/flashcards/cards/${cardId}/rating`, {
                method: 'POST',
                body: JSON.stringify({ rating }),
            }),
    },

    // Dashboard
    dashboard: {
        stats: () => apiFetch<DashboardStatsResponse>('/dashboard/stats'),
        setWeeklyGoal: (target: number, goalType: DashboardGoalType) =>
            apiFetch<{ weekly_goal_target: number; weekly_goal_type: DashboardGoalType }>('/dashboard/weekly-goal', {
                method: 'PUT',
                body: JSON.stringify({ target, goal_type: goalType }),
            }),
        recent: () => apiFetch<DashboardRecentResponse>('/dashboard/recent'),
        streak: () => apiFetch<DashboardStreakResponse>('/dashboard/streak'),
        activity: () => apiFetch<DashboardActivityResponse>('/dashboard/activity'),
    },

    // Study Sessions
    studySessions: {
        start: (activityType: 'summary' | 'quiz' | 'flashcard', resourceId: string, clientMeta?: Record<string, any>) =>
            apiFetch<{ session: { id: string } }>('/study-sessions/start', {
                method: 'POST',
                body: JSON.stringify({
                    activity_type: activityType,
                    resource_id: resourceId,
                    client_meta: clientMeta || {},
                }),
            }),
        heartbeat: (sessionId: string) =>
            apiFetch<{ message: string }>(`/study-sessions/${sessionId}/heartbeat`, {
                method: 'POST',
            }),
        stop: (sessionId: string) =>
            apiFetch<{ message: string }>(`/study-sessions/${sessionId}/stop`, {
                method: 'POST',
            }),
    },

    // Library
    library: {
        list: (params?: Record<string, string>) => {
            const qs = params ? '?' + new URLSearchParams(params).toString() : ''
            return apiFetch<{ items: any[]; total: number }>(`/library${qs}`)
        },
    },

    // User & Settings
    user: {
        getMe: () => apiFetch<any>('/user/me'),
        updateMe: (data: any) =>
            apiFetch('/user/me', { method: 'PUT', body: JSON.stringify(data) }),
        changePassword: (data: { current_password: string; new_password: string }) =>
            apiFetch('/user/password', { method: 'PUT', body: JSON.stringify(data) }),
        deleteMe: () => apiFetch('/user/me', { method: 'DELETE' }),
        getSettings: () => apiFetch<any>('/user/settings'),
        updateSettings: (data: any) =>
            apiFetch('/user/settings', { method: 'PUT', body: JSON.stringify(data) }),
    },

    // Jobs
    jobs: {
        get: (id: string) => apiFetch<any>(`/jobs/${id}`),
        cancel: (id: string) => apiFetch(`/jobs/${id}`, { method: 'DELETE' }),
    },
}
