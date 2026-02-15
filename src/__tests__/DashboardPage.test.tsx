import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
    dashboardApi: {
        stats: vi.fn(),
        setWeeklyGoal: vi.fn(),
        recent: vi.fn(),
        streak: vi.fn(),
        activity: vi.fn(),
    },
}))

vi.mock('../lib/api', () => {
    return {
        api: {
            dashboard: mocked.dashboardApi,
        },
    }
})

vi.mock('../lib/AuthContext', () => ({
    useAuth: () => ({ user: { full_name: 'Test User' } }),
}))

vi.mock('../components/layout/AppLayout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/ui/Toast', () => ({
    useToast: () => mocked.toast,
}))

vi.mock('react-router-dom', () => ({
    Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to}>{children}</a>,
    useNavigate: () => mocked.navigate,
}))

import { DashboardPage } from '../pages/DashboardPage'

describe('DashboardPage production behaviors', () => {
    let container: HTMLDivElement
    let root: Root

    const flush = async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    const clickButton = (text: string) => {
        const target = Array.from(document.body.querySelectorAll('button')).find((btn) =>
            (btn.textContent || '').includes(text),
        )
        expect(target).toBeTruthy()
        act(() => {
            target!.click()
        })
    }

    const setInputValue = (input: HTMLInputElement, value: string) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set

        act(() => {
            nativeSetter?.call(input, value)
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
        })
    }

    const mockDashboardSuccess = () => {
        mocked.dashboardApi.stats.mockResolvedValue({
            summaries: 6,
            quizzes_taken: 4,
            flashcard_decks: 3,
            study_hours: 7.5,
            summaries_trend: 12,
            quizzes_trend: 8,
            flashcards_trend: 3,
            study_hours_trend: 15,
            weekly_goal_target: 5,
            weekly_goal_type: 'summary',
            weekly_summaries: 2,
            weekly_quizzes: 1,
            weekly_flashcards: 0,
        })
        mocked.dashboardApi.recent.mockResolvedValue({
            recent: [
                {
                    id: 'summary-1',
                    type: 'summary',
                    title: 'Neural Networks Intro',
                    created_at: new Date().toISOString(),
                    progress: 40,
                },
            ],
        })
        mocked.dashboardApi.streak.mockResolvedValue({ current_streak: 3 })
        mocked.dashboardApi.activity.mockResolvedValue({ activity: [0, 1, 2, 3, 2, 1, 0] })
    }

    beforeEach(() => {
        vi.clearAllMocks()

        mockDashboardSuccess()
        mocked.dashboardApi.setWeeklyGoal.mockResolvedValue({
            weekly_goal_target: 8,
            weekly_goal_type: 'summary',
        })

        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => {
            root.unmount()
        })
        container.remove()
    })

    it('renders explicit error state and retry on failed load', async () => {
        mocked.dashboardApi.stats.mockRejectedValue(new Error('dashboard unavailable'))
        mocked.dashboardApi.recent.mockResolvedValue({ recent: [] })
        mocked.dashboardApi.streak.mockResolvedValue({ current_streak: 0 })
        mocked.dashboardApi.activity.mockResolvedValue({ activity: [] })

        await act(async () => {
            root.render(<DashboardPage />)
        })
        await flush()

        expect(container.textContent).toContain('Failed to load dashboard')
        expect(container.textContent).toContain('dashboard unavailable')
        expect(container.textContent).toContain('Retry')
    })

    it('renders happy-path dashboard cards and recent content', async () => {
        await act(async () => {
            root.render(<DashboardPage />)
        })
        await flush()

        expect(container.textContent).toContain('Total Summaries')
        expect(container.textContent).toContain('Quizzes Taken')
        expect(container.textContent).toContain('Flashcard Decks')
        expect(container.textContent).toContain('Study Hours')
        expect(container.textContent).toContain('Neural Networks Intro')
        expect(container.textContent).toContain('3 Day Streak')
    })

    it('saves weekly goal successfully and updates visible progress target', async () => {
        await act(async () => {
            root.render(<DashboardPage />)
        })
        await flush()

        clickButton('Set Goal')
        await flush()

        const numberInputs = Array.from(document.body.querySelectorAll('input[type="number"]')) as HTMLInputElement[]
        expect(numberInputs.length).toBeGreaterThan(0)

        setInputValue(numberInputs[0], '8')
        await flush()

        clickButton('Save Goal')
        await flush()

        expect(mocked.dashboardApi.setWeeklyGoal).toHaveBeenCalledWith(8, 'summary')
        expect(mocked.toast.success).toHaveBeenCalledWith('Weekly goal updated')
        expect(container.textContent).toContain('2/8')
    })

    it('shows goal save error toast when weekly goal update fails', async () => {
        mocked.dashboardApi.setWeeklyGoal.mockRejectedValueOnce(new Error('cannot save goal'))

        await act(async () => {
            root.render(<DashboardPage />)
        })
        await flush()

        clickButton('Set Goal')
        await flush()

        const numberInputs = Array.from(document.body.querySelectorAll('input[type="number"]')) as HTMLInputElement[]
        expect(numberInputs.length).toBeGreaterThan(0)
        setInputValue(numberInputs[0], '9')
        await flush()

        clickButton('Save Goal')
        await flush()

        expect(mocked.dashboardApi.setWeeklyGoal).toHaveBeenCalledWith(9, 'summary')
        expect(mocked.toast.error).toHaveBeenCalledWith('cannot save goal')
    })
})

