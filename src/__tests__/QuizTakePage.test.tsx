import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    quizzesApi: {
        get: vi.fn(),
        startAttempt: vi.fn(),
        saveProgress: vi.fn(),
        submitAttempt: vi.fn(),
    },
}))

vi.mock('../lib/api', () => ({
    api: {
        quizzes: mocked.quizzesApi,
    },
}))

vi.mock('../lib/useStudySession', () => ({
    useStudySession: () => undefined,
}))

vi.mock('../components/ui/Button', () => ({
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button type="button" {...props}>{children}</button>
    ),
}))

vi.mock('../components/ui/Progress', () => ({
    Progress: ({ value }: { value: number }) => <div data-testid="progress">{value}</div>,
}))

vi.mock('../components/ui/Card', () => ({
    Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocked.navigate,
    useParams: () => ({ quizId: 'quiz-1' }),
}))

import { QuizTakePage } from '../pages/QuizTakePage'

describe('QuizTakePage quiz options behavior', () => {
    let container: HTMLDivElement
    let root: Root
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT

    beforeAll(() => {
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    })

    afterAll(() => {
        actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    })

    const flush = async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()

        mocked.quizzesApi.startAttempt.mockResolvedValue({ attempt_id: 'attempt-1' })
        mocked.quizzesApi.saveProgress.mockResolvedValue({})
        mocked.quizzesApi.submitAttempt.mockResolvedValue({ attempt_id: 'attempt-1' })

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

    it('hides timer and hints controls when both options are disabled', async () => {
        mocked.quizzesApi.get.mockResolvedValue({
            id: 'quiz-1',
            title: 'Quiz 1',
            config: {
                enable_timer: false,
                shuffle_questions: true,
                enable_hints: false,
            },
            questions: [
                {
                    question: 'Q1',
                    options: ['A', 'B'],
                    hint: 'This hint should be hidden',
                },
            ],
        })

        await act(async () => {
            root.render(<QuizTakePage />)
        })
        await flush()

        expect(container.textContent).toContain('Q1')
        expect(container.textContent).not.toContain('00:00')
        expect(container.textContent).not.toContain('Show Hint')
    })

    it('keeps original question order when shuffle option is disabled', async () => {
        mocked.quizzesApi.get.mockResolvedValue({
            id: 'quiz-1',
            title: 'Quiz 1',
            config: {
                enable_timer: false,
                shuffle_questions: false,
                enable_hints: true,
            },
            questions: [
                { question: 'First question', options: ['A', 'B'], hint: 'h1' },
                { question: 'Second question', options: ['C', 'D'], hint: 'h2' },
            ],
        })

        await act(async () => {
            root.render(<QuizTakePage />)
        })
        await flush()

        expect(container.textContent).toContain('First question')
        expect(container.textContent).not.toContain('Second questionFinish Quiz')
    })
})

