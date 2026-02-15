import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    locationSearch: '',
    pdfSave: vi.fn(),
    libraryApi: {
        list: vi.fn(),
    },
    summariesApi: {
        delete: vi.fn(),
        get: vi.fn(),
    },
    quizzesApi: {
        delete: vi.fn(),
        get: vi.fn(),
    },
    flashcardsApi: {
        deleteDeck: vi.fn(),
        getDeck: vi.fn(),
    },
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    },
}))

vi.mock('../lib/api', () => {
    class MockApiError extends Error {
        status: number
        constructor(status: number, message: string) {
            super(message)
            this.status = status
        }
    }

    return {
        ApiError: MockApiError,
        api: {
            library: mocked.libraryApi,
            summaries: mocked.summariesApi,
            quizzes: mocked.quizzesApi,
            flashcards: mocked.flashcardsApi,
        },
    }
})

vi.mock('../components/layout/AppLayout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/ui/Toast', () => ({
    useToast: () => mocked.toast,
}))

vi.mock('../components/ui/Checkbox', () => ({
    Checkbox: ({ checked, onCheckedChange, ...props }: any) => (
        <button
            type="button"
            aria-pressed={Boolean(checked)}
            onClick={() => onCheckedChange?.(!checked)}
            {...props}
        />
    ),
}))

