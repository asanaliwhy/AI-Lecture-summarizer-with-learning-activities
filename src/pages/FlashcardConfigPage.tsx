import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
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
import { Layers, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

export function FlashcardConfigPage() {
  const navigate = useNavigate()
  const { summaryId } = useParams()
  const [deckName, setDeckName] = useState('Flashcards')
  const [cardCount, setCardCount] = useState([20])
  const [topics, setTopics] = useState<string[]>([])
  const [strategy, setStrategy] = useState('definitions')
  const [isFlipped, setIsFlipped] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  // Load summary info
  useEffect(() => {
    if (!summaryId) return
    api.summaries.get(summaryId).then((data: any) => {
      setDeckName(`Flashcards: ${data.title || 'Untitled'}`)
      if (data.topics) setTopics(data.topics)
      else if (data.tags) setTopics(data.tags)
    }).catch(() => { })
  }, [summaryId])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError('')
    try {
      const result = await api.flashcards.generate({
        summary_id: summaryId,
        title: deckName,
        card_count: cardCount[0],
        strategy,
        topics,
      })
      if (result.job?.id) {
        navigate(`/processing/${result.job.id}`)
      } else if (result.deck?.id) {
        navigate(`/flashcards/study/${result.deck.id}`)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate flashcards')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Create Flashcards</h1>
          <p className="text-muted-foreground">
            Generate a study deck from your summary.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column - Configuration */}
          <div className="lg:col-span-7 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Deck Settings</CardTitle>
                <CardDescription>Customize how your flashcards are generated.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-2">
                  <Label htmlFor="deck-name">Deck Name</Label>
                  <Input
                    id="deck-name"
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Number of Cards</Label>
                    <span className="font-mono text-sm bg-secondary px-2 py-1 rounded">{cardCount[0]}</span>
                  </div>
                  <Slider
                    defaultValue={[20]}
                    max={50}
                    step={5}
                    min={5}
                    value={cardCount}
                    onValueChange={setCardCount}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Card Strategy</Label>
                  <div className="grid grid-cols-1 gap-3">
                    <div
                      className={cn(
                        'flex items-start space-x-3 border p-3 rounded-lg cursor-pointer transition-colors',
                        strategy === 'definitions' ? 'border-primary bg-primary/5' : 'hover:bg-secondary/20'
                      )}
                      onClick={() => setStrategy('definitions')}
                    >
                      <div className="mt-0.5">
                        <input
                          type="radio"
                          name="strategy"
                          id="definitions"
                          checked={strategy === 'definitions'}
                          onChange={() => setStrategy('definitions')}
                          className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label htmlFor="definitions" className="text-sm font-medium leading-none cursor-pointer">
                          Term & Definition
                        </label>
                        <p className="text-xs text-muted-foreground">Standard vocabulary cards</p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'flex items-start space-x-3 border p-3 rounded-lg cursor-pointer transition-colors',
                        strategy === 'qa' ? 'border-primary bg-primary/5' : 'hover:bg-secondary/20'
                      )}
                      onClick={() => setStrategy('qa')}
                    >
                      <div className="mt-0.5">
                        <input
                          type="radio"
                          name="strategy"
                          id="qa"
                          checked={strategy === 'qa'}
                          onChange={() => setStrategy('qa')}
                          className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label htmlFor="qa" className="text-sm font-medium leading-none cursor-pointer">
                          Question & Answer
                        </label>
                        <p className="text-xs text-muted-foreground">Conceptual questions based on key points</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Options</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="spaced-repetition" defaultChecked />
                      <label htmlFor="spaced-repetition" className="text-sm font-medium">Enable Spaced Repetition</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="mnemonics" />
                      <label htmlFor="mnemonics" className="text-sm font-medium">Include Mnemonic Hints</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="examples" defaultChecked />
                      <label htmlFor="examples" className="text-sm font-medium">Include Contextual Examples</label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {topics.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Topics Covered</CardTitle>
                  <CardDescription>Select which topics to include in the deck.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {topics.map((topic) => (
                      <Badge
                        key={topic}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors px-3 py-1 text-sm"
                      >
                        {topic} <CheckCircle2 className="ml-2 h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="lg:hidden">
              <Button size="lg" className="w-full" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Generate Flashcards
              </Button>
            </div>
          </div>

          {/* Right Column - Live Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Card Preview</h3>
                <Badge variant="outline" className="text-xs">Sample Card</Badge>
              </div>

              <div
                className="perspective-1000 h-64 w-full cursor-pointer group"
                onClick={() => setIsFlipped(!isFlipped)}
              >
                <div
                  className={cn(
                    'relative h-full w-full transition-all duration-500 transform-style-3d shadow-xl rounded-xl',
                    isFlipped ? 'rotate-y-180' : '',
                  )}
                >
                  <div className="absolute inset-0 h-full w-full bg-card border rounded-xl p-8 flex flex-col items-center justify-center text-center backface-hidden">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                      {strategy === 'definitions' ? 'Term' : 'Question'}
                    </span>
                    <h3 className="text-2xl font-bold">
                      {strategy === 'definitions' ? 'Supervised Learning' : 'What is supervised learning?'}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-4">(Click to flip)</p>
                  </div>
                  <div className="absolute inset-0 h-full w-full bg-primary text-primary-foreground rounded-xl p-8 flex flex-col items-center justify-center text-center backface-hidden rotate-y-180">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70 mb-4">
                      {strategy === 'definitions' ? 'Definition' : 'Answer'}
                    </span>
                    <p className="text-lg font-medium leading-relaxed">
                      A type of machine learning where the algorithm learns from labeled training data, and makes predictions based on that data.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <Button
                  size="lg"
                  className="w-full h-12 text-base shadow-md"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Layers className="mr-2 h-5 w-5" />
                  )}
                  Generate Flashcards
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Creating {cardCount[0]} cards optimized for learning...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </AppLayout>
  )
}
