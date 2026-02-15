import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
    summariesApi: {
        list: vi.fn(),
        toggleFavorite: vi.fn(),
    },
}))

vi.mock('../lib/api', () => {
    class ApiError extends Error {
        status: number
        fields?: Record<string, string>

        constructor(status: number, message: string, fields?: Record<string, string>) {
            super(message)
            this.status = status
            this.fields = fields
        }
    }

    return {
        api: {
            summaries: mocked.summariesApi,
        },
        ApiError,
    }
})

vi.mock('../components/layout/AppLayout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/ui/Toast', () => ({
    useToast: () => mocked.toast,
}))

vi.mock('../components/ui/Button', () => ({
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button type="button" {...props}>{children}</button>
    ),
}))

vi.mock('../components/ui/Input', () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('../components/ui/Card', () => ({
    Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

vi.mock('../components/ui/Badge', () => ({
    Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}))

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocked.navigate,
}))

import { SummariesPage } from '../pages/SummariesPage'

describe('SummariesPage production behaviors', () => {
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

    beforeEach(() => {
        vi.clearAllMocks()

        mocked.summariesApi.list.mockResolvedValue({
            summaries: [
                {
                    id: 'summary-1',
                    title: 'AI Lecture Notes',
                    created_at: new Date().toISOString(),
                    is_favorite: false,
                    format: 'smart',
                    source: 'youtube',
                    word_count: 800,
                    tags: ['AI'],
                },
            ],
            total: 1,
        })
        mocked.summariesApi.toggleFavorite.mockResolvedValue({})

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

    it('renders summaries list and keeps keyboard-accessible summary cards', async () => {
        await act(async () => {
            root.render(<SummariesPage />)
        })
        await flush()

        expect(container.textContent).toContain('AI Lecture Notes')

        const titleNode = Array.from(container.querySelectorAll('h3')).find((el) =>
            (el.textContent || '').includes('AI Lecture Notes'),
        )
        expect(titleNode).toBeTruthy()

        const card = titleNode!.closest('[role="button"]') as HTMLElement | null
        expect(card).toBeTruthy()
        expect(card?.getAttribute('tabindex')).toBe('0')
    })

    it('shows load error and retries in-page via refetch', async () => {
        mocked.summariesApi.list
            .mockRejectedValueOnce(new Error('summaries service unavailable'))
            .mockResolvedValueOnce({
                summaries: [
                    {
                        id: 'summary-2',
                        title: 'Physics Summary',
                        created_at: new Date().toISOString(),
                        is_favorite: false,
                        format: 'bullets',
                        source: 'document',
                        word_count: 500,
                        tags: [],
                    },
                ],
                total: 1,
            })

        await act(async () => {
            root.render(<SummariesPage />)
        })
        await flush()

        expect(container.textContent).toContain('Failed to load summaries')
        expect(container.textContent).toContain('summaries service unavailable')

        clickButton('Retry')
        await flush()

        expect(mocked.summariesApi.list).toHaveBeenCalledTimes(2)
        expect(container.textContent).toContain('Physics Summary')
    })
})

