import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const mocked = vi.hoisted(() => {
    class MockApiError extends Error {
        status: number

        constructor(status: number, message: string) {
            super(message)
            this.status = status
        }
    }

    return {
        routeId: 'summary-1',
        navigate: vi.fn(),
        toast: {
            success: vi.fn(),
            error: vi.fn(),
        },
        clipboardWriteText: vi.fn(),
        pdf: {
            save: vi.fn(),
            setFont: vi.fn(),
            setFontSize: vi.fn(),
            text: vi.fn(),
            splitTextToSize: vi.fn((value: string) => [value]),
            addPage: vi.fn(),
            setDrawColor: vi.fn(),
            setFillColor: vi.fn(),
            rect: vi.fn(),
        },
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
    useToast: () => mocked.toast,
}))

vi.mock('react-dom', async () => {
    const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
    return {
        ...actual,
        createPortal: (node: React.ReactNode) => node,
    }
})

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocked.navigate,
    useParams: () => ({ id: mocked.routeId }),
}))

vi.mock('jspdf', () => {
    class MockJsPDF {
        internal = {
            pageSize: {
                getWidth: () => 595,
                getHeight: () => 842,
            },
        }

        setFont = mocked.pdf.setFont
        setFontSize = mocked.pdf.setFontSize
        text = mocked.pdf.text
        splitTextToSize = mocked.pdf.splitTextToSize
        addPage = mocked.pdf.addPage
        setDrawColor = mocked.pdf.setDrawColor
        setFillColor = mocked.pdf.setFillColor
        rect = mocked.pdf.rect
        save = mocked.pdf.save
    }

    return { jsPDF: MockJsPDF }
})

import { SummaryPage } from '../pages/SummaryPage'

type SummaryData = {
    id: string
    title: string
    created_at: string
    source: string
    source_url: string
    source_duration: string
    tags: string[]
    content_id: string
    content_raw: string
    format: 'paragraph' | 'bullets' | 'cornell' | 'smart'
    length_setting: string
    sections: Array<{ title: string; body: string; content?: string }>
    config?: {
        content_id?: string
        format?: string
        length?: string
        focus_areas?: string[]
        target_audience?: string
        language?: string
    }
}

