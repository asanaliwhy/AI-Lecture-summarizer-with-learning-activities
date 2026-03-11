import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useStudySession } from '../lib/useStudySession'
import { Button } from '../components/ui/Button'
import { Progress } from '../components/ui/Progress'
import { Badge } from '../components/ui/Badge'
import {
  X,
  RotateCw,
  Shuffle,
  Loader2,
  Download,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'

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
}

type DeckResponse = {
  deck?: DeckWithConfig
  cards?: unknown[]
}

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
  const { deckId } = useParams()
  const [deck, setDeck] = useState<DeckWithConfig | null>(null)
  const [cards, setCards] = useState<FlashcardItem[]>([])
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [enableSpacedRepetition, setEnableSpacedRepetition] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string>('')
  const toast = useToast()

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
  }, [deckId])

  useStudySession({
    activityType: 'flashcard',
    resourceId: deckId,
    enabled: !!deckId && !isLoading && !!deck,
    clientMeta: { page: 'flashcard_study' },
  })

  const totalCards = cards.length || 1
  const progress = ((currentCardIndex + 1) / totalCards) * 100
  const currentCard = cards[currentCardIndex]

  const handleFlip = () => {
    setIsFlipped(!isFlipped)
  }

  const handleRate = async (rating: number) => {
    // Rate the card (0=again, 1=hard, 2=good, 3=easy)
    if (currentCard?.id) {
      api.flashcards.rateCard(currentCard.id, rating).catch(() => { })
    }
    handleNext()
  }

  const handleNext = () => {
    if (currentCardIndex < totalCards - 1) {
      setIsFlipped(false)
      setTimeout(() => setCurrentCardIndex(prev => prev + 1), 300)
    } else {
      navigate('/dashboard')
    }
  }

  const shuffleCards = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    setCards(shuffled)
    setCurrentCardIndex(0)
    setIsFlipped(false)
  }

  const formatPdfDate = (isoString?: string) => {
    if (!isoString) return '-'
    const d = new Date(isoString)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  }

  const handleExportPdf = async () => {
    if (!deck || cards.length === 0) return
    setIsExporting(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const margin = 42

      const flashPageWidth = doc.internal.pageSize.getWidth()
      const flashPageHeight = doc.internal.pageSize.getHeight()
      const flashContentWidth = flashPageWidth - margin * 2
      let yFlash = margin

      const ensurePageSpaceFlash = (h: number) => {
        if (yFlash + h > flashPageHeight - margin) {
          doc.addPage()
          yFlash = margin
        }
      }

      const NAVY        = '#1a1a2e'
      const NAVY_MUTED  = '#e8e8f0'
      const SLATE       = '#475569'
      const BODY_COLOR  = '#334155'
      const OFF_WHITE   = '#f8fafc'
      const RULE        = '#e2e8f0'
      const GRAY_LIGHT  = '#f1f5f9'
      const GRAY_TEXT   = '#94a3b8'

      // 1. Badge (same settings as QuizResultsPage export)
      const badgeHeight = 16
      const badgeToTitleGap = 28
      doc.setFillColor(NAVY)
      doc.rect(margin, yFlash, flashContentWidth, badgeHeight, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor('#ffffff')
      doc.text('FLASHCARDS', margin + 8, yFlash + 11)
      yFlash += badgeHeight + badgeToTitleGap

      // 2. Title (same settings as QuizResultsPage export)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(NAVY)
      const deckTitle = deck.title || 'Flashcards'
      const titleLines = doc.splitTextToSize(deckTitle, flashContentWidth) as string[]
      for (const line of titleLines) {
        ensurePageSpaceFlash(28)
        doc.text(line, margin, yFlash)
        yFlash += 28
      }
      yFlash += -7

      // 3. Meta (same settings as QuizResultsPage export)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(GRAY_TEXT)
      ensurePageSpaceFlash(16)
      doc.text(`Generated: ${formatPdfDate(deck.created_at)}`, margin, yFlash)
      yFlash += 12

      // 4. Navy divider
      doc.setFillColor(NAVY)
      doc.rect(margin, yFlash, flashContentWidth, 1, 'F')
      yFlash += 20

      // 5. Stats row
      const statsRowHeight = 44
      ensurePageSpaceFlash(statsRowHeight + 20)
      const colW = flashContentWidth / 3

      doc.setFillColor(OFF_WHITE)
      doc.rect(margin, yFlash, flashContentWidth, statsRowHeight, 'F')
      doc.setDrawColor(RULE)
      doc.setLineWidth(0.5)
      doc.rect(margin, yFlash, flashContentWidth, statsRowHeight, 'S')

      doc.line(margin + colW, yFlash, margin + colW, yFlash + statsRowHeight)
      doc.line(margin + colW * 2, yFlash, margin + colW * 2, yFlash + statsRowHeight)

      const drawStatCol = (index: number, value: string, label: string) => {
        const cx = margin + colW * index + (colW / 2)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(15)
        doc.setTextColor(NAVY)
        doc.text(value, cx, yFlash + 18, { align: 'center' })

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(GRAY_TEXT)
        doc.text(label, cx, yFlash + 32, { align: 'center' })
      }

      drawStatCol(0, String(cards.length), 'Total Cards')
      drawStatCol(1, String(cards.length), 'To Review')
      drawStatCol(2, '0', 'Mastered')

      yFlash += statsRowHeight + 20

      // 6. Section label
      ensurePageSpaceFlash(25)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(SLATE)
      yFlash += 20
      doc.text('ALL CARDS', margin, yFlash)
      yFlash += 25

      // 7. Per-card rows
      const frontColWidth = flashContentWidth * 0.42
      const backColWidth = flashContentWidth * 0.58
      // Use stricter inner widths to prevent glyph spillover near the divider
      const frontTextMaxWidth = Math.max(frontColWidth - 32, 80)
      const backTextMaxWidth = Math.max(backColWidth - 32, 80)

      const normalizeInlineText = (value: string) => String(value || '').replace(/\s+/g, ' ').trim()
      const fitLineToWidth = (line: string, maxWidth: number) => {
        const fitted = doc.splitTextToSize(line, maxWidth) as string[]
        if (fitted.length <= 1) return fitted[0] || ''
        const first = (fitted[0] || '').trim()
        return first ? `${first}…` : ''
      }

      cards.forEach((card, index) => {
        const frontText = normalizeInlineText(card.front || card.term || '')
        const backText = normalizeInlineText(card.back || card.definition || '')

        // Match wrap metrics with the exact font settings used for drawing
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        const frontWrappedRaw = doc.splitTextToSize(frontText, frontTextMaxWidth) as string[]

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        const backWrappedRaw = doc.splitTextToSize(backText, backTextMaxWidth) as string[]
        const frontWrapped = frontWrappedRaw.map((line) => fitLineToWidth(String(line), frontTextMaxWidth))
        const backWrapped = backWrappedRaw.map((line) => fitLineToWidth(String(line), backTextMaxWidth))

        const frontHeight = frontWrapped.length * 15 + 36
        const backHeight = backWrapped.length * 15 + 36
        const cardHeight = Math.max(frontHeight, backHeight)

        ensurePageSpaceFlash(cardHeight + 22 + 5 + 10)

        // 7a. Card number label
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(SLATE)
        yFlash += 20
        doc.text(`Card ${index + 1}`, margin, yFlash)
        yFlash += 12

        // 7b. Two-column card
        // Front cell Background
        doc.setFillColor(NAVY)
        doc.rect(margin, yFlash, frontColWidth, cardHeight, 'F')
        
        // Back cell "label row" background
        doc.setFillColor(GRAY_LIGHT)
        doc.rect(margin + frontColWidth, yFlash, backColWidth, 24, 'F')

        // Back cell answer area background
        doc.setFillColor(OFF_WHITE)
        doc.rect(margin + frontColWidth, yFlash + 24, backColWidth, cardHeight - 24, 'F')

        // Outer border
        doc.setDrawColor(RULE)
        doc.setLineWidth(0.5)
        doc.rect(margin, yFlash, flashContentWidth, cardHeight, 'S')
        // Divider line
        doc.line(margin + frontColWidth, yFlash, margin + frontColWidth, yFlash + cardHeight)

        // Draw Front Content
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor('#94a3b8')
        doc.text('FRONT', margin + 12, yFlash + 14)

        doc.setFontSize(10)
        doc.setTextColor('#ffffff')
        let frontTextY = yFlash + 14 + 15
        frontWrapped.forEach((line: string) => {
          doc.text(line, margin + 12, frontTextY)
          frontTextY += 15
        })

        // Draw Back Content
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(GRAY_TEXT)
        doc.text('BACK', margin + frontColWidth + 12, yFlash + 14)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(BODY_COLOR)
        let backTextY = yFlash + 24 + 5
        backWrapped.forEach((line: string) => {
          doc.text(line, margin + frontColWidth + 12, backTextY, { align: 'left' })
          backTextY += 15
        })

        yFlash += cardHeight + 10
      })

      // 8. Footer
      ensurePageSpaceFlash(20)
      doc.setDrawColor(RULE)
      doc.setLineWidth(0.5)
      doc.line(margin, yFlash, margin + flashContentWidth, yFlash)
      yFlash += 12
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(GRAY_TEXT)
      doc.text('Lectura · Flashcards', flashPageWidth / 2, yFlash, { align: 'center' })

      doc.save(`${deckTitle}.pdf`)
      toast.success('PDF exported')
    } catch (err) {
      console.error(err)
      toast.error('Failed to export PDF')
    } finally {
      setIsExporting(false)
    }
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
          <Button variant="ghost" size="icon" onClick={handleExportPdf} disabled={isExporting} title="Export to PDF">
            {isExporting ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" /> : <Download className="h-4 w-4 text-muted-foreground" />}
          </Button>
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
            <Button size="lg" className="px-12 h-14 text-lg shadow-lg" onClick={handleNext}>
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
