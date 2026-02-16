import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    summariesApi: {
        get: vi.fn(),
    },
    flashcardsApi: {
        generate: vi.fn(),
    },
}))

vi.mock('../lib/api', () => ({
    api: {
        summaries: mocked.summariesApi,
        flashcards: mocked.flashcardsApi,
    },
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
            min={5}
            max={50}
            step={5}
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

import { FlashcardConfigPage } from '../pages/FlashcardConfigPage'

describe('FlashcardConfigPage card strategy', () => {
    let container: HTMLDivElement
    let root: Root

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
            title: 'Neural Networks',
            tags: ['ai', 'ml'],
        })
        mocked.flashcardsApi.generate.mockResolvedValue({
            job_id: 'job-42',
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

    it('sends term_definition strategy by default', async () => {
        await act(async () => {
            root.render(<FlashcardConfigPage />)
        })
        await flush()

        clickButton('Generate Flashcards')
        await flush()

        expect(mocked.flashcardsApi.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                summary_id: 'summary-1',
                strategy: 'term_definition',
            }),
        )
        expect(mocked.navigate).toHaveBeenCalledWith('/processing/job-42')
    })

    it('sends question_answer strategy when Question & Answer is selected', async () => {
        await act(async () => {
            root.render(<FlashcardConfigPage />)
        })
        await flush()

        const qaRadio = container.querySelector('#qa') as HTMLInputElement | null
        expect(qaRadio).toBeTruthy()
        act(() => {
            qaRadio!.click()
        })
        await flush()

        clickButton('Generate Flashcards')
        await flush()

        expect(mocked.flashcardsApi.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                summary_id: 'summary-1',
                strategy: 'question_answer',
            }),
        )
        expect(mocked.navigate).toHaveBeenCalledWith('/processing/job-42')
    })
})