vi.mock('../components/ui/Tabs', async () => {
    const React = await vi.importActual<typeof import('react')>('react')

    const TabsContext = React.createContext<{ value: string; onValueChange: (value: string) => void } | null>(null)

    const Tabs = ({ value, onValueChange, children }: any) => (
        <TabsContext.Provider value={{ value, onValueChange: onValueChange || (() => undefined) }}>
            {children}
        </TabsContext.Provider>
    )

    const TabsList = ({ children, ...props }: any) => <div {...props}>{children}</div>

    const TabsTrigger = ({ value, children, ...props }: any) => {
        const ctx = React.useContext(TabsContext)
        if (!ctx) return null
        return (
            <button type="button" onClick={() => ctx.onValueChange(value)} {...props}>
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
    useLocation: () => ({ search: mocked.locationSearch }),
}))

vi.mock('jspdf', () => {
    class MockJsPDF {
        internal = {
            pageSize: {
                getHeight: () => 842,
                getWidth: () => 595,
            },
        }

        setFont = vi.fn()
        setFontSize = vi.fn()
        splitTextToSize = (text: string) => [String(text)]
        addPage = vi.fn()
        text = vi.fn()
        save = (...args: unknown[]) => mocked.pdfSave(...args)
    }

    return { jsPDF: MockJsPDF }
})

import { LibraryPage } from '../pages/LibraryPage'

describe('LibraryPage production behaviors', () => {
    let container: HTMLDivElement
    let root: Root

    const flush = async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    const clickButtonByText = (text: string) => {
        const button = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes(text),
        )
        expect(button).toBeTruthy()
        act(() => {
            button!.click()
        })
    }

    const clickByAriaLabel = (label: string) => {
        const button = container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null
        expect(button).toBeTruthy()
        act(() => {
            button!.click()
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mocked.locationSearch = ''

        mocked.libraryApi.list.mockResolvedValue({ items: [], total: 0 })
        mocked.summariesApi.delete.mockResolvedValue({})
        mocked.quizzesApi.delete.mockResolvedValue({})
        mocked.flashcardsApi.deleteDeck.mockResolvedValue({})
        mocked.summariesApi.get.mockResolvedValue({ title: 'Summary Export', content_raw: 'Body' })
        mocked.quizzesApi.get.mockResolvedValue({ title: 'Quiz Export', questions: [] })
        mocked.flashcardsApi.getDeck.mockResolvedValue({ deck: { title: 'Deck' }, cards: [] })

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

    it('renders load error and allows retry', async () => {
        mocked.libraryApi.list
            .mockRejectedValueOnce(new Error('library unavailable'))
            .mockResolvedValueOnce({ items: [], total: 0 })

        await act(async () => {
            root.render(<LibraryPage />)
        })
        await flush()

        expect(container.textContent).toContain('Failed to load library')
        expect(container.textContent).toContain('library unavailable')

        clickButtonByText('Retry')
        await flush()

        expect(mocked.libraryApi.list).toHaveBeenCalledTimes(2)
    })

    it('applies debounced search from URL query', async () => {
        mocked.locationSearch = '?search=brain'

        await act(async () => {
            root.render(<LibraryPage />)
        })
        await flush()

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 420))
        })
        await flush()

        expect(
            mocked.libraryApi.list.mock.calls.some((call) => JSON.stringify(call[0]) === JSON.stringify({ search: 'brain' })),
        ).toBe(true)
    })

    it('supports favorites tab and type filter request', async () => {
        mocked.libraryApi.list.mockResolvedValue({
            items: [
                { id: 's1', type: 'summary', title: 'Fav Summary', is_favorite: true, created_at: '2026-01-01T00:00:00Z' },
                { id: 'q1', type: 'quiz', title: 'Regular Quiz', is_favorite: false, created_at: '2026-01-02T00:00:00Z' },
            ],
            total: 2,
        })

        await act(async () => {
            root.render(<LibraryPage />)
        })
        await flush()

        clickButtonByText('Favorites')
        await flush()

        expect(container.textContent).toContain('Fav Summary')
        expect(container.textContent).not.toContain('Regular Quiz')

        clickByAriaLabel('Filter Quizzes')
        await flush()

        expect(
            mocked.libraryApi.list.mock.calls.some((call) => JSON.stringify(call[0]) === JSON.stringify({ type: 'quiz' })),
        ).toBe(true)
    })

    it('shows partial-failure summary on bulk delete', async () => {
        mocked.libraryApi.list
            .mockResolvedValueOnce({
                items: [
                    { id: 's1', type: 'summary', title: 'Summary A', created_at: '2026-01-01T00:00:00Z' },
                    { id: 'q1', type: 'quiz', title: 'Quiz A', created_at: '2026-01-02T00:00:00Z' },
                ],
                total: 2,
            })
            .mockResolvedValueOnce({
                items: [{ id: 'q1', type: 'quiz', title: 'Quiz A', created_at: '2026-01-02T00:00:00Z' }],
                total: 1,
            })

        mocked.summariesApi.delete.mockResolvedValueOnce({})
        mocked.quizzesApi.delete.mockRejectedValueOnce(new Error('delete failed'))

        await act(async () => {
            root.render(<LibraryPage />)
        })
        await flush()

        clickByAriaLabel('Select Summary A')
        clickByAriaLabel('Select Quiz A')
        await flush()

        clickButtonByText('Delete')
        await flush()

        expect(mocked.toast.warning).toHaveBeenCalledWith('Deleted 1 item, 1 failed')
    })

    it('shows export summary when some selected exports fail', async () => {
        mocked.libraryApi.list.mockResolvedValueOnce({
            items: [
                { id: 's1', type: 'summary', title: 'Summary Export', created_at: '2026-01-01T00:00:00Z' },
                { id: 'q1', type: 'quiz', title: 'Quiz Export', created_at: '2026-01-02T00:00:00Z' },
            ],
            total: 2,
        })

        mocked.summariesApi.get.mockResolvedValueOnce({
            title: 'Summary Export',
            content_raw: 'Summary content',
            created_at: '2026-01-01T00:00:00Z',
        })
        mocked.quizzesApi.get.mockRejectedValueOnce(new Error('quiz export failed'))

        await act(async () => {
            root.render(<LibraryPage />)
        })
        await flush()

        clickByAriaLabel('Select Summary Export')
        clickByAriaLabel('Select Quiz Export')
        await flush()

        clickButtonByText('Export')

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 200))
        })
        await flush()

        expect(mocked.toast.warning).toHaveBeenCalledWith('Exported 1 item, 1 failed')
        expect(mocked.pdfSave).toHaveBeenCalledTimes(1)
    })
})

