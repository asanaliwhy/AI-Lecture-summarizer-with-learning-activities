import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    params: { attemptId: 'attempt-1' as string | undefined },
    quizzesApi: {
        getAttempt: vi.fn(),
        get: vi.fn(),
    },
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

vi.mock('../lib/api', () => ({
    api: {
        quizzes: mocked.quizzesApi,
    },
}))

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

vi.mock('../components/ui/Card', () => ({
    Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

vi.mock('../components/ui/Badge', () => ({
    Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}))

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocked.navigate,
    useParams: () => mocked.params,
}))

import { QuizResultsPage } from '../pages/QuizResultsPage'

describe('QuizResultsPage production behaviors', () => {
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

    const makeAttemptPayload = () => ({
        attempt: {
            score_percent: 80,
            correct_count: 4,
            total_questions: 5,
            quiz_id: 'quiz-9',
            summary_id: 'summary-9',
            time_taken_seconds: 120,
            answers: [{ question_index: 0, answer_index: 1 }],
        },
        quiz: {
            id: 'quiz-9',
            title: 'Physics Quiz',
            question_count: 5,
            summary_id: 'summary-9',
        },
        questions: [
            {
                id: 'q1',
                question: 'What is force?',
                options: ['Energy', 'Mass x Acceleration', 'Velocity'],
                correct_index: 1,
                user_answer_index: 1,
                explanation: 'Force equals mass times acceleration.',
            },
        ],
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mocked.params.attemptId = 'attempt-1'

        mocked.quizzesApi.getAttempt.mockResolvedValue(makeAttemptPayload())
        mocked.quizzesApi.get.mockResolvedValue(makeAttemptPayload())

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

    it('renders quiz result summary from loaded attempt', async () => {
        await act(async () => {
            root.render(<QuizResultsPage />)
        })
        await flush()

        expect(container.textContent).toContain('Physics Quiz')
        expect(container.textContent).toContain('80%')
        expect(container.textContent).toContain('Detailed Review')
    })

    it('shows retryable load error and loads successfully on retry', async () => {
        mocked.quizzesApi.getAttempt
            .mockRejectedValueOnce(new Error('attempt unavailable'))
            .mockResolvedValueOnce(makeAttemptPayload())
        mocked.quizzesApi.get.mockRejectedValueOnce(new Error('quiz unavailable'))

        await act(async () => {
            root.render(<QuizResultsPage />)
        })
        await flush()

        expect(container.textContent).toContain('Failed to load quiz results')
        expect(container.textContent).toContain('quiz unavailable')

        clickButton('Retry')
        await flush()

        expect(mocked.quizzesApi.getAttempt).toHaveBeenCalledTimes(2)
        expect(container.textContent).toContain('Physics Quiz')
    })

    it('supports keyboard toggle for detailed review question rows', async () => {
        await act(async () => {
            root.render(<QuizResultsPage />)
        })
        await flush()

        const toggleRow = Array.from(container.querySelectorAll('[role="button"]')).find((el) =>
            (el.textContent || '').includes('What is force?'),
        ) as HTMLElement | undefined

        expect(toggleRow).toBeTruthy()
        expect(toggleRow?.getAttribute('tabindex')).toBe('0')

        act(() => {
            toggleRow!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        })

        expect(container.textContent).toContain('Explanation:')
        expect(container.textContent).toContain('Force equals mass times acceleration.')
    })
})

