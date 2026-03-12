import React, { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Progress } from '../components/ui/Progress'
import { Badge } from '../components/ui/Badge'
import {
  X,
  RotateCw,
  Shuffle,
  Loader2,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import { FlashcardResultPage } from './FlashcardResultPage'

type DeckWithConfig = {
  id?: string
  title?: string
  config?: string | Record<string, unknown>
  created_at?: string
}

type FlashcardItem = {
  id?: string
  front?: string
  back?: string
  term?: string
  definition?: string
  front_label?: string
  back_label?: string
  mnemonic?: string
  example?: string
  repetitions?: number
  ease_factor?: number
}

type DeckResponse = {
  deck?: DeckWithConfig
  cards?: unknown[]
}

type CardStudyStatus = 'unrated' | 'learning' | 'mastered'

type StoredFlashcardResult = {
  ratings: Record<string, 'mastered' | 'learning'>
  elapsedSeconds: number
  savedAt: number
}

const flashcardResultStorageKey = (deckId: string) => `flashcard_results_${deckId}`

function isFlashcardItem(value: unknown): value is FlashcardItem {
  return Boolean(value) && typeof value === 'object'
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function FlashcardStudyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { deckId } = useParams()
  const [deck, setDeck] = useState<DeckWithConfig | null>(null)
  const [cards, setCards] = useState<FlashcardItem[]>([])
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [enableSpacedRepetition, setEnableSpacedRepetition] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [showResults, setShowResults] = useState(Boolean((location.state as { view?: string } | null)?.view === 'results'))
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [cardRatings, setCardRatings] = useState<Record<string, number>>({})
  const [cardStatuses, setCardStatuses] = useState<Record<string, CardStudyStatus>>({})
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const sessionStartRef = useRef<number>(Date.now())
  const completionSyncDoneRef = useRef(false)
  const completedFromStudyRef = useRef(false)
  const resultRefreshDoneRef = useRef(false)
  const toast = useToast()

  const derivePersistedStatus = (card: FlashcardItem): CardStudyStatus => {
    const repetitions = Number(card.repetitions ?? 0)
    const easeFactor = Number(card.ease_factor ?? 0)

    if (Number.isFinite(repetitions) && repetitions > 0) {
      return 'mastered'
    }

    return 'learning'
  }

  const buildStatusesFromCards = (deckCards: FlashcardItem[]): Record<string, CardStudyStatus> => {
    return Object.fromEntries(
      deckCards
        .map((card) => [card.id || '', derivePersistedStatus(card)] as const)
        .filter(([id]) => Boolean(id)),
    )
  }

  const readStoredResult = (id: string): StoredFlashcardResult | null => {
    try {
      const raw = localStorage.getItem(flashcardResultStorageKey(id))
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<StoredFlashcardResult>
      if (!parsed || typeof parsed !== 'object' || !parsed.ratings || typeof parsed.ratings !== 'object') {
        return null
      }
      return {
        ratings: parsed.ratings as Record<string, 'mastered' | 'learning'>,
        elapsedSeconds: Number(parsed.elapsedSeconds || 0),
        savedAt: Number(parsed.savedAt || Date.now()),
      }
    } catch {
      return null
    }
  }

  const refreshLatestDeckProgress = async () => {
    if (!deckId) return
    try {
      const latest = await api.flashcards.getDeck(deckId) as DeckResponse
      const latestCards = (Array.isArray(latest.cards) ? latest.cards : []).filter(isFlashcardItem)
      if (latestCards.length > 0) {
        if (!completedFromStudyRef.current) {
          setCards(latestCards)
          setCardStatuses(buildStatusesFromCards(latestCards))
        }
      }
    } catch (err) {
      console.error('Failed to refresh latest flashcard progress', err)
    }
  }

  useEffect(() => {
    if (!deckId) return
    let isMounted = true

    async function load() {
      try {
        const data = await api.flashcards.getDeck(deckId!) as DeckResponse
        if (!isMounted) return

        const deckData = data.deck && typeof data.deck === 'object'
          ? data.deck
          : (data as unknown as DeckWithConfig)
        setDeck(deckData)

        const rawCards = Array.isArray(data.cards) ? data.cards : []
        const normalizedCards = rawCards.filter(isFlashcardItem)
        setCards(normalizedCards)
        setCurrentCardIndex(0)
        setIsFlipped(false)
        const shouldOpenResults = Boolean((location.state as { view?: string } | null)?.view === 'results')
        setShowResults(shouldOpenResults)
        setElapsedSeconds(0)
        setCardRatings({})
        if (shouldOpenResults && deckId) {
          const stored = readStoredResult(deckId)
          if (stored?.ratings) {
            setCardStatuses(stored.ratings)
          } else {
            setCardStatuses(
              Object.fromEntries(
                normalizedCards
                  .map((card) => [card.id || '', derivePersistedStatus(card)] as const)
                  .filter(([id]) => Boolean(id)),
              ),
            )
          }
          setElapsedSeconds(Math.max(0, Number(stored?.elapsedSeconds || 0)))
        } else {
          setCardStatuses({})
        }
        completionSyncDoneRef.current = shouldOpenResults
        completedFromStudyRef.current = false
        resultRefreshDoneRef.current = false
        sessionStartRef.current = Date.now()

        let parsedConfig: Record<string, unknown> = {}
        const rawConfig = deckData?.config
        if (typeof rawConfig === 'string') {
          try {
            parsedConfig = JSON.parse(rawConfig) as Record<string, unknown>
          } catch {
            parsedConfig = {}
          }
        } else if (rawConfig && typeof rawConfig === 'object') {
          parsedConfig = rawConfig as Record<string, unknown>
        }

        const spacedValue = parsedConfig.enable_spaced_repetition
        setEnableSpacedRepetition(typeof spacedValue === 'boolean' ? spacedValue : true)
        setError('')
      } catch (err: unknown) {
        if (!isMounted) return

        setDeck(null)
        setCards([])
        setError(getErrorMessage(err, 'Failed to load this deck. It may still be generating.'))
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [deckId, location.state, refreshTrigger])

  const totalCards = cards.length || 1
  const progress = cards.length > 0 ? ((currentCardIndex + 1) / cards.length) * 100 : 0
  const currentCard = cards[currentCardIndex]

  const getCardStatus = (card: FlashcardItem): CardStudyStatus => {
    if (!card.id) return 'unrated'
    return cardStatuses[card.id] || 'unrated'
  }

  const masteredCount = cards.reduce((acc, card) => acc + (getCardStatus(card) === 'mastered' ? 1 : 0), 0)
  const learningCount = cards.reduce((acc, card) => acc + (getCardStatus(card) === 'learning' ? 1 : 0), 0)

  const completeSession = (finalStatuses?: Record<string, CardStudyStatus>) => {
    setIsFlipped(false)
    const startedAt = sessionStartRef.current || Date.now()
    setElapsedSeconds(Math.max(1, Math.round((Date.now() - startedAt) / 1000)))
    completedFromStudyRef.current = true
    resultRefreshDoneRef.current = false
    
    if (finalStatuses) {
      setCardStatuses(finalStatuses)
    }
    
    setShowResults(true)
  }

  useEffect(() => {
    if (!showResults || !deckId || !completedFromStudyRef.current) return

    const ratingsToPersist = cards.reduce<Record<string, 'mastered' | 'learning'>>((acc, card) => {
      if (!card.id) return acc
      const status = getCardStatus(card)
      acc[card.id] = status === 'mastered' ? 'mastered' : 'learning'
      return acc
    }, {})

    const payload: StoredFlashcardResult = {
      ratings: ratingsToPersist,
      elapsedSeconds,
      savedAt: Date.now(),
    }

    try {
      localStorage.setItem(flashcardResultStorageKey(deckId), JSON.stringify(payload))
    } catch {
      // keep silent - non-critical cache
    }
  }, [showResults, deckId, cards, cardStatuses, elapsedSeconds])

  useEffect(() => {
    if (!showResults || completionSyncDoneRef.current || !deckId) return
    completionSyncDoneRef.current = true

    const syncRatingsPromise = Promise.allSettled(
      Object.entries(cardRatings).map(([cardId, rating]) => api.flashcards.rateCard(cardId, rating)),
    ).then((results) => {
      const failures = results.filter(r => r.status === 'rejected')
      if (failures.length > 0) {
        console.error(`Failed to sync ${failures.length} flashcard ratings`, failures)
      }
    })
    const recordStudySessionPromise = api.studySessions
      .start('flashcard', deckId, {
        page: 'flashcard_study_results',
        elapsed_seconds: elapsedSeconds,
        total_cards: cards.length,
        mastered_cards: masteredCount,
        learning_cards: learningCount,
      })
      .then((res) => {
        const sessionId = res?.session?.id
        if (!sessionId) return
        return api.studySessions.stop(sessionId)
      })
      .catch((err) => {
        console.error('Failed to record flashcard study session', err)
      })

    void Promise.all([syncRatingsPromise, recordStudySessionPromise])
      .then(() => refreshLatestDeckProgress())
      .finally(() => {
        resultRefreshDoneRef.current = true
      })
  }, [showResults, deckId, cardRatings, elapsedSeconds, cards.length, masteredCount, learningCount])

  useEffect(() => {
    if (!showResults || !deckId) return
    if (completedFromStudyRef.current) return
    if (resultRefreshDoneRef.current) return

    resultRefreshDoneRef.current = true
    void refreshLatestDeckProgress()
  }, [showResults, deckId])

  const handleFlip = () => {
    setIsFlipped(!isFlipped)
  }

  const handleRate = async (rating: number) => {
    let nextStatuses = cardStatuses
    if (currentCard?.id) {
      setCardRatings((prev) => ({ ...prev, [currentCard.id!]: rating }))
      nextStatuses = {
        ...cardStatuses,
        [currentCard.id!]: rating >= 2 ? 'mastered' : 'learning',
      }
      setCardStatuses(nextStatuses)
    }
    handleNext(nextStatuses)
  }

  const handleNext = (finalStatuses?: Record<string, CardStudyStatus>) => {
    if (currentCardIndex < totalCards - 1) {
      setIsFlipped(false)
      setTimeout(() => setCurrentCardIndex(prev => prev + 1), 300)
    } else {
      completeSession(finalStatuses)
    }
  }

  const shuffleCards = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    setCards(shuffled)
    setCurrentCardIndex(0)
    setIsFlipped(false)
  }

  const handleStudyAgain = () => {
    if (deckId) {
      localStorage.removeItem(flashcardResultStorageKey(deckId))
    }
    
    setCardRatings({})
    setCardStatuses({})
    setCurrentCardIndex(0)
    setIsFlipped(false)
    setElapsedSeconds(0)
    setShowResults(false)
    completionSyncDoneRef.current = false
    completedFromStudyRef.current = false
    resultRefreshDoneRef.current = false
    
    setIsLoading(true)
    setRefreshTrigger(prev => prev + 1)
  }

    const formatPdfDate = (isoString?: string) => {
    if (!isoString) return '-'
    const d = new Date(isoString)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!deck || cards.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-6">
        <h2 className="text-2xl font-bold mb-2">Deck Not Found</h2>
        <p className="text-muted-foreground mb-2">This flashcard deck may still be generating or doesn't exist.</p>
        {error && <p className="text-sm text-destructive mb-6">{error}</p>}
        <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
      </div>
    )
  }

  if (showResults) {
    const resultCards = cards.map((card, index) => ({
      id: card.id || `card-${index}`,
      front: card.front || card.term || '',
      back: card.back || card.definition || '',
    }))

    return (
      <FlashcardResultPage
        flashcardSetId={deckId || ''}
        title={deck?.title || 'Untitled Deck'}
        cards={resultCards}
        ratings={cardStatuses as Record<string, 'mastered' | 'learning'>}
        elapsedSeconds={elapsedSeconds}
        onStudyAgain={handleStudyAgain}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-4 md:px-6 bg-card/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <X className="h-5 w-5 text-muted-foreground" />
          </Button>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate">{deck.title || 'Flashcard Deck'}</span>
            <span className="text-xs text-muted-foreground">
              {currentCardIndex + 1} / {totalCards}
            </span>
          </div>
        </div>

        <div className="flex-1 max-w-md mx-3 md:mx-8 hidden md:block">
          <Progress value={progress} className="h-2" />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={shuffleCards} title="Shuffle Cards">
            <Shuffle className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </header>

      <div className="px-4 md:px-6 pt-3 md:hidden">
        <Progress value={progress} className="h-2" />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-6 w-full max-w-3xl mx-auto">
        <div
          data-testid="flashcard-flip-surface"
          className="w-full aspect-[3/2] perspective-1000 cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-2xl"
          onClick={handleFlip}
          role="button"
          tabIndex={0}
          aria-label="Flashcard preview. Click to flip card"
          aria-pressed={isFlipped}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
              e.preventDefault()
              handleFlip()
            }
          }}
        >
          <div
            className={cn(
              'relative h-full w-full transition-all duration-500 transform-style-3d shadow-2xl rounded-2xl',
              isFlipped ? 'rotate-y-180' : '',
            )}
          >
            {/* Front */}
            <div className="absolute inset-0 h-full w-full bg-card border rounded-2xl p-8 md:p-16 flex flex-col items-center justify-center text-center backface-hidden">
              <Badge variant="secondary" className="mb-6 rounded-full px-3 py-1 text-[11px] uppercase tracking-wide">
                {currentCard?.front_label || 'Term'}
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold text-foreground">
                {currentCard?.front || currentCard?.term || 'Loading...'}
              </h2>
              {currentCard?.mnemonic && (
                <div className="mt-10 md:mt-12 p-4 bg-indigo-500/10 dark:bg-indigo-400/15 rounded-lg text-sm text-indigo-700 dark:text-indigo-100 border border-indigo-400/20 dark:border-indigo-300/25 max-w-2xl">
                  <span className="font-semibold text-indigo-800 dark:text-indigo-50">Mnemonic: </span>
                  {currentCard.mnemonic}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-8 opacity-50">
                (Click or Space to flip)
              </p>
            </div>

            {/* Back */}
            <div className="absolute inset-0 h-full w-full bg-slate-900 text-slate-50 rounded-2xl p-8 md:p-16 flex flex-col items-center justify-center text-center backface-hidden rotate-y-180 border border-slate-800 dark:border-slate-700">
              <Badge variant="outline" className="mb-6 rounded-full px-3 py-1 text-[11px] uppercase tracking-wide border-slate-500/60 text-slate-300">
                {currentCard?.back_label || 'Definition'}
              </Badge>
              <p className="text-xl md:text-2xl font-medium leading-relaxed">
                {currentCard?.back || currentCard?.definition || ''}
              </p>
              {currentCard?.example && (
                <div className="mt-8 p-4 bg-slate-800/90 dark:bg-slate-700/80 rounded-lg text-sm text-slate-300 dark:text-slate-200">
                  <span className="font-semibold text-slate-200 dark:text-slate-100">Example: </span>
                  {currentCard.example}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 md:mt-12 w-full max-w-2xl min-h-[96px] flex items-center justify-center">
          {!isFlipped ? (
            <Button size="lg" className="px-12 h-14 text-lg shadow-lg" onClick={handleFlip}>
              <RotateCw className="mr-2 h-5 w-5" />
              Flip Card
            </Button>
          ) : !enableSpacedRepetition ? (
            <Button size="lg" className="px-12 h-14 text-lg shadow-lg" onClick={() => handleNext()}>
              Next Card
            </Button>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 w-full animate-in fade-in slide-in-from-bottom-4">
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="h-14 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:border-red-500/40 dark:hover:bg-red-500/15 dark:hover:text-red-300 dark:hover:border-red-500/50"
                  onClick={() => handleRate(0)}
                >
                  Again
                </Button>
                <span className="text-xs text-center text-muted-foreground">&lt; 1m</span>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="h-14 border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 dark:border-orange-500/40 dark:hover:bg-orange-500/15 dark:hover:text-orange-300 dark:hover:border-orange-500/50"
                  onClick={() => handleRate(1)}
                >
                  Hard
                </Button>
                <span className="text-xs text-center text-muted-foreground">2d</span>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="h-14 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 dark:border-blue-500/40 dark:hover:bg-blue-500/15 dark:hover:text-blue-300 dark:hover:border-blue-500/50"
                  onClick={() => handleRate(2)}
                >
                  Good
                </Button>
                <span className="text-xs text-center text-muted-foreground">4d</span>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="h-14 border-green-200 hover:bg-green-50 hover:text-green-700 hover:border-green-300 dark:border-green-500/40 dark:hover:bg-green-500/15 dark:hover:text-green-300 dark:hover:border-green-500/50"
                  onClick={() => handleRate(3)}
                >
                  Easy
                </Button>
                <span className="text-xs text-center text-muted-foreground">7d</span>
              </div>
            </div>
          )}
        </div>
      </main>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  )
}
