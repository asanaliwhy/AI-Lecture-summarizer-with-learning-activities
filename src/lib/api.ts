import type { GeneratePresentationConfig, Presentation, PresentationStatus, Slide, SlideTheme } from './presentationTypes'
import { normalizePresentation } from './presentationTypes'

const DEFAULT_API_BASE = 'http://localhost:8081/api/v1'

function getProductionFallbackApiBase(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin.replace(/\/+$/, '')}/api/v1`
    }

    return DEFAULT_API_BASE
}

function normalizeApiBase(raw: string | undefined): string {
    const value = (raw || '').trim()
    if (!value) {
        if (import.meta.env.PROD) {
            const fallback = getProductionFallbackApiBase()
            console.warn('VITE_API_BASE_URL is missing in production, falling back to', fallback)
            return fallback
        }
        return DEFAULT_API_BASE
    }

    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`

    try {
        const url = new URL(withProtocol)
        const pathname = url.pathname.replace(/\/+$/, '')
        const normalizedPath = pathname.endsWith('/api/v1')
            ? pathname
            : `${pathname}/api/v1`.replace(/\/+/g, '/').replace(/\/$/, '')

        return `${url.protocol}//${url.host}${normalizedPath}`
    } catch {
        if (import.meta.env.PROD) {
            const fallback = getProductionFallbackApiBase()
            console.warn('VITE_API_BASE_URL is invalid in production, falling back to', fallback)
            return fallback
        }
        return DEFAULT_API_BASE
    }
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL)

// ─── Token Management ───
function getAccessToken(): string | null {
    return localStorage.getItem('access_token')
}

// Security tradeoff: access token remains in localStorage for bearer header usage.
// It is short-lived (15 minutes). Refresh token is no longer accessible to JS
// and is stored in an HttpOnly cookie scoped to /api/v1/auth/refresh.
export function setTokens(access: string) {
    localStorage.setItem('access_token', access)
    // Cleanup legacy storage from pre-cookie refresh-token implementation.
    localStorage.removeItem('refresh_token')
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
        credentials: 'include',
    })

    // Try refresh on 401
    if (res.status === 401) {
        if (path.includes('/user/password') || path.includes('/auth/login')) {
            const err = await res.json().catch(() => ({}))
            throw new ApiError(res.status, err?.error?.message || 'Unauthorized', err?.error?.fields)
        }

        const refreshed = await tryRefreshOnce()
        if (refreshed) {
            const refreshedToken = getAccessToken()
            if (refreshedToken) {
                headers['Authorization'] = `Bearer ${refreshedToken}`
            } else {
                delete headers['Authorization']
            }
            const retry = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
            if (!retry.ok) {
                const err = await retry.json().catch(() => ({}))
                if (retry.status === 401) {
                    clearTokens()
                    window.location.href = '/login'
                    throw new ApiError(401, 'Session expired')
                }
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
    try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({}),
        })

        if (!res.ok) return false

        const data = await res.json()
        setTokens(data.access_token)
        return true
    } catch {
        return false
    }
}

let refreshPromise: Promise<boolean> | null = null

export async function tryRefreshOnce(): Promise<boolean> {
    if (refreshPromise) {
        return refreshPromise
    }

    refreshPromise = tryRefresh().finally(() => {
        refreshPromise = null
    })

    return refreshPromise
}

