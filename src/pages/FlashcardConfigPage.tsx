import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../components/ui/Card'
import { Slider } from '../components/ui/Slider'
import { Label } from '../components/ui/Label'
import { Checkbox } from '../components/ui/Checkbox'
import { Badge } from '../components/ui/Badge'
import {
  Layers,
  CheckCircle2,
  Loader2,
  Sparkles,
  SlidersHorizontal,
  Brain,
  BookOpenText,
  Lightbulb,
  Wand2,
  NotebookPen,
  RotateCcw,
  Tags,
} from 'lucide-react'
import { cn } from '../lib/utils'

type Strategy = 'definitions' | 'qa'

type SummaryWithTopics = Awaited<ReturnType<typeof api.summaries.get>> & {
  topics?: unknown[]
  tags?: unknown[]
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function FlashcardConfigPage() {
  const navigate = useNavigate()
  const { summaryId } = useParams()
  const [deckName, setDeckName] = useState('Flashcards')
  const [baseDeckName, setBaseDeckName] = useState('Flashcards')
  const [cardCount, setCardCount] = useState([20])
  const [availableTopics, setAvailableTopics] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [strategy, setStrategy] = useState<Strategy>('definitions')
  const [enableSpacedRepetition, setEnableSpacedRepetition] = useState(true)
  const [includeMnemonics, setIncludeMnemonics] = useState(false)
  const [includeExamples, setIncludeExamples] = useState(true)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  // Load summary info
  useEffect(() => {
    if (!summaryId) return
    let isMounted = true

    api.summaries.get(summaryId).then((data: SummaryWithTopics) => {
      if (!isMounted) return

      const resolvedDeckName = `Flashcards: ${data.title || 'Untitled'}`
      setDeckName(resolvedDeckName)
      setBaseDeckName(resolvedDeckName)

      const rawTopics: unknown[] = Array.isArray(data.topics)
        ? data.topics
        : Array.isArray(data.tags)
          ? data.tags
          : []

      const normalizedTopics = rawTopics
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const dedupedTopics: string[] = Array.from(new Set(normalizedTopics))
      setAvailableTopics(dedupedTopics)
      setSelectedTopics(dedupedTopics)
      setError('')
    }).catch((err: unknown) => {
      if (!isMounted) return

      setAvailableTopics([])
      setSelectedTopics([])
      setError(getErrorMessage(err, 'Failed to load summary details. You can still configure manually.'))
    })

    return () => {
      isMounted = false
    }
  }, [summaryId])

  const quickCardCounts = [10, 20, 30, 40, 50]
  const hasTopicOptions = availableTopics.length > 0
  const selectedTopicCount = selectedTopics.length
  const trimmedDeckName = deckName.trim()
  const isDeckNameInvalid = trimmedDeckName.length === 0
  const isGenerateDisabled =
    isGenerating ||
    isDeckNameInvalid ||
    (hasTopicOptions && selectedTopicCount === 0)
  const strategyLabel = strategy === 'qa' ? 'Q&A' : 'Term'
  const estimatedMinutes = Math.max(5, Math.round(cardCount[0] * (strategy === 'qa' ? 0.9 : 0.7)))

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) => {
      if (prev.includes(topic)) {
        return prev.filter((t) => t !== topic)
      }
      return [...prev, topic]
    })
  }

  const handleResetConfig = () => {
    setDeckName(baseDeckName)
    setCardCount([20])
    setStrategy('definitions')
    setEnableSpacedRepetition(true)
    setIncludeMnemonics(false)
    setIncludeExamples(true)
    setSelectedTopics(availableTopics)
    setIsFlipped(false)
    setError('')
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError('')
    try {
      if (!summaryId) {
        throw new Error('Missing summary ID')
      }

      if (trimmedDeckName.length === 0) {
        throw new Error('Please enter a deck name')
      }

      if (availableTopics.length > 0 && selectedTopics.length === 0) {
        throw new Error('Please select at least one topic for this deck')
      }

      const strategyValue = strategy === 'qa' ? 'question_answer' : 'term_definition'

      const result = await api.flashcards.generate({
        summary_id: summaryId,
        title: trimmedDeckName,
        num_cards: cardCount[0],
        strategy: strategyValue,
        topics: selectedTopics,
        enable_spaced_repetition: enableSpacedRepetition,
        include_mnemonics: includeMnemonics,
        include_examples: includeExamples,
      })

      const jobId = result.job?.id || result.job_id
      const deckId = result.deck?.id || result.deck_id

      if (jobId) {
        navigate(`/processing/${jobId}`)
      } else if (deckId) {
        navigate(`/flashcards/study/${deckId}`)
      } else {
        throw new Error('Flashcard generation did not return a job or deck id')
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to generate flashcards'))
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-primary/5 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-12 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 -bottom-16 h-40 w-40 rounded-full bg-indigo-400/10 blur-3xl" />

          <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Create Flashcards</h1>
              <p className="mt-2 text-muted-foreground max-w-2xl">
                Tune your deck strategy and options, then generate study cards optimized for retention.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border bg-card/90 px-3 py-2">
                <p className="text-muted-foreground">Cards</p>
                <p className="font-semibold text-foreground">{cardCount[0]}</p>
              </div>
              <div className="rounded-xl border bg-card/90 px-3 py-2">
                <p className="text-muted-foreground">Strategy</p>
                <p className="font-semibold text-foreground">{strategyLabel}</p>
              </div>
              <div className="rounded-xl border bg-card/90 px-3 py-2">
                <p className="text-muted-foreground">Topics</p>
                <p className="font-semibold text-foreground">
                  {hasTopicOptions ? `${selectedTopicCount}/${availableTopics.length}` : 'All'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column - Configuration */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="rounded-2xl border shadow-sm overflow-hidden">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <SlidersHorizontal className="h-5 w-5 text-primary" />
                      Deck Settings
                    </CardTitle>
                    <CardDescription>Customize how your flashcards are generated.</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={handleResetConfig}
                    disabled={isGenerating}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-2">
                  <Label htmlFor="deck-name">Deck Name</Label>
                  <Input
                    id="deck-name"
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    aria-invalid={isDeckNameInvalid}
                    className={cn(
                      'h-11',
                      isDeckNameInvalid && 'border-destructive focus-visible:ring-destructive',
                    )}
                  />
                  {isDeckNameInvalid && (
                    <p className="text-xs text-destructive">Deck name is required.</p>
                  )}
                </div>

                <div className="space-y-4 border-t pt-6">
                  <div className="flex justify-between items-center">
                    <Label className="inline-flex items-center gap-2">
                      <NotebookPen className="h-4 w-4 text-primary" />
                      Number of Cards
                    </Label>
                    <span className="font-mono text-sm bg-secondary px-2.5 py-1 rounded-md border">{cardCount[0]}</span>
                  </div>
                  <Slider
                    defaultValue={[20]}
                    max={50}
                    step={5}
                    min={5}
                    value={cardCount}
                    onValueChange={setCardCount}
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {quickCardCounts.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCardCount([preset])}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          cardCount[0] === preset
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'hover:bg-secondary/60',
                        )}
                      >
                        {preset} cards
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <Label>Card Strategy</Label>
                  <div className="grid grid-cols-1 gap-3">
                    <label
                      htmlFor="definitions"
                      className={cn(
                        'flex w-full items-start space-x-3 border p-4 rounded-xl cursor-pointer transition-all text-left',
                        strategy === 'definitions'
                          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                          : 'hover:bg-secondary/20 hover:border-primary/30'
                      )}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        id="definitions"
                        checked={strategy === 'definitions'}
                        onChange={() => setStrategy('definitions')}
                        className="mt-0.5 h-4 w-4 border-gray-300 dark:border-slate-600 text-primary focus:ring-primary"
                      />
                      <span className="grid gap-1">
                        <span className="text-sm font-medium leading-none inline-flex items-center gap-2">
                          <BookOpenText className="h-4 w-4 text-primary" />
                          Term & Definition
                        </span>
                        <span className="text-xs text-muted-foreground">Standard vocabulary cards</span>
                      </span>
                    </label>
                    <label
                      htmlFor="qa"
                      className={cn(
                        'flex w-full items-start space-x-3 border p-4 rounded-xl cursor-pointer transition-all text-left',
                        strategy === 'qa'
                          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                          : 'hover:bg-secondary/20 hover:border-primary/30'
                      )}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        id="qa"
                        checked={strategy === 'qa'}
                        onChange={() => setStrategy('qa')}
                        className="mt-0.5 h-4 w-4 border-gray-300 dark:border-slate-600 text-primary focus:ring-primary"
                      />
                      <span className="grid gap-1">
                        <span className="text-sm font-medium leading-none inline-flex items-center gap-2">
                          <Brain className="h-4 w-4 text-primary" />
                          Question & Answer
                        </span>
                        <span className="text-xs text-muted-foreground">Conceptual questions based on key points</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <Label>Options</Label>
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5 bg-muted/10">
                      <div className="space-y-1">
                        <label htmlFor="spaced-repetition" className="text-sm font-medium inline-flex items-center gap-2">
                          <Wand2 className="h-4 w-4 text-primary" />
                          Enable Spaced Repetition
                        </label>
                        <p className="text-xs text-muted-foreground">Prioritizes challenging cards during study rounds.</p>
                      </div>
                      <Checkbox id="spaced-repetition" checked={enableSpacedRepetition} onCheckedChange={(checked) => setEnableSpacedRepetition(Boolean(checked))} />
                    </div>
                    <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5 bg-muted/10">
                      <div className="space-y-1">
                        <label htmlFor="mnemonics" className="text-sm font-medium inline-flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-primary" />
                          Include Mnemonic Hints
                        </label>
                        <p className="text-xs text-muted-foreground">Adds memory anchors and association cues.</p>
                      </div>
                      <Checkbox id="mnemonics" checked={includeMnemonics} onCheckedChange={(checked) => setIncludeMnemonics(Boolean(checked))} />
                    </div>
                    <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5 bg-muted/10">
                      <div className="space-y-1">
                        <label htmlFor="examples" className="text-sm font-medium inline-flex items-center gap-2">
                          <BookOpenText className="h-4 w-4 text-primary" />
                          Include Contextual Examples
                        </label>
                        <p className="text-xs text-muted-foreground">Shows practical usage to reinforce understanding.</p>
                      </div>
                      <Checkbox id="examples" checked={includeExamples} onCheckedChange={(checked) => setIncludeExamples(Boolean(checked))} />
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>

            {availableTopics.length > 0 && (
              <Card className="rounded-2xl border shadow-sm overflow-hidden">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="inline-flex items-center gap-2">
                        <Tags className="h-5 w-5 text-primary" />
                        Topics Covered
                      </CardTitle>
                      <CardDescription>Select which topics to include in the deck.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        {selectedTopicCount}/{availableTopics.length} selected
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTopics(availableTopics)}
                        disabled={selectedTopicCount === availableTopics.length}
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTopics([])}
                        disabled={selectedTopicCount === 0}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {availableTopics.map((topic) => {
                      const isSelected = selectedTopics.includes(topic)
                      return (
                        <button
                          type="button"
                          key={topic}
                          className={cn(
                            'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                          )}
                          onClick={() => toggleTopic(topic)}
                        >
                          {topic}
                          {isSelected && <CheckCircle2 className="ml-2 h-3 w-3" />}
                        </button>
                      )
                    })}
                  </div>

                  {selectedTopicCount === 0 && (
                    <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      Select at least one topic to generate this deck.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="lg:hidden">
              <Button size="lg" className="w-full h-12 text-base shadow-sm" onClick={handleGenerate} disabled={isGenerateDisabled}>
                {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Generate Flashcards
              </Button>
            </div>
          </div>

          {/* Right Column - Live Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-24">
              <Card className="rounded-2xl border shadow-sm overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Card Preview</h3>
                    <Badge variant="outline" className="text-xs">Sample Card</Badge>
                  </div>
                  <CardDescription>
                    {strategy === 'qa'
                      ? 'Question-first cards focused on concept recall.'
                      : 'Term-definition cards for fast memorization.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    aria-label="Flip sample flashcard preview"
                    aria-pressed={isFlipped}
                    className="h-64 w-full cursor-pointer group text-left [perspective:1000px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
                    onClick={() => setIsFlipped((prev) => !prev)}
                  >
                    <div
                      className={cn(
                        'relative h-full w-full transition-all duration-500 [transform-style:preserve-3d] shadow-xl rounded-xl',
                        isFlipped ? '[transform:rotateY(180deg)]' : '',
                      )}
                    >
                      <div className="absolute inset-0 h-full w-full bg-card border rounded-xl p-8 flex flex-col items-center justify-center text-center [backface-visibility:hidden]">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                          {strategy === 'definitions' ? 'Term' : 'Question'}
                        </span>
                        <h3 className="text-2xl font-bold">
                          {strategy === 'definitions' ? 'Supervised Learning' : 'What is supervised learning?'}
                        </h3>
                        {includeMnemonics && (
                          <p className="mt-4 text-xs rounded-full border px-3 py-1 bg-background/70 text-muted-foreground">
                            Mnemonic: think “teacher + labeled data”.
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-4">(Click to flip)</p>
                      </div>
                      <div className="absolute inset-0 h-full w-full bg-primary text-primary-foreground rounded-xl p-8 flex flex-col items-center justify-center text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70 mb-4">
                          {strategy === 'definitions' ? 'Definition' : 'Answer'}
                        </span>
                        <p className="text-lg font-medium leading-relaxed">
                          A type of machine learning where the algorithm learns from labeled training data, and makes predictions based on that data.
                        </p>
                        {includeExamples && (
                          <p className="text-xs mt-4 rounded-lg bg-primary-foreground/15 px-3 py-2">
                            Example: predicting house prices from labeled past sales.
                          </p>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-lg border px-3 py-2 bg-muted/10 inline-flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      {includeMnemonics ? 'Mnemonics on' : 'Mnemonics off'}
                    </div>
                    <div className="rounded-lg border px-3 py-2 bg-muted/10 inline-flex items-center gap-2">
                      <BookOpenText className="h-3.5 w-3.5 text-primary" />
                      {includeExamples ? 'Examples on' : 'Examples off'}
                    </div>
                  </div>

                  <div className="mt-8">
                    <Button
                      size="lg"
                      className="w-full h-12 text-base shadow-md"
                      onClick={handleGenerate}
                      disabled={isGenerateDisabled}
                    >
                      {isGenerating ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Layers className="mr-2 h-5 w-5" />
                      )}
                      Generate Flashcards
                    </Button>
                    <p className="text-xs text-center text-muted-foreground mt-3 inline-flex items-center justify-center gap-1.5 w-full">
                      <Sparkles className="h-3.5 w-3.5" />
                      Creating {cardCount[0]} cards optimized for learning in ~{estimatedMinutes} minutes...
                    </p>

                    {hasTopicOptions && selectedTopicCount === 0 && (
                      <p className="mt-2 text-xs text-center text-destructive">
                        Select at least one topic before generating.
                      </p>
                    )}

                    {isDeckNameInvalid && (
                      <p className="mt-2 text-xs text-center text-destructive">
                        Enter a deck name before generating.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

    </AppLayout>
  )
}
