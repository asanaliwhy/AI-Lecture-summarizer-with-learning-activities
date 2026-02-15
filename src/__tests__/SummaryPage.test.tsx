import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

const mocked = vi.hoisted(() => {
    class MockApiError extends Error {
        status: number
        constructor(status: number, message: string) {
            super(message)
            this.status = status
        }
    }

    return {
        ApiError: MockApiError,
        summariesApi: {
            get: vi.fn(),
            update: vi.fn(),
            regenerate: vi.fn(),
            delete: vi.fn(),
        },
    }
})

vi.mock('../lib/api', () => {
    return {
        ApiError: mocked.ApiError,
        api: {
            summaries: mocked.summariesApi,
        },
    }
})

vi.mock('../lib/useStudySession', () => ({
    useStudySession: vi.fn(),
}))

vi.mock('../components/layout/AppLayout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/ui/Toast', () => ({
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

vi.mock('react-dom', async () => {
    const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
    return { ...actual, createPortal: (node: React.ReactNode) => node }
})

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: 'summary-1' }),
}))

import { SummaryPage } from '../pages/SummaryPage'

describe('SummaryPage error state routing', () => {
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

    it('renders non-404 retry state for network/server failures', async () => {
        mocked.summariesApi.get.mockRejectedValue(new Error('server down'))

        await act(async () => {
            root.render(<SummaryPage />)
        })

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })

        expect(container.textContent).toContain('Failed to load summary')
        expect(container.textContent).toContain('server down')
        expect(container.textContent).toContain('Retry')
    })

    it('renders not found state only for 404 errors', async () => {
        mocked.summariesApi.get.mockRejectedValue(new mocked.ApiError(404, 'not found'))

        await act(async () => {
            root.render(<SummaryPage />)
        })

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })

        expect(container.textContent).toContain('Summary Not Found')
    })
})