export async function refreshAccessToken(): Promise<string | null> {
    const ok = await tryRefreshOnce()
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

export type DashboardGoalType = 'summary' | 'quiz' | 'flashcard' | 'presentation'

export interface DashboardStatsResponse {
    summaries?: number
    quizzes_taken?: number
    flashcard_decks?: number
    presentations?: number
    study_hours?: number
    summaries_trend?: number
    quizzes_trend?: number
    flashcards_trend?: number
    presentations_trend?: number
    study_hours_trend?: number
    weekly_goal_target?: number
    weekly_goal_type?: DashboardGoalType
    weekly_summaries?: number
    weekly_quizzes?: number
    weekly_flashcards?: number
    weekly_presentations?: number
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
    estimated?: boolean
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
    format?: 'cornell' | 'bullets' | 'paragraph' | 'smart' | string
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
    is_quality_fallback?: boolean
    quality_fallback_reason?: string
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
    is_quality_fallback?: boolean
    quality_fallback_reason?: string
    follow_up_questions?: string[]
}

export interface ChatHistoryMessageResponse {
    id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
}

export interface GenerateSummaryPayload {
    content_id: string
    format: string
    length: string
    focus_areas: string[]
    target_audience: string
    language: string
    extract_screen_text: boolean
}

export interface PresentationSlideResponse extends Omit<Slide, 'id' | 'type'> {
    id?: string
    type?: Slide['type'] | string
}

export interface PresentationResponse {
    id: string
    content_id?: string | null
    title?: string
    topic?: string | null
    language?: string
    theme?: SlideTheme | string
    slide_count?: number
    slides?: PresentationSlideResponse[]
    status?: PresentationStatus
    is_favorite?: boolean
    quality_fallback?: boolean
    created_at?: string
    updated_at?: string
    last_accessed_at?: string | null
}

export interface PresentationListResponse {
    presentations: PresentationResponse[]
    total?: number
    limit?: number
    offset?: number
}

export const presentationQueryKeys = {
    all: ['presentations'] as const,
    detail: (id: string) => ['presentation', id] as const,
}

function toPresentation(raw: PresentationResponse): Presentation {
    return normalizePresentation({
        id: raw.id,
        contentId: raw.content_id ?? null,
        title: raw.title || 'Untitled Presentation',
        topic: raw.topic ?? null,
        language: raw.language || 'en',
        theme: (raw.theme as SlideTheme) || 'navy',
        slideCount: Number(raw.slide_count || 0),
        slides: Array.isArray(raw.slides) ? raw.slides.map((slide, index) => ({
            ...slide,
            id: slide.id || `slide-${index + 1}`,
            type: (slide.type as Slide['type']) || 'content',
        })) : [],
        status: raw.status || 'completed',
        isFavorite: Boolean(raw.is_favorite),
        qualityFallback: Boolean(raw.quality_fallback),
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
        lastAccessedAt: raw.last_accessed_at ?? null,
    })
}

export interface QuizQuestionResponse {
    question?: string
    type?: string
    options?: string[]
    correct_index?: number
    explanation?: string
    hint?: string
    difficulty?: 'easy' | 'medium' | 'hard' | string
    topic?: string
}

export interface QuizListItemResponse {
    id: string
    summary_id?: string | null
    title?: string
    config?: Record<string, unknown> | string
    questions?: QuizQuestionResponse[] | string
    question_count?: number
    difficulty?: 'easy' | 'medium' | 'hard' | string | number
    is_favorite?: boolean
    source_summary?: string
    created_at?: string
    last_score?: number | null
    last_attempt_id?: string | null
}

export interface GenerateQuizPayload {
    summary_id: string
    title: string
    num_questions: number
    difficulty: 'easy' | 'medium' | 'hard'
    question_types: string[]
    enable_timer: boolean
    shuffle_questions: boolean
    enable_hints: boolean
    topics: string[]
    extract_screen_text: boolean
}

export interface FlashcardDeckListItemResponse {
    id: string
    user_id?: string
    summary_id?: string | null
    title?: string
    config?: Record<string, unknown> | string
    card_count?: number
    is_favorite?: boolean
    created_at?: string
}

export type LibraryItemType = 'summary' | 'quiz' | 'flashcard' | 'flashcards' | 'presentation' | 'presentations' | string

export interface LibraryItemResponse {
    id: string
    type: LibraryItemType
    title?: string
    tags?: string[]
    is_favorite?: boolean
    created_at?: string
}

export interface LibraryListResponse {
    items: LibraryItemResponse[]
    total?: number
}

export interface UserProfileResponse {
    id: string
    email: string
    full_name: string
    avatar_url?: string
    bio?: string | null
    is_verified: boolean
    is_active: boolean
    plan: string
    created_at?: string
    last_login_at?: string | null
}

export interface UserMeResponse extends UserProfileResponse {
    user?: UserProfileResponse
}

export interface UpdateMePayload {
    full_name?: string
    email?: string
    avatar_url?: string
    bio?: string
}

export interface NotificationPreferencesResponse {
    processing_complete: boolean
    weekly_digest: boolean
    study_reminders: boolean
}

export interface UpdateNotificationPreferencePayload {
    key: 'processing_complete' | 'weekly_digest' | 'study_reminders'
    enabled: boolean
}

export interface GenerateFlashcardsPayload {
    summary_id: string
    title: string
    num_cards: number
    strategy: 'term_definition' | 'question_answer'
    topics: string[]
    enable_spaced_repetition: boolean
    include_mnemonics: boolean
    include_examples: boolean
    extract_screen_text: boolean
}

export interface YouTubeValidationMetadata extends Record<string, unknown> {
    video_id?: string
    title?: string
    channel_name?: string
    thumbnail_url?: string
    duration_seconds?: number
    word_count?: number
}

export interface ValidateYouTubeResponse {
    valid: boolean
    metadata: YouTubeValidationMetadata
    content_id: string
    video_id?: string
}

export interface ContentResponse {
    id: string
    user_id?: string
    type?: string
    status?: string
    source_url?: string | null
    file_path?: string | null
    title?: string
    duration_seconds?: number | null
    transcript?: string | null
    metadata?: Record<string, unknown> | null
    created_at?: string
}

export interface QuizDetailResponse extends QuizListItemResponse {
    questions?: QuizQuestionResponse[] | string
}

export interface QuizAttemptDataResponse {
    id?: string
    quiz_id?: string
    user_id?: string
    answers?: unknown
    answers_json?: unknown
    score_percent?: number
    correct_count?: number
    started_at?: string
    completed_at?: string | null
    time_taken_seconds?: number | null
}

export interface QuizAttemptEnvelopeResponse {
    attempt?: QuizAttemptDataResponse
    attempt_id?: string
    started_at?: string
    score_percent?: number
    correct_count?: number
    total?: number
}

export interface QuizAttemptDetailsResponse extends QuizAttemptDataResponse {
    quiz?: QuizDetailResponse
    questions?: QuizQuestionResponse[] | unknown[] | string
    review?: unknown[]
    title?: string
    question_count?: number
    last_attempt_id?: string | null
}

export interface QuizSaveProgressPayload {
    question_index: number
    answer_index: number
}

export interface FlashcardDeckStatsResponse {
    total_cards?: number
    mastered?: number
    learning?: number
    new?: number
    due_today?: number
    mastery_rate?: number
}

export interface UserSettingsResponse {
    user_id?: string
    default_summary_length?: string
    default_format?: string
    default_difficulty?: string
    language?: string
    notifications?: Record<string, unknown>
    notifications_json?: Record<string, unknown>
    updated_at?: string
}

export type UpdateUserSettingsPayload = Partial<Pick<
    UserSettingsResponse,
    'default_summary_length' | 'default_format' | 'default_difficulty' | 'language'
>> & {
    notifications?: Record<string, unknown>
    notifications_json?: Record<string, unknown>
}

export interface JobResponse {
    id: string
    user_id?: string
    type?: string
    reference_id?: string
    config?: Record<string, unknown> | string
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | string
    retry_count?: number
    max_retries?: number
    error_message?: string | null
    created_at?: string
    completed_at?: string | null
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
            apiFetch<{ access_token: string; expires_in: number }>('/auth/login', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        logout: () =>
            apiFetch('/auth/logout', {
                method: 'POST',
                body: JSON.stringify({}),
            }),

        verifyEmail: (token: string) =>
            apiFetch<{ access_token: string; expires_in: number }>(`/auth/verify-email?token=${token}`),

        resendVerification: (email: string) =>
            apiFetch('/auth/resend-verification', {
                method: 'POST',
                body: JSON.stringify({ email }),
            }),

        googleLogin: (idToken: string) =>
            apiFetch<{ access_token: string; expires_in: number }>('/auth/google', {
                method: 'POST',
                body: JSON.stringify({ id_token: idToken }),
            }),

        googleCodeLogin: (code: string) =>
            apiFetch<{ access_token: string; expires_in: number }>('/auth/google/code', {
                method: 'POST',
                body: JSON.stringify({ code }),
            }),
    },

    ws: {
        getTicket: () => apiFetch<{ ticket: string }>('/ws/ticket'),
    },

    // Content
    content: {
        validateYouTube: (url: string) =>
            apiFetch<ValidateYouTubeResponse>('/content/validate-youtube', {
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

        get: (id: string) => apiFetch<ContentResponse>(`/content/${id}`),

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

        chat: (id: string, message: string, history: { role: string; content: string }[]) =>
            apiFetch<{ reply: string; screen_ocr_hint?: string | null }>(`/summaries/${id}/chat`, {
                method: 'POST',
                body: JSON.stringify({ message, history }),
            }),

        getChatHistory: (id: string) =>
            apiFetch<ChatHistoryMessageResponse[]>(`/summaries/${id}/chat-history`),

        createChatHistory: (id: string, data: { role: 'user' | 'assistant'; content: string }) =>
            apiFetch<ChatHistoryMessageResponse>(`/summaries/${id}/chat-history`, {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        clearChatHistory: (id: string) =>
            apiFetch<{ message: string }>(`/summaries/${id}/chat-history`, {
                method: 'DELETE',
            }),

        // PDF export is canonical client-side in SummaryPage.tsx via jsPDF.
        // Backend /summaries/{id}/export has been deprecated to avoid dual-path drift.
    },

    presentations: {
        create: (data: GeneratePresentationConfig) =>
            apiFetch<{ presentation_id: string; job_id: string }>('/presentations', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        get: async (id: string) => toPresentation(await apiFetch<PresentationResponse>(`/presentations/${id}`)),

        list: async (params?: Record<string, string>) => {
            const qs = params ? '?' + new URLSearchParams(params).toString() : ''
            const response = await apiFetch<PresentationListResponse>(`/presentations${qs}`)
            return {
                ...response,
                presentations: Array.isArray(response.presentations)
                    ? response.presentations.map(toPresentation)
                    : [],
            }
        },

        delete: (id: string) =>
            apiFetch<{ message: string }>(`/presentations/${id}`, { method: 'DELETE' }),

        toggleFavorite: (id: string) =>
            apiFetch<{ message: string }>(`/presentations/${id}/favorite`, { method: 'PUT' }),

        updateSlides: (id: string, slides: Slide[]) =>
            apiFetch<{ message: string }>(`/presentations/${id}/slides`, {
                method: 'PUT',
                body: JSON.stringify({ slides }),
            }),
    },

    // Quizzes
    quizzes: {
        generate: (data: GenerateQuizPayload) =>
            apiFetch<{ quiz_id: string; job_id: string }>('/quizzes/generate', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        list: () => apiFetch<{ quizzes: QuizListItemResponse[] }>('/quizzes'),

        toggleFavorite: (id: string) =>
            apiFetch<{ message: string }>(`/quizzes/${id}/favorite`, { method: 'PUT' }),

        get: (id: string) => apiFetch<QuizDetailResponse>(`/quizzes/${id}`),

        delete: (id: string) =>
            apiFetch<{ message: string }>(`/quizzes/${id}`, { method: 'DELETE' }),

        startAttempt: (quizId: string) =>
            apiFetch<QuizAttemptEnvelopeResponse>(`/quizzes/${quizId}/start`, { method: 'POST' }),

        saveProgress: (attemptId: string, data: QuizSaveProgressPayload) =>
            apiFetch<{ message?: string }>(`/quiz-attempts/${attemptId}/save-progress`, {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        submitAttempt: (attemptId: string) =>
            apiFetch<QuizAttemptEnvelopeResponse>(`/quiz-attempts/${attemptId}/submit`, {
                method: 'POST',
            }),

        getAttempt: (attemptId: string) =>
            apiFetch<QuizAttemptDetailsResponse>(`/quiz-attempts/${attemptId}`),
    },

    // Flashcards
    flashcards: {
        generate: (data: GenerateFlashcardsPayload) =>
            apiFetch<{ deck_id?: string; job_id?: string; deck?: { id?: string }; job?: { id?: string } }>('/flashcards/generate', {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        listDecks: () => apiFetch<{ decks: FlashcardDeckListItemResponse[] }>('/flashcards/decks'),

        getDeck: (id: string) => apiFetch<{ deck?: FlashcardDeckListItemResponse; cards?: unknown[] }>(`/flashcards/decks/${id}`),

        getDeckStats: (id: string) => apiFetch<FlashcardDeckStatsResponse>(`/flashcards/decks/${id}/stats`),

        toggleFavorite: (id: string) =>
            apiFetch<{ message: string }>(`/flashcards/decks/${id}/favorite`, { method: 'PUT' }),

        deleteDeck: (id: string) =>
            apiFetch<{ message: string }>(`/flashcards/decks/${id}`, { method: 'DELETE' }),

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
        start: (activityType: 'summary' | 'quiz' | 'flashcard', resourceId: string, clientMeta?: Record<string, unknown>) =>
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
            return apiFetch<LibraryListResponse>(`/library${qs}`)
        },
    },

    // User & Settings
    user: {
        getMe: () => apiFetch<UserMeResponse>('/user/me'),
        updateMe: (data: UpdateMePayload) =>
            apiFetch<UserProfileResponse>('/user/me', { method: 'PUT', body: JSON.stringify(data) }),
        changePassword: (data: { current_password: string; new_password: string }) =>
            apiFetch('/user/password', { method: 'PUT', body: JSON.stringify(data) }),
        deleteMe: () => apiFetch('/user/me', { method: 'DELETE' }),
        getSettings: () => apiFetch<UserSettingsResponse>('/user/settings'),
        updateSettings: (data: UpdateUserSettingsPayload) =>
            apiFetch<UserSettingsResponse>('/user/settings', { method: 'PUT', body: JSON.stringify(data) }),
        getNotifications: () => apiFetch<NotificationPreferencesResponse>('/user/notifications'),
        updateNotification: (data: UpdateNotificationPreferencePayload) =>
            apiFetch<{ key: string; enabled: boolean }>('/user/notifications', {
                method: 'PUT',
                body: JSON.stringify(data),
            }),
    },

    // Jobs
    jobs: {
        get: (id: string) => apiFetch<JobResponse>(`/jobs/${id}`),
        cancel: (id: string) => apiFetch(`/jobs/${id}`, { method: 'DELETE' }),
    },
}
