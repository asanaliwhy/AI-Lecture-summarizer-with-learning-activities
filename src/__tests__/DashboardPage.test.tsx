import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

const mocked = vi.hoisted(() => ({
    dashboardApi: {
        stats: vi.fn(),
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
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

vi.mock('react-router-dom', () => ({
    Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useNavigate: () => vi.fn(),
}))

import { DashboardPage } from '../pages/DashboardPage'

describe('DashboardPage error rendering', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        vi.clearAllMocks()
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

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })

        expect(container.textContent).toContain('Failed to load dashboard')
        expect(container.textContent).toContain('dashboard unavailable')
        expect(container.textContent).toContain('Retry')
    })
})