describe('SummaryPage production behaviors', () => {
    let container: HTMLDivElement
    let root: Root

    const createSummary = (overrides?: Partial<SummaryData>): SummaryData => ({
        id: 'summary-1',
        title: 'AI Basics',
        created_at: new Date('2025-01-01').toISOString(),
        source: 'youtube',
        source_url: 'https://youtube.com/watch?v=test',
        source_duration: '12:34',
        tags: ['AI', 'ML'],
        content_id: 'content-1',
        content_raw: 'Overview:\nNeural networks learn patterns from data.',
        format: 'paragraph',
        length_setting: 'medium',
        sections: [],
        ...overrides,
    })

    const flush = async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    const clickButton = (text: string, index = 0) => {
        const targets = Array.from(document.body.querySelectorAll('button')).filter((btn) =>
            (btn.textContent || '').includes(text),
        )
        expect(targets.length).toBeGreaterThan(index)
        act(() => {
            targets[index].click()
        })
    }

    const setInputValue = (input: HTMLInputElement, value: string) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        act(() => {
            nativeSetter?.call(input, value)
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()

        mocked.routeId = 'summary-1'
        mocked.clipboardWriteText.mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: mocked.clipboardWriteText,
            },
        })

        mocked.summariesApi.get.mockResolvedValue(createSummary())
        mocked.summariesApi.update.mockResolvedValue({})
        mocked.summariesApi.regenerate.mockResolvedValue({ job_id: 'job-123' })
        mocked.summariesApi.delete.mockResolvedValue({})

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

    it('renders summary details on successful load', async () => {
        await act(async () => {
            root.render(<SummaryPage />)
        })
        await flush()

        expect(container.textContent).toContain('AI Basics')
        expect(container.textContent).toContain('Study Tools')
        expect(container.textContent).toContain('Generate Quiz')
        expect(container.textContent).toContain('Create Flashcards')
    })

    it('ignores stale loader response after route id changes', async () => {
        let resolveFirst: ((value: SummaryData) => void) | undefined
        let resolveSecond: ((value: SummaryData) => void) | undefined

        mocked.summariesApi.get.mockImplementation((id: string) => {
            if (id === 'summary-1') {
                return new Promise((resolve) => {
                    resolveFirst = resolve as (value: SummaryData) => void
                })
            }
            return new Promise((resolve) => {
                resolveSecond = resolve as (value: SummaryData) => void
            })
        })

        mocked.routeId = 'summary-1'
        await act(async () => {
            root.render(<SummaryPage />)
        })

        mocked.routeId = 'summary-2'
        await act(async () => {
            root.render(<SummaryPage />)
        })

        await act(async () => {
            resolveSecond?.(createSummary({ id: 'summary-2', title: 'Second Summary' }))
        })
        await flush()
        expect(container.textContent).toContain('Second Summary')

        await act(async () => {
            resolveFirst?.(createSummary({ id: 'summary-1', title: 'First Summary' }))
        })
        await flush()

        expect(container.textContent).toContain('Second Summary')
        expect(container.textContent).not.toContain('First Summary')
    })

    it('saves edited title when inline editor loses focus', async () => {
        await act(async () => {
            root.render(<SummaryPage />)
        })
        await flush()

        const titleNode = Array.from(container.querySelectorAll('h1')).find((el) =>
            (el.textContent || '').includes('AI Basics'),
        )
        expect(titleNode).toBeTruthy()

        act(() => {
            ; (titleNode as HTMLElement).click()
        })

        const input = container.querySelector('input[type="text"]') as HTMLInputElement | null
        expect(input).toBeTruthy()
        setInputValue(input!, 'Advanced AI')

        act(() => {
            input!.blur()
        })
        await flush()

        expect(mocked.summariesApi.update).toHaveBeenCalledWith('summary-1', { title: 'Advanced AI' })
    })

    it('regenerates summary and navigates to processing job', async () => {
        await act(async () => {
            root.render(<SummaryPage />)
        })
        await flush()

        clickButton('Regenerate')
        await flush()

        expect(mocked.summariesApi.regenerate).toHaveBeenCalledWith(
            'summary-1',
            expect.objectContaining({
                content_id: 'content-1',
                format: 'paragraph',
                length: 'medium',
            }),
        )
        expect(mocked.navigate).toHaveBeenCalledWith('/processing/job-123')
    })

    it('opens delete modal and supports cancel + confirm delete flow', async () => {
        await act(async () => {
            root.render(<SummaryPage />)
        })
        await flush()

        clickButton('Delete', 0)
        await flush()
        expect(container.textContent).toContain('Delete summary?')

        clickButton('Cancel')
        await flush()
        expect(container.textContent).not.toContain('Delete summary?')

        clickButton('Delete', 0)
        await flush()
        clickButton('Delete', 1)
        await flush()

        expect(mocked.summariesApi.delete).toHaveBeenCalledWith('summary-1')
        expect(mocked.toast.success).toHaveBeenCalledWith('Summary deleted')
        expect(mocked.navigate).toHaveBeenCalledWith('/summaries')
    })

    it('copies summary text to clipboard', async () => {
        await act(async () => {
            root.render(<SummaryPage />)
        })
        await flush()

        clickButton('Copy Text')
        await flush()

        expect(mocked.clipboardWriteText).toHaveBeenCalledWith('Overview:\nNeural networks learn patterns from data.')
        expect(mocked.toast.success).toHaveBeenCalledWith('Summary copied to clipboard')
    })

    it('exports summary to PDF and reports success', async () => {
        await act(async () => {
            root.render(<SummaryPage />)
        })
        await flush()

        clickButton('Export')
        await flush()

        expect(mocked.pdf.save).toHaveBeenCalledWith('AI Basics.pdf')
        expect(mocked.toast.success).toHaveBeenCalledWith('PDF exported')
    })

    it('renders non-404 retry state for server failures', async () => {
        mocked.summariesApi.get.mockRejectedValueOnce(new Error('server down'))

        await act(async () => {
            root.render(<SummaryPage />)
        })
        await flush()

        expect(container.textContent).toContain('Failed to load summary')
        expect(container.textContent).toContain('server down')
        expect(container.textContent).toContain('Retry')
    })

    it('renders not-found state only for 404 errors', async () => {
        mocked.summariesApi.get.mockRejectedValueOnce(new mocked.ApiError(404, 'not found'))

        await act(async () => {
            root.render(<SummaryPage />)
        })
        await flush()

        expect(container.textContent).toContain('Summary Not Found')
    })
})

