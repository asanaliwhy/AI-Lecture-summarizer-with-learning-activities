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
  BrainCircuit,
  Clock,
  HelpCircle,
  Shuffle,
  CheckCircle2,
  Loader2,
  SlidersHorizontal,
  RotateCcw,
  NotebookPen,
  ListChecks,
  Sparkles,
  Tags,
} from 'lucide-react'
import { cn } from '../lib/utils'

type SummaryWithTopics = Awaited<ReturnType<typeof api.summaries.get>> & {
  topics?: unknown[]
  tags?: unknown[]
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function QuizConfigPage() {
  const navigate = useNavigate()
  const { summaryId } = useParams()
  const [quizTitle, setQuizTitle] = useState('Quiz')
  const [baseQuizTitle, setBaseQuizTitle] = useState('Quiz')
  const [questionCount, setQuestionCount] = useState([10])
  const [difficulty, setDifficulty] = useState([2])
  const [availableTopics, setAvailableTopics] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [questionTypes, setQuestionTypes] = useState<string[]>(['multiple_choice', 'true_false'])
  const [enableTimer, setEnableTimer] = useState(false)
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [enableHints, setEnableHints] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  // Load summary info to pre-fill the quiz title and topics
  useEffect(() => {
    if (!summaryId) return
    let isMounted = true

    api.summaries.get(summaryId).then((data: SummaryWithTopics) => {
      if (!isMounted) return

      const resolvedTitle = `Quiz: ${data.title || 'Untitled'}`
      setQuizTitle(resolvedTitle)
      setBaseQuizTitle(resolvedTitle)

      const rawTopics: unknown[] = Array.isArray(data.topics)
        ? data.topics
        : Array.isArray(data.tags)
          ? data.tags
          : []

      const normalizedTopics = rawTopics
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const dedupedTopics: string[] = Array.from(
        new Set(
          normalizedTopics,
        ),
      )

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

  const quickQuestionCounts = [5, 10, 15, 20, 30, 40, 50]
  const hasTopicOptions = availableTopics.length > 0
  const selectedTopicCount = selectedTopics.length

  const difficultyLabel =
    difficulty[0] === 1 ? 'Beginner' : difficulty[0] === 2 ? 'Intermediate' : 'Advanced'

  const difficultyValue =
    difficulty[0] === 1 ? 'easy' : difficulty[0] === 2 ? 'medium' : 'hard'

  const estimatedMinutes = Math.max(
    5,
    Math.round(questionCount[0] * (enableTimer ? 0.8 : 0.6)),
  )

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) => {
      if (prev.includes(topic)) {
        return prev.filter((t) => t !== topic)
      }
      return [...prev, topic]
    })
  }

  const toggleQuestionType = (type: 'multiple_choice' | 'true_false', checked: boolean) => {
    setQuestionTypes((prev) => {
      if (checked) return Array.from(new Set([...prev, type]))
      const next = prev.filter((t) => t !== type)
      return next.length ? next : ['multiple_choice']
    })
  }

  const handleResetConfig = () => {
    setQuizTitle(baseQuizTitle)
    setQuestionCount([10])
    setDifficulty([2])
    setQuestionTypes(['multiple_choice', 'true_false'])
    setEnableTimer(false)
    setShuffleQuestions(true)
    setEnableHints(true)
    setSelectedTopics(availableTopics)
    setError('')
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError('')
    try {
      if (!summaryId) {
        throw new Error('Missing summary ID')
      }

      if (availableTopics.length > 0 && selectedTopics.length === 0) {
        throw new Error('Please select at least one topic for this quiz')
      }

      if (questionTypes.length === 0) {
        throw new Error('Select at least one question type')
      }

      const result = await api.quizzes.generate({
        summary_id: summaryId,
        title: quizTitle,
        num_questions: questionCount[0],
        difficulty: difficultyValue,
        question_types: questionTypes,
        enable_timer: enableTimer,
        shuffle_questions: shuffleQuestions,
        enable_hints: enableHints,
        topics: selectedTopics,
      })
      if (result.job_id) {
        navigate(`/processing/${result.job_id}`)
      } else if (result.quiz_id) {
        navigate(`/quiz/take/${result.quiz_id}`)
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to generate quiz'))
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
              <h1 className="text-3xl font-bold tracking-tight">Create Quiz</h1>
              <p className="mt-2 text-muted-foreground max-w-2xl">
                Tune quiz strategy and options, then generate questions optimized for recall.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border bg-card/90 px-3 py-2">
                <p className="text-muted-foreground">Questions</p>
                <p className="font-semibold text-foreground">{questionCount[0]}</p>
              </div>
              <div className="rounded-xl border bg-card/90 px-3 py-2">
                <p className="text-muted-foreground">Difficulty</p>
                <p className="font-semibold text-foreground">{difficultyLabel}</p>
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
                      Quiz Settings
                    </CardTitle>
                    <CardDescription>Customize how your quiz is generated.</CardDescription>
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
                  <Label htmlFor="quiz-title">Quiz Title</Label>
                  <Input
                    id="quiz-title"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
                    className="h-11"
                  />
                </div>

                <div className="space-y-4 border-t pt-6">
                  <div className="flex justify-between items-center">
                    <Label className="inline-flex items-center gap-2">
                      <NotebookPen className="h-4 w-4 text-primary" />
                      Number of Questions
                    </Label>
                    <span className="font-mono text-sm bg-secondary px-2.5 py-1 rounded-md border">
                      {questionCount[0]}
                    </span>
                  </div>
                  <Slider
                    defaultValue={[10]}
                    max={50}
                    step={5}
                    min={5}
                    value={questionCount}
                    onValueChange={setQuestionCount}
                  />

                  <div className="flex flex-wrap gap-2 pt-1">
                    {quickQuestionCounts.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuestionCount([preset])}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          questionCount[0] === preset
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'hover:bg-secondary/60',
                        )}
                      >
                        {preset} questions
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 border-t pt-6">
                  <div className="flex justify-between items-center">
                    <Label className="inline-flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Difficulty Level
                    </Label>
                    <span className="text-sm font-medium text-primary">
                      {difficultyLabel}
                    </span>
                  </div>
                  <Slider
                    defaultValue={[2]}
                    max={3}
                    step={1}
                    min={1}
                    value={difficulty}
                    onValueChange={setDifficulty}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground px-1">
                    <span>Beginner</span>
                    <span>Intermediate</span>
                    <span>Advanced</span>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <Label>Question Types</Label>
                  <div className="grid grid-cols-1 gap-3">
                    <label
                      htmlFor="multiple-choice"
                      className={cn(
                        'flex w-full items-start space-x-3 border p-4 rounded-xl cursor-pointer transition-all text-left',
                        questionTypes.includes('multiple_choice')
                          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                          : 'hover:bg-secondary/20 hover:border-primary/30',
                      )}
                    >
                      <Checkbox
                        id="multiple-choice"
                        checked={questionTypes.includes('multiple_choice')}
                        onCheckedChange={(checked) => toggleQuestionType('multiple_choice', Boolean(checked))}
                      />
                      <span className="grid gap-1">
                        <span className="text-sm font-medium leading-none inline-flex items-center gap-2">
                          <ListChecks className="h-4 w-4 text-primary" />
                          Multiple Choice
                        </span>
                        <span className="text-xs text-muted-foreground">Standard 4-option questions.</span>
                      </span>
                    </label>

                    <label
                      htmlFor="true-false"
                      className={cn(
                        'flex w-full items-start space-x-3 border p-4 rounded-xl cursor-pointer transition-all text-left',
                        questionTypes.includes('true_false')
                          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                          : 'hover:bg-secondary/20 hover:border-primary/30',
                      )}
                    >
                      <Checkbox
                        id="true-false"
                        checked={questionTypes.includes('true_false')}
                        onCheckedChange={(checked) => toggleQuestionType('true_false', Boolean(checked))}
                      />
                      <span className="grid gap-1">
                        <span className="text-sm font-medium leading-none inline-flex items-center gap-2">
                          <BrainCircuit className="h-4 w-4 text-primary" />
                          True / False
                        </span>
                        <span className="text-xs text-muted-foreground">Quick concept checks.</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <Label>Options</Label>
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5 bg-muted/10">
                      <div className="space-y-1">
                        <label htmlFor="timer" className="text-sm font-medium inline-flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          Enable Timer (30s per question)
                        </label>
                        <p className="text-xs text-muted-foreground">Adds pressure for realistic test pacing.</p>
                      </div>
                      <Checkbox id="timer" checked={enableTimer} onCheckedChange={(checked) => setEnableTimer(Boolean(checked))} />
                    </div>

                    <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5 bg-muted/10">
                      <div className="space-y-1">
                        <label htmlFor="shuffle" className="text-sm font-medium inline-flex items-center gap-2">
                          <Shuffle className="h-4 w-4 text-primary" />
                          Shuffle Questions
                        </label>
                        <p className="text-xs text-muted-foreground">Randomizes order to reduce pattern memorization.</p>
                      </div>
                      <Checkbox id="shuffle" checked={shuffleQuestions} onCheckedChange={(checked) => setShuffleQuestions(Boolean(checked))} />
                    </div>

                    <div className="flex items-start justify-between gap-4 rounded-xl border p-3.5 bg-muted/10">
                      <div className="space-y-1">
                        <label htmlFor="hints" className="text-sm font-medium inline-flex items-center gap-2">
                          <HelpCircle className="h-4 w-4 text-primary" />
                          Allow Hints
                        </label>
                        <p className="text-xs text-muted-foreground">Lets you reveal prompts during difficult questions.</p>
                      </div>
                      <Checkbox id="hints" checked={enableHints} onCheckedChange={(checked) => setEnableHints(Boolean(checked))} />
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
                      <CardDescription>Select which topics to include in the quiz.</CardDescription>
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
                      Select at least one topic to generate this quiz.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="lg:hidden">
              <Button size="lg" className="w-full h-12 text-base shadow-sm" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Generate Quiz
              </Button>
            </div>
          </div>

          {/* Right Column - Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-24">
              <Card className="rounded-2xl border shadow-sm overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Live Preview</h3>
                    <Badge variant="outline" className="text-xs">Sample Question</Badge>
                  </div>
                  <CardDescription>
                    Quiz will include {questionTypes.includes('multiple_choice') ? 'multiple choice' : ''}
                    {questionTypes.includes('multiple_choice') && questionTypes.includes('true_false') ? ' + ' : ''}
                    {questionTypes.includes('true_false') ? 'true/false' : ''} questions.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="border rounded-xl bg-card shadow-lg overflow-hidden relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20">
                      <div className="h-full bg-primary w-1/3"></div>
                    </div>
                    <div className="p-6 md:p-8 space-y-6">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Question 3 of {questionCount[0]}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {enableTimer ? '00:24' : 'No timer'}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold leading-tight">
                          Which type of machine learning algorithm is used when the output variable is continuous?
                        </h3>
                      </div>

                      <div className="space-y-3">
                        <div className="p-3 rounded-lg border-2 border-transparent bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors text-sm font-medium">
                          A. Classification
                        </div>
                        <div className="p-3 rounded-lg border-2 border-primary bg-primary/5 cursor-pointer transition-colors text-sm font-medium flex justify-between items-center">
                          <span>B. Regression</span>
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        </div>
                        <div className="p-3 rounded-lg border-2 border-transparent bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors text-sm font-medium">
                          C. Clustering
                        </div>
                        <div className="p-3 rounded-lg border-2 border-transparent bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors text-sm font-medium">
                          D. Dimensionality Reduction
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <div className={cn(
                          'flex items-center gap-2 text-xs',
                          enableHints
                            ? 'text-muted-foreground cursor-pointer hover:text-primary'
                            : 'text-muted-foreground/50',
                        )}>
                          <HelpCircle className="h-3 w-3" />
                          <span>{enableHints ? 'Show Hint' : 'Hints disabled'}</span>
                        </div>
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
                        <BrainCircuit className="mr-2 h-5 w-5" />
                      )}
                      Generate Quiz
                    </Button>
                    <p className="text-xs text-center text-muted-foreground mt-3 inline-flex items-center justify-center gap-1.5 w-full">
                      <Sparkles className="h-3.5 w-3.5" />
                      Creating {questionCount[0]} questions optimized for ~{estimatedMinutes} minutes...
                    </p>

                    {hasTopicOptions && selectedTopicCount === 0 && (
                      <p className="mt-2 text-xs text-center text-destructive">
                        Select at least one topic before generating.
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
