import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const mocked = vi.hoisted(() => ({
  navigate: vi.fn(),
  flashcardsApi: {
    getDeck: vi.fn(),
    rateCard: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  api: {
    flashcards: mocked.flashcardsApi,
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

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocked.navigate,
  useParams: () => ({ deckId: 'deck-1' }),
}))

import { FlashcardStudyPage } from '../pages/FlashcardStudyPage'

describe('FlashcardStudyPage option handling', () => {
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
    mocked.flashcardsApi.rateCard.mockResolvedValue({})

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

  it('shows Next Card (no rating) when spaced repetition is disabled', async () => {
    mocked.flashcardsApi.getDeck.mockResolvedValue({
      deck: {
        id: 'deck-1',
        title: 'Deck 1',
        config: { enable_spaced_repetition: false },
      },
      cards: [
        {
          id: 'card-1',
          front: 'Term',
          back: 'Definition',
        },
      ],
    })

    await act(async () => {
      root.render(<FlashcardStudyPage />)
    })
    await flush()

    clickButton('Flip Card')
    await flush()

    expect(container.textContent).toContain('Next Card')
    expect(container.textContent).not.toContain('Again')
    expect(container.textContent).not.toContain('Hard')
  })

  it('uses valid backend rating scale when spaced repetition is enabled', async () => {
    mocked.flashcardsApi.getDeck.mockResolvedValue({
      deck: {
        id: 'deck-1',
        title: 'Deck 1',
        config: { enable_spaced_repetition: true },
      },
      cards: [
        {
          id: 'card-1',
          front: 'What is ML?',
          back: 'Machine learning',
        },
      ],
    })

    await act(async () => {
      root.render(<FlashcardStudyPage />)
    })
    await flush()

    clickButton('Flip Card')
    await flush()

    clickButton('Easy')
    await flush()

    expect(mocked.flashcardsApi.rateCard).toHaveBeenCalledWith('card-1', 3)
  })

  it('renders mnemonic text when available on card', async () => {
    mocked.flashcardsApi.getDeck.mockResolvedValue({
      deck: {
        id: 'deck-1',
        title: 'Deck 1',
        config: { enable_spaced_repetition: false },
      },
      cards: [
        {
          id: 'card-1',
          front: 'Gradient descent',
          back: 'Optimization method',
          mnemonic: 'Go downhill to lower loss',
        },
      ],
    })

    await act(async () => {
      root.render(<FlashcardStudyPage />)
    })
    await flush()

    clickButton('Flip Card')
    await flush()

    expect(container.textContent).toContain('Mnemonic:')
    expect(container.textContent).toContain('Go downhill to lower loss')
  })
})

