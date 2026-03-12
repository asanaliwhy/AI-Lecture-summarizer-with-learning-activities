import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

const mocked = vi.hoisted(() => ({
  navigate: vi.fn(),
  locationState: null as { view?: string } | null,
  flashcardsApi: {
    getDeck: vi.fn(),
    rateCard: vi.fn(),
  },
  studySessionsApi: {
    start: vi.fn(),
    stop: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../lib/api', () => ({
  api: {
    flashcards: mocked.flashcardsApi,
    studySessions: mocked.studySessionsApi,
  },
  ApiError: class ApiError extends Error { },
}))

vi.mock('../lib/useStudySession', () => ({
  useStudySession: () => undefined,
}))

vi.mock('../components/ui/Toast', () => ({
  useToast: () => mocked.toast,
}))

vi.mock('../components/ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}))

vi.mock('../components/ui/Progress', () => ({
  Progress: ({ value }: { value: number }) => <div data-testid="progress">{value}</div>,
}))

vi.mock('../components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocked.navigate,
  useParams: () => ({ deckId: 'deck-1' }),
  useLocation: () => ({ state: mocked.locationState }),
}))

import { FlashcardStudyPage } from '../pages/FlashcardStudyPage'

describe('FlashcardStudyPage option handling', () => {
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
    mocked.locationState = null
    mocked.flashcardsApi.rateCard.mockResolvedValue({})
    mocked.studySessionsApi.start.mockResolvedValue({ session: { id: 'session-1' } })
    mocked.studySessionsApi.stop.mockResolvedValue({})
    localStorage.clear()

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

    expect(container.textContent).toContain('FLASHCARD RESULTS')
    expect(mocked.flashcardsApi.rateCard).toHaveBeenCalledWith('card-1', 3)
    expect(mocked.studySessionsApi.start).toHaveBeenCalled()
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

  it('does not flip card from global Space key presses', async () => {
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

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })
    await flush()

    expect(container.textContent).toContain('Flip Card')
    expect(container.textContent).not.toContain('Next Card')
  })

  it('flips card when Space is pressed on flip surface', async () => {
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

    const flipSurface = container.querySelector('[data-testid="flashcard-flip-surface"]') as HTMLDivElement | null
    expect(flipSurface).toBeTruthy()

    act(() => {
      flipSurface!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })
    await flush()

    expect(container.textContent).toContain('Next Card')
  })

  it('shows deck-load error message when getDeck fails', async () => {
    mocked.flashcardsApi.getDeck.mockRejectedValue(new Error('Deck service unavailable'))

    await act(async () => {
      root.render(<FlashcardStudyPage />)
    })
    await flush()

    expect(container.textContent).toContain('Deck Not Found')
    expect(container.textContent).toContain('Deck service unavailable')
    expect(container.textContent).toContain('Go to Dashboard')
  })

  it('shows persisted mastered progress in results mode when opened from View Deck', async () => {
    mocked.locationState = { view: 'results' }
    mocked.flashcardsApi.getDeck.mockResolvedValue({
      deck: {
        id: 'deck-1',
        title: 'Deck 1',
        config: { enable_spaced_repetition: true },
      },
      cards: [
        {
          id: 'card-1',
          front: 'Question 1',
          back: 'Answer 1',
          repetitions: 3,
          ease_factor: 2.6,
        },
        {
          id: 'card-2',
          front: 'Question 2',
          back: 'Answer 2',
          repetitions: 1,
          ease_factor: 2.0,
        },
      ],
    })

    await act(async () => {
      root.render(<FlashcardStudyPage />)
    })
    await flush()

    expect(container.textContent).toContain('FLASHCARD RESULTS')
    expect(container.textContent).toContain('100%')
    expect(container.textContent).toContain('2 of 2 mastered')
  })

  it('reuses latest persisted backend progress when reopening View Deck results', async () => {
    mocked.flashcardsApi.getDeck.mockResolvedValue({
      deck: {
        id: 'deck-1',
        title: 'Deck 1',
        config: { enable_spaced_repetition: true },
      },
      cards: [
        { id: 'card-1', front: 'Q1', back: 'A1' },
        { id: 'card-2', front: 'Q2', back: 'A2' },
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

    clickButton('Flip Card')
    await flush()
    clickButton('Easy')
    await flush()

    mocked.locationState = { view: 'results' }
    mocked.flashcardsApi.getDeck.mockResolvedValue({
      deck: {
        id: 'deck-1',
        title: 'Deck 1',
        config: { enable_spaced_repetition: true },
      },
      cards: [
        { id: 'card-1', front: 'Q1', back: 'A1', repetitions: 3, ease_factor: 2.7 },
        { id: 'card-2', front: 'Q2', back: 'A2', repetitions: 3, ease_factor: 2.7 },
      ],
    })

    await act(async () => {
      root.render(<FlashcardStudyPage />)
    })
    await flush()

    expect(container.textContent).toContain('100%')
    expect(container.textContent).toContain('2 of 2 mastered')
  })
})

