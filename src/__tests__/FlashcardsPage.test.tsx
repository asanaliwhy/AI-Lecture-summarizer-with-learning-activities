import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
    flashcardsApi: {
        listDecks: vi.fn(),
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
            flashcards: mocked.flashcardsApi,
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

import { FlashcardsPage } from '../pages/FlashcardsPage'

describe('FlashcardsPage production behaviors', () => {
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
        mocked.flashcardsApi.listDecks.mockResolvedValue({
            decks: [
                {
                    id: 'deck-1',
                    title: 'Biology Basics',
                    card_count: 12,
                    created_at: new Date().toISOString(),
                    is_favorite: false,
                },
            ],
        })
        mocked.flashcardsApi.toggleFavorite.mockResolvedValue({})

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

    it('renders decks on success and card is keyboard-accessible', async () => {
        await act(async () => {
            root.render(<FlashcardsPage />)
        })
        await flush()

        expect(container.textContent).toContain('Biology Basics')

        const deckTitle = Array.from(container.querySelectorAll('h3')).find((el) =>
            (el.textContent || '').includes('Biology Basics'),
        )
        expect(deckTitle).toBeTruthy()

        const card = deckTitle!.closest('[role="button"]') as HTMLElement | null
        expect(card).toBeTruthy()
        expect(card?.getAttribute('tabindex')).toBe('0')

        act(() => {
            card!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        })

        expect(mocked.navigate).toHaveBeenCalledWith('/flashcards/study/deck-1')
    })

    it('shows load error and retries in-page without reload flow', async () => {
        mocked.flashcardsApi.listDecks
            .mockRejectedValueOnce(new Error('service unavailable'))
            .mockResolvedValueOnce({
                decks: [
                    {
                        id: 'deck-2',
                        title: 'Chemistry Set',
                        card_count: 20,
                        created_at: new Date().toISOString(),
                        is_favorite: false,
                    },
                ],
            })

        await act(async () => {
            root.render(<FlashcardsPage />)
        })
        await flush()

        expect(container.textContent).toContain('Failed to load flashcard decks')
        expect(container.textContent).toContain('service unavailable')

        clickButton('Retry')
        await flush()

        expect(mocked.flashcardsApi.listDecks).toHaveBeenCalledTimes(2)
        expect(container.textContent).toContain('Chemistry Set')
    })
})

