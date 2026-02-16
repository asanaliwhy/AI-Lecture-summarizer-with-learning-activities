export type SummaryLengthPreference = 'concise' | 'standard' | 'detailed' | 'comprehensive'

export const SUMMARY_LENGTH_STORAGE_KEY = 'default_summary_length'

const DEFAULT_SUMMARY_LENGTH: SummaryLengthPreference = 'standard'

const VALID_SUMMARY_LENGTHS: ReadonlySet<SummaryLengthPreference> = new Set([
    'concise',
    'standard',
    'detailed',
    'comprehensive',
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

