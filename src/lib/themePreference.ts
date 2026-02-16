export type ThemePreference = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme_preference'

const DEFAULT_THEME: ThemePreference = 'light'

export function parseThemePreference(value: string | null | undefined): ThemePreference {
    return value === 'dark' ? 'dark' : DEFAULT_THEME
}

export function getStoredThemePreference(): ThemePreference {
    try {
        return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
    } catch {
        return DEFAULT_THEME
    }
}

export function saveStoredThemePreference(value: ThemePreference): void {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
        // no-op in restricted environments
    }
}

export function applyThemePreference(value: ThemePreference): void {
    if (typeof document === 'undefined') {
        return
    }

    const root = document.documentElement
    root.classList.toggle('dark', value === 'dark')
}

