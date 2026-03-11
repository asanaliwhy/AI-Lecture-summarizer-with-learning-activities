import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

    ; (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    params: { jobId: 'job-123' as string | undefined },
    jobsApi: {
        get: vi.fn(),
        cancel: vi.fn(),
    },
    wsOptions: null as any,
}))

vi.mock('../lib/api', () => ({
    ApiError: class ApiError extends Error {
        status: number
        constructor(status: number, message: string) {
            super(message)
            this.status = status
        }
    },
    api: {
        jobs: mocked.jobsApi,
    },
}))

vi.mock('../components/layout/AppLayout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocked.navigate,
    useParams: () => mocked.params,
}))

vi.mock('../lib/useWebSocket', () => ({
    useWebSocket: (options: any) => {
        mocked.wsOptions = options
        return { isConnected: true }
    },
}))

import { ProcessingPage } from '../pages/ProcessingPage'

describe('ProcessingPage runtime flows', () => {
    let container: HTMLDivElement
    let root: Root

    const flush = async () => {
        await act(async () => {
            await Promise.resolve()
            await Promise.resolve()
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()

        mocked.params.jobId = 'job-123'
        mocked.jobsApi.get.mockResolvedValue({
            id: 'job-123',
            type: 'summary-generation',
            status: 'processing',
        })
        mocked.jobsApi.cancel.mockResolvedValue({})

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

    it('renders processing state and handles cancel action', async () => {
        act(() => {
            root.render(<ProcessingPage />)
        })
        await flush()

        expect(container.textContent).toContain('Processing Your Content')
        expect(mocked.jobsApi.get).toHaveBeenCalledWith('job-123')

        const cancel = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes('Cancel Processing'),
        )
        expect(cancel).toBeTruthy()

        act(() => {
            cancel!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
            cancel!.click()
        })

        expect(mocked.jobsApi.cancel).toHaveBeenCalledWith('job-123')
        expect(mocked.navigate).toHaveBeenCalledWith('/create')
    })

    it('handles websocket completion and redirects to summary result', async () => {
        vi.useFakeTimers()

        act(() => {
            root.render(<ProcessingPage />)
        })
        await flush()

        expect(mocked.wsOptions?.onCompleted).toBeTypeOf('function')

        act(() => {
            mocked.wsOptions.onCompleted({
                job_id: 'job-123',
                result_type: 'summary',
                result_id: 'summary-777',
            })
        })

        act(() => {
            vi.advanceTimersByTime(1500)
        })

        expect(mocked.navigate).toHaveBeenCalledWith('/summary/summary-777', { replace: true })

        vi.useRealTimers()
    })

    it('shows error state and supports retry/dashboard actions', async () => {
        act(() => {
            root.render(<ProcessingPage />)
        })
        await flush()

        act(() => {
            mocked.wsOptions.onError({
                job_id: 'job-123',
                error_message: 'generation failed',
            })
        })
        await flush()

        expect(container.textContent).toContain('Processing Failed')
        expect(container.textContent).toContain('generation failed')

        const tryAgain = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes('Try Again'),
        )
        const dashboard = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes('Go to Dashboard'),
        )
        expect(tryAgain).toBeTruthy()
        expect(dashboard).toBeTruthy()

        act(() => {
            tryAgain!.click()
        })
        expect(mocked.navigate).toHaveBeenCalledWith('/create')

        act(() => {
            dashboard!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
            dashboard!.click()
        })
        expect(mocked.navigate).toHaveBeenCalledWith('/dashboard')
    })
})

