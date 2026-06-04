export type SummaryLengthPreference = 'concise' | 'standard' | 'detailed' | 'comprehensive'
export type SummaryFormatPreference = 'cornell' | 'bullets' | 'paragraph' | 'smart'

export const SUMMARY_LENGTH_STORAGE_KEY = 'default_summary_length'
export const SUMMARY_FORMAT_STORAGE_KEY = 'default_summary_format'

const DEFAULT_SUMMARY_LENGTH: SummaryLengthPreference = 'standard'
const DEFAULT_SUMMARY_FORMAT: SummaryFormatPreference = 'cornell'

const VALID_SUMMARY_LENGTHS: ReadonlySet<SummaryLengthPreference> = new Set([
    'concise',
    'standard',
    'detailed',
    'comprehensive',
])

const VALID_SUMMARY_FORMATS: ReadonlySet<SummaryFormatPreference> = new Set([
    'cornell',
    'bullets',
    'paragraph',
    'smart',
])

export function parseSummaryLengthPreference(value: string | null | undefined): SummaryLengthPreference {
    if (value && VALID_SUMMARY_LENGTHS.has(value as SummaryLengthPreference)) {
        return value as SummaryLengthPreference
    }

    return DEFAULT_SUMMARY_LENGTH
}

export function getStoredSummaryLengthPreference(): SummaryLengthPreference {
    try {
        return parseSummaryLengthPreference(localStorage.getItem(SUMMARY_LENGTH_STORAGE_KEY))
    } catch {
        return DEFAULT_SUMMARY_LENGTH
    }
}

export function parseSummaryFormatPreference(value: string | null | undefined): SummaryFormatPreference {
    if (value && VALID_SUMMARY_FORMATS.has(value as SummaryFormatPreference)) {
        return value as SummaryFormatPreference
    }

    return DEFAULT_SUMMARY_FORMAT
}

export function getStoredSummaryFormatPreference(): SummaryFormatPreference {
    try {
        return parseSummaryFormatPreference(localStorage.getItem(SUMMARY_FORMAT_STORAGE_KEY))
    } catch {
        return DEFAULT_SUMMARY_FORMAT
    }
}

export function saveStoredSummaryFormatPreference(value: SummaryFormatPreference): void {
    try {
        localStorage.setItem(SUMMARY_FORMAT_STORAGE_KEY, value)
    } catch {
        // no-op: storage may be unavailable in restricted environments
    }
}

export function saveStoredSummaryLengthPreference(value: SummaryLengthPreference): void {
    try {
        localStorage.setItem(SUMMARY_LENGTH_STORAGE_KEY, value)
    } catch {
        // no-op: storage may be unavailable in restricted environments
    }
}

export function summaryLengthPreferenceToSliderValue(value: SummaryLengthPreference): number {
    switch (value) {
        case 'concise':
            return 25
        case 'standard':
            return 50
        case 'detailed':
            return 75
        case 'comprehensive':
            return 100
        default:
            return 50
    }
}

export function sliderValueToSummaryLengthPreference(value: number): SummaryLengthPreference {
    if (value <= 25) {
        return 'concise'
    }

    if (value <= 50) {
        return 'standard'
    }

    if (value <= 75) {
        return 'detailed'
    }

    return 'comprehensive'
}

