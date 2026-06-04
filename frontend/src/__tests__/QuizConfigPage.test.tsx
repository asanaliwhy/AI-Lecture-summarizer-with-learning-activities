import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    summariesApi: {
        get: vi.fn(),
    },
    quizzesApi: {
        generate: vi.fn(),
    },
}))

vi.mock('../lib/api', () => ({
    api: {
        summaries: mocked.summariesApi,
        quizzes: mocked.quizzesApi,
    },
    ApiError: class extends Error { },
}))

vi.mock('../components/layout/AppLayout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
    CardDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
    CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

vi.mock('../components/ui/Slider', () => ({
    Slider: ({ value, onValueChange }: { value: number[]; onValueChange: (v: number[]) => void }) => (
        <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={value[0]}
            onChange={(e) => onValueChange([Number(e.target.value)])}
        />
    ),
}))

vi.mock('../components/ui/Label', () => ({
    Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}))

vi.mock('../components/ui/Checkbox', () => ({
    Checkbox: ({ checked, onCheckedChange, ...props }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void } & React.InputHTMLAttributes<HTMLInputElement>) => (
        <input
            type="checkbox"
            checked={!!checked}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            {...props}
        />
    ),
}))

vi.mock('../components/ui/Badge', () => ({
    Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}))

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocked.navigate,
    useParams: () => ({ summaryId: 'summary-1' }),
}))

import { QuizConfigPage } from '../pages/QuizConfigPage'

describe('QuizConfigPage generation payload', () => {
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

    const clickButton = (text: string) => {
        const target = Array.from(container.querySelectorAll('button')).find((btn) =>
            (btn.textContent || '').includes(text),
        )
        expect(target).toBeTruthy()
        act(() => {
            target!.click()
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mocked.summariesApi.get.mockResolvedValue({
            id: 'summary-1',
            title: 'Machine Learning',
            tags: ['ai', 'ml'],
        })
        mocked.quizzesApi.generate.mockResolvedValue({
            job_id: 'job-7',
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

    it('submits default quiz configuration', async () => {
        await act(async () => {
            root.render(<QuizConfigPage />)
        })
        await flush()

        clickButton('Generate Quiz')
        await flush()

        expect(mocked.quizzesApi.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                summary_id: 'summary-1',
                title: 'Quiz: Machine Learning',
                num_questions: 10,
                difficulty: 'medium',
                question_types: ['multiple_choice', 'true_false'],
                enable_timer: false,
                shuffle_questions: true,
                enable_hints: true,
                topics: ['ai', 'ml'],
            }),
        )
        expect(mocked.navigate).toHaveBeenCalledWith('/processing/job-7')
    })

    it('applies toggled options to generation payload', async () => {
        await act(async () => {
            root.render(<QuizConfigPage />)
        })
        await flush()

        const timer = container.querySelector('#timer') as HTMLInputElement | null
        const shuffle = container.querySelector('#shuffle') as HTMLInputElement | null
        const hints = container.querySelector('#hints') as HTMLInputElement | null
        const trueFalse = container.querySelector('#true-false') as HTMLInputElement | null

        expect(timer).toBeTruthy()
        expect(shuffle).toBeTruthy()
        expect(hints).toBeTruthy()
        expect(trueFalse).toBeTruthy()

        act(() => {
            timer!.click()
            shuffle!.click()
            hints!.click()
            trueFalse!.click()
        })
        await flush()

        clickButton('Generate Quiz')
        await flush()

        expect(mocked.quizzesApi.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                enable_timer: true,
                shuffle_questions: false,
                enable_hints: false,
                question_types: ['multiple_choice'],
            }),
        )
    })
})

