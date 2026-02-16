import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const SUMMARY_LENGTH_STORAGE_KEY = 'default_summary_length'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    contentApi: {
        validateYouTube: vi.fn(),
        upload: vi.fn(),
    },
    summariesApi: {
        generate: vi.fn(),
    },
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    },
}))

vi.mock('../lib/api', () => ({
    api: {
        content: mocked.contentApi,
        summaries: mocked.summariesApi,
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

vi.mock('../components/ui/Input', () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('../components/ui/Card', () => ({
    Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 {...props}>{children}</h3>,
    CardDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
}))

vi.mock('../components/ui/Label', () => ({
    Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}))

vi.mock('../components/ui/Badge', () => ({
    Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}))

vi.mock('../components/ui/Slider', () => ({
    Slider: ({ value, onValueChange, min = 0, max = 100, step = 1 }: any) => (
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={Array.isArray(value) ? value[0] : min}
            onChange={(e) => onValueChange?.([Number(e.target.value)])}
        />
    ),
}))

vi.mock('../components/ui/Tabs', async () => {
    const React = await vi.importActual<typeof import('react')>('react')

    const TabsContext = React.createContext<{
        value: string
        setValue: (value: string) => void
    } | null>(null)

    const Tabs = ({ defaultValue, onValueChange, children }: any) => {
        const [value, setValue] = React.useState<string>(defaultValue || 'youtube')
        const handleChange = (next: string) => {
            setValue(next)
            onValueChange?.(next)
        }
        return (
            <TabsContext.Provider value={{ value, setValue: handleChange }}>
                {children}
            </TabsContext.Provider>
        )
    }

    const TabsList = ({ children, ...props }: any) => <div {...props}>{children}</div>

    const TabsTrigger = ({ value, children, ...props }: any) => {
        const ctx = React.useContext(TabsContext)
        if (!ctx) return null
        return (
            <button
                type="button"
                data-state={ctx.value === value ? 'active' : 'inactive'}
                onClick={() => ctx.setValue(value)}
                {...props}
            >
                {children}
            </button>
        )
    }

    const TabsContent = ({ value, children, ...props }: any) => {
        const ctx = React.useContext(TabsContext)
        if (!ctx || ctx.value !== value) return null
        return <div {...props}>{children}</div>
    }

    return { Tabs, TabsList, TabsTrigger, TabsContent }
})

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocked.navigate,
}))

import { ContentInputPage } from '../pages/ContentInputPage'

describe('ContentInputPage critical production flows', () => {
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

    const setInputValue = (input: HTMLInputElement, value: string) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set

        act(() => {
            nativeSetter?.call(input, value)
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.removeItem(SUMMARY_LENGTH_STORAGE_KEY)

        mocked.contentApi.validateYouTube.mockResolvedValue({
            metadata: {
                title: 'Neural Networks 101',
                channel_name: 'AI Channel',
            },
            content_id: 'content-yt-1',
        })
        mocked.contentApi.upload.mockResolvedValue({ content_id: 'content-file-1' })
        mocked.summariesApi.generate.mockResolvedValue({ job_id: 'job-1', summary_id: 'summary-1' })

        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => {
            root.unmount()
        })
        container.remove()
        localStorage.removeItem(SUMMARY_LENGTH_STORAGE_KEY)
    })

    it('validates YouTube source and starts summary generation successfully', async () => {
        await act(async () => {
            root.render(<ContentInputPage />)
        })
        await flush()

        const urlInput = container.querySelector('#youtube-url') as HTMLInputElement | null
        expect(urlInput).toBeTruthy()

        setInputValue(urlInput!, 'https://www.youtube.com/watch?v=abc123')
        await flush()

        clickButton('Validate')
        await flush()

        expect(mocked.contentApi.validateYouTube).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123')
        expect(container.textContent).toContain('Valid source detected')

        clickButton('Generate Summary')
        await flush()

        expect(mocked.summariesApi.generate).toHaveBeenCalledWith(expect.objectContaining({ content_id: 'content-yt-1' }))
        expect(mocked.navigate).toHaveBeenCalledWith('/processing/job-1')
    })

    it('processes file upload path and starts generation', async () => {
        await act(async () => {
            root.render(<ContentInputPage />)
        })
        await flush()

        clickButton('File Upload')
        await flush()

        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null
        expect(fileInput).toBeTruthy()

        const file = new File(['pdf-content'], 'lecture.pdf', { type: 'application/pdf' })
        Object.defineProperty(fileInput!, 'files', { value: [file], configurable: true })

        act(() => {
            fileInput!.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flush()

        clickButton('Generate Summary')
        await flush()

        expect(mocked.contentApi.upload).toHaveBeenCalledTimes(1)
        expect(mocked.summariesApi.generate).toHaveBeenCalledWith(expect.objectContaining({ content_id: 'content-file-1' }))
        expect(mocked.navigate).toHaveBeenCalledWith('/processing/job-1')
    })

    it('shows generate failure to the user', async () => {
        mocked.summariesApi.generate.mockRejectedValueOnce(new Error('generation failed'))

        await act(async () => {
            root.render(<ContentInputPage />)
        })
        await flush()

        const urlInput = container.querySelector('#youtube-url') as HTMLInputElement | null
        expect(urlInput).toBeTruthy()

        setInputValue(urlInput!, 'https://www.youtube.com/watch?v=abc123')
        await flush()

        clickButton('Validate')
        await flush()

        clickButton('Generate Summary')
        await flush()

        expect(container.textContent).toContain('generation failed')
        expect(mocked.toast.error).toHaveBeenCalledWith('generation failed')
    })

    it('clears validation errors when source changes', async () => {
        await act(async () => {
            root.render(<ContentInputPage />)
        })
        await flush()

        const urlInput = container.querySelector('#youtube-url') as HTMLInputElement | null
        expect(urlInput).toBeTruthy()

        setInputValue(urlInput!, 'invalid-url')
        await flush()

        clickButton('Validate')
        await flush()

        expect(container.textContent).toContain('Please enter a valid YouTube URL')

        clickButton('File Upload')
        await flush()

        expect(container.textContent).not.toContain('Please enter a valid YouTube URL')
    })

    it('ignores stale YouTube validation response after switching source', async () => {
        let resolveValidation: ((value: unknown) => void) | null = null
        mocked.contentApi.validateYouTube.mockImplementationOnce(
            () => new Promise((resolve) => { resolveValidation = resolve }),
        )

        await act(async () => {
            root.render(<ContentInputPage />)
        })
        await flush()

        const urlInput = container.querySelector('#youtube-url') as HTMLInputElement | null
        expect(urlInput).toBeTruthy()

        setInputValue(urlInput!, 'https://www.youtube.com/watch?v=stale')
        await flush()

        clickButton('Validate')
        await flush()

        clickButton('File Upload')
        await flush()

        await act(async () => {
            resolveValidation?.({
                metadata: { title: 'Late Response', channel_name: 'Late Channel' },
                content_id: 'late-content-id',
            })
            await Promise.resolve()
        })
        await flush()

        clickButton('YouTube Link')
        await flush()

        expect(container.textContent).not.toContain('Valid source detected')
    })

    it('uses saved default summary length from settings for generation payload', async () => {
        localStorage.setItem(SUMMARY_LENGTH_STORAGE_KEY, 'detailed')

        await act(async () => {
            root.render(<ContentInputPage />)
        })
        await flush()

        const urlInput = container.querySelector('#youtube-url') as HTMLInputElement | null
        expect(urlInput).toBeTruthy()

        setInputValue(urlInput!, 'https://www.youtube.com/watch?v=abc123')
        await flush()

        clickButton('Validate')
        await flush()

        clickButton('Generate Summary')
        await flush()

        expect(mocked.summariesApi.generate).toHaveBeenCalledWith(
            expect.objectContaining({
                length: 'detailed',
            }),
        )
    })
})

