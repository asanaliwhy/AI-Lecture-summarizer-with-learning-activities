import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
    quizzesApi: {
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
            quizzes: mocked.quizzesApi,
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

import { QuizzesPage } from '../pages/QuizzesPage'

describe('QuizzesPage production behaviors', () => {
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

        mocked.quizzesApi.list.mockResolvedValue({
            quizzes: [
                {
                    id: 'quiz-1',
                    title: 'Biology Quiz',
                    source_summary: 'Cell Structure',
                    created_at: new Date().toISOString(),
                    question_count: 10,
                    difficulty: 'easy',
                    is_favorite: false,
                    last_score: 85,
                    last_attempt_id: 'attempt-1',
                },
            ],
        })
        mocked.quizzesApi.toggleFavorite.mockResolvedValue({})

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

    it('renders quizzes and supports keyboard access on quiz cards', async () => {
        await act(async () => {
            root.render(<QuizzesPage />)
        })
        await flush()

        expect(container.textContent).toContain('Biology Quiz')

        const quizTitle = Array.from(container.querySelectorAll('h3')).find((el) =>
            (el.textContent || '').includes('Biology Quiz'),
        )
        expect(quizTitle).toBeTruthy()

        const card = quizTitle!.closest('[role="button"]') as HTMLElement | null
        expect(card).toBeTruthy()
        expect(card?.getAttribute('tabindex')).toBe('0')

        act(() => {
            card!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        })

        expect(mocked.navigate).toHaveBeenCalledWith('/quiz/results/attempt-1')
    })

    it('shows load error and retries in-page via refetch', async () => {
        mocked.quizzesApi.list
            .mockRejectedValueOnce(new Error('quiz service unavailable'))
            .mockResolvedValueOnce({
                quizzes: [
                    {
                        id: 'quiz-2',
                        title: 'Chemistry Quiz',
                        created_at: new Date().toISOString(),
                        question_count: 8,
                        difficulty: 'medium',
                        is_favorite: false,
                    },
                ],
            })

        await act(async () => {
            root.render(<QuizzesPage />)
        })
        await flush()

        expect(container.textContent).toContain('Failed to load quizzes')
        expect(container.textContent).toContain('quiz service unavailable')

        clickButton('Retry')
        await flush()

        expect(mocked.quizzesApi.list).toHaveBeenCalledTimes(2)
        expect(container.textContent).toContain('Chemistry Quiz')
    })
})

