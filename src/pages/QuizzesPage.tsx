import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type QuizListItemResponse, type QuizQuestionResponse } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { useToast } from '../components/ui/Toast'
import {
  BrainCircuit,
  Trophy,
  Target,
  Flame,
  Sparkles,
  SlidersHorizontal,
  Plus,
  RotateCcw,
  Eye,
  Calendar,
  Loader2,
  Search,
  Star,
} from 'lucide-react'
import { cn } from '../lib/utils'

export function QuizzesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [quizzes, setQuizzes] = useState<QuizListItemResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [favoritePendingIds, setFavoritePendingIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest')
  const [quickFilter, setQuickFilter] = useState<'all' | 'starred' | 'new' | 'completed' | 'easy' | 'medium' | 'hard'>('all')
  const loadRequestIdRef = useRef(0)

  type DifficultyValue = 'easy' | 'medium' | 'hard'

  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value)
    }
    return null
  }

  const safeParseJSON = (value: unknown): unknown => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  const loadQuizzes = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current

    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await api.quizzes.list()
      if (requestId !== loadRequestIdRef.current) {
        return
      }

      setQuizzes(data.quizzes || [])
    } catch (err: unknown) {
      if (requestId !== loadRequestIdRef.current) {
        return
      }

      setQuizzes([])
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to load quizzes'
      setLoadError(message)
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadQuizzes()

    return () => {
      loadRequestIdRef.current += 1
    }
  }, [loadQuizzes])

  const isQuizStarred = (quizId: string) => {
    const quiz = quizzes.find((q) => q.id === quizId)
    return Boolean(quiz?.is_favorite)
  }

  const isFavoritePending = (quizId: string) => favoritePendingIds.includes(quizId)

  const toggleFavorite = async (quizId: string) => {
    if (isFavoritePending(quizId)) return

    const current = isQuizStarred(quizId)
    setFavoritePendingIds((prev) => [...prev, quizId])

    setQuizzes((prev) =>
      prev.map((q) =>
        q.id === quizId
          ? { ...q, is_favorite: !current }
          : q,
      ),
    )

    try {
      await api.quizzes.toggleFavorite(quizId)
    } catch (err: unknown) {
      setQuizzes((prev) =>
        prev.map((q) =>
          q.id === quizId
            ? { ...q, is_favorite: current }
            : q,
        ),
      )

      const message = err instanceof ApiError
        ? err.status === 404
          ? 'Favorites endpoint is unavailable. Please update/restart backend and try again.'
          : err.message
        : err instanceof Error
          ? err.message
          : 'Failed to update favorite'
      toast.error(message)
    } finally {
      setFavoritePendingIds((prev) => prev.filter((id) => id !== quizId))
    }
  }

  // Compute stats from real data
  const completedQuizzes = quizzes.filter((q) => q.last_score !== undefined && q.last_score !== null)
  const avgScore = completedQuizzes.length > 0
    ? Math.round(completedQuizzes.reduce((s: number, q) => s + (toNumber(q.last_score) ?? 0), 0) / completedQuizzes.length)
    : 0

  const stats = [
    {
      label: 'Total',
      value: String(quizzes.length),
      icon: BrainCircuit,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
    },
    {
      label: 'Avg Score',
      value: `${avgScore}%`,
      icon: Target,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      label: 'Completed',
      value: String(completedQuizzes.length),
      icon: Trophy,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
  ]

  const getScoreColor = (score: number) => {
    if (score >= 90) return { text: 'text-green-600', stroke: '#16a34a', bg: 'bg-green-50' }
    if (score >= 70) return { text: 'text-blue-600', stroke: '#2563eb', bg: 'bg-blue-50' }
    if (score >= 50) return { text: 'text-orange-600', stroke: '#ea580c', bg: 'bg-orange-50' }
    return { text: 'text-red-600', stroke: '#dc2626', bg: 'bg-red-50' }
  }

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'Easy': case 'easy': case '1': return 'bg-green-100 text-green-700 border-green-200'
      case 'Medium': case 'medium': case '2': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'Hard': case 'hard': case '3': return 'bg-red-100 text-red-700 border-red-200'
      default: return 'bg-secondary text-secondary-foreground'
    }
  }

  const getDifficultyLabel = (diff: unknown): 'Easy' | 'Medium' | 'Hard' => {
    if (diff === 1 || diff === 'easy') return 'Easy'
    if (diff === 2 || diff === 'medium') return 'Medium'
    if (diff === 3 || diff === 'hard') return 'Hard'
    if (typeof diff === 'string') {
      const normalized = diff.trim().toLowerCase()
      if (normalized === 'easy') return 'Easy'
      if (normalized === 'hard') return 'Hard'
    }
    return 'Medium'
  }

  const resolveQuizDifficulty = (quiz: QuizListItemResponse): unknown => {
    const direct = quiz?.difficulty
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
      return direct
    }

    const config = safeParseJSON(quiz?.config)
    const fromConfigRaw =
      config && typeof config === 'object' && !Array.isArray(config)
        ? (config as Record<string, unknown>).difficulty
        : undefined
    const fromConfig =
      typeof fromConfigRaw === 'string' || typeof fromConfigRaw === 'number'
        ? fromConfigRaw
        : undefined
    if (fromConfig !== undefined && fromConfig !== null && String(fromConfig).trim() !== '') {
      return fromConfig
    }

    const parsedQuestions = safeParseJSON(quiz?.questions)
    const questions = Array.isArray(parsedQuestions)
      ? parsedQuestions as QuizQuestionResponse[]
      : undefined
    if (Array.isArray(questions) && questions.length > 0) {
      const fromQuestion = questions[0]?.difficulty
      if (fromQuestion !== undefined && fromQuestion !== null && String(fromQuestion).trim() !== '') {
        return fromQuestion
      }
    }

    return 'medium'
  }

  const normalizeDifficulty = (diff: unknown): DifficultyValue => {
    const value = String(diff ?? '').toLowerCase().trim()
    if (value === '1' || value === 'easy') return 'easy'
    if (value === '3' || value === 'hard') return 'hard'
    return 'medium'
  }

  const getQuestionCount = (quiz: QuizListItemResponse): number => {
    const direct = toNumber(quiz.question_count)
    if (direct !== null) return direct

    const parsed = safeParseJSON(quiz.questions)
    return Array.isArray(parsed) ? parsed.length : 0
  }

  const filterOptions: Array<{ key: typeof quickFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'starred', label: 'Starred' },
    { key: 'new', label: 'New' },
    { key: 'completed', label: 'Completed' },
    { key: 'easy', label: 'Easy' },
    { key: 'medium', label: 'Medium' },
    { key: 'hard', label: 'Hard' },
  ]

  const filteredQuizzes = quizzes
    .filter((quiz) => {
      const title = String(quiz?.title || '').toLowerCase()
      const sourceSummary = String(quiz?.source_summary || '').toLowerCase()
      const query = searchQuery.trim().toLowerCase()

      const matchesSearch =
        !query || title.includes(query) || sourceSummary.includes(query)

      if (!matchesSearch) return false

      if (quickFilter === 'all') return true

      if (quickFilter === 'starred') {
        return Boolean(quiz.is_favorite)
      }

      const hasScore = quiz.last_score !== undefined && quiz.last_score !== null
      if (quickFilter === 'new') return !hasScore
      if (quickFilter === 'completed') return hasScore

      const difficultyValue = normalizeDifficulty(resolveQuizDifficulty(quiz))
      return difficultyValue === quickFilter
    })
    .sort((a, b) => {
      if (sortOrder === 'az') {
        return String(a?.title || '').localeCompare(String(b?.title || ''))
      }

      const aDate = a?.created_at ? new Date(a.created_at).getTime() : 0
      const bDate = b?.created_at ? new Date(b.created_at).getTime() : 0

      if (sortOrder === 'oldest') {
        return aDate - bDate
      }

      return bDate - aDate
    })

  const starredQuizzesCount = quizzes.filter((q) => Boolean(q.is_favorite)).length
  const newQuizzesCount = quizzes.filter((q) => q.last_score === undefined || q.last_score === null).length
  const completedQuizzesCount = completedQuizzes.length

  const getQuickFilterCount = (key: typeof quickFilter) => {
    if (key === 'all') return quizzes.length
    if (key === 'starred') return starredQuizzesCount
    if (key === 'new') return newQuizzesCount
    if (key === 'completed') return completedQuizzesCount

    return quizzes.filter((quiz) => normalizeDifficulty(resolveQuizDifficulty(quiz)) === key).length
  }

  const ScoreRing = ({ score }: { score: number }) => {
    const radius = 24
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (score / 100) * circumference
    const colors = getScoreColor(score)
    return (
      <div className="relative flex items-center justify-center h-16 w-16">
        <svg className="transform -rotate-90 w-full h-full">
          <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent" className="text-secondary" />
          <circle cx="32" cy="32" r={radius} stroke={colors.stroke} strokeWidth="4" fill="transparent"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
            className="transition-all duration-1000 ease-out" />
        </svg>
        <div className={cn('absolute inset-0 flex items-center justify-center font-bold text-sm', colors.text)}>
          {score}%
        </div>
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-secondary/25 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-purple-400/10 blur-3xl" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold tracking-tight">My Quizzes</h1>
                <Badge variant="secondary" className="rounded-full px-3">{quizzes.length}</Badge>
              </div>
              <p className="text-muted-foreground">Review your performance and retake assessments.</p>
            </div>

            <Button variant="outline" className="bg-background/80 backdrop-blur" onClick={() => navigate('/summaries')}>
              <Plus className="h-4 w-4 mr-2" />
              Create Quiz
            </Button>
          </div>

          <div className="relative mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((stat) => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="rounded-xl border bg-card/90 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{stat.value}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Controls */}
        <Card className="border shadow-sm">
          <CardContent className="p-4 md:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search quizzes..."
                  className="pl-9 transition-all focus-visible:ring-primary"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap hidden md:inline">
                  <SlidersHorizontal className="h-4 w-4 inline mr-1" />
                  Sort:
                </span>
                <div className="flex bg-secondary/50 rounded-lg p-1 border">
                  <button
                    onClick={() => setSortOrder('newest')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                      sortOrder === 'newest'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Newest
                  </button>
                  <button
                    onClick={() => setSortOrder('oldest')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                      sortOrder === 'oldest'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Oldest
                  </button>
                  <button
                    onClick={() => setSortOrder('az')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                      sortOrder === 'az'
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    A-Z
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {filterOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setQuickFilter(option.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors',
                    quickFilter === option.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground hover:text-foreground border-border',
                  )}
                >
                  <span>{option.label}</span>
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                    quickFilter === option.key
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground',
                  )}>
                    {getQuickFilterCount(option.key)}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : loadError ? (
          <div className="text-center py-16 border rounded-xl bg-secondary/10">
            <h3 className="text-lg font-semibold mb-2">Failed to load quizzes</h3>
            <p className="text-muted-foreground mb-4">{loadError}</p>
            <Button onClick={loadQuizzes}>Retry</Button>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BrainCircuit className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No quizzes yet</h3>
            <p className="text-muted-foreground mb-4">Create a summary first, then generate a quiz from it.</p>
            <Button onClick={() => navigate('/create')}>Create Content</Button>
          </div>
        ) : filteredQuizzes.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredQuizzes.map((quiz) => {
              const difficultyValue = resolveQuizDifficulty(quiz)
              const starred = Boolean(quiz.is_favorite)
              return (
                <Card
                  key={quiz.id}
                  className="group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border relative overflow-hidden"
                  onClick={() => navigate(`/quiz/results/${quiz.last_attempt_id || quiz.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigate(`/quiz/results/${quiz.last_attempt_id || quiz.id}`)
                    }
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500/60 via-teal-500/40 to-cyan-500/30" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="p-6 relative z-10">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex gap-4 min-w-0">
                        <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                          <BrainCircuit className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors mb-1">
                            {quiz.title}
                          </h3>
                          {quiz.source_summary && (
                            <p className="text-sm text-muted-foreground mb-2">
                              Based on: {quiz.source_summary}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1 rounded-md bg-secondary/40 px-2 py-1">
                              <Calendar className="h-3 w-3" />
                              {quiz.created_at ? new Date(quiz.created_at).toLocaleDateString() : ''}
                            </div>
                            <Badge
                              variant="outline"
                              className={cn('font-normal text-xs h-5 border', getDifficultyColor(String(difficultyValue)))}
                            >
                              {getDifficultyLabel(difficultyValue)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {quiz.last_score !== undefined && quiz.last_score !== null ? (
                          <ScoreRing score={toNumber(quiz.last_score) ?? 0} />
                        ) : (
                          <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">New</span>
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap font-medium">
                          {getQuestionCount(quiz) || '?'} Questions
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-6 pt-4 border-t opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                      <Button variant="outline" size="sm"
                        className="flex-1 h-9 text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                        onClick={(e) => { e.stopPropagation(); navigate(`/quiz/take/${quiz.id}`) }}
                      >
                        <RotateCcw className="mr-2 h-3 w-3" /> {quiz.last_score !== undefined ? 'Retake' : 'Take Quiz'}
                      </Button>
                      <Button variant="ghost" size="sm"
                        className="flex-1 h-9 text-xs font-medium hover:bg-secondary"
                        onClick={(e) => { e.stopPropagation(); navigate(`/quiz/results/${quiz.last_attempt_id || quiz.id}`) }}
                      >
                        <Eye className="mr-2 h-3 w-3" /> View Results
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isFavoritePending(quiz.id)}
                        title={starred ? 'Remove from favorites' : 'Add to favorites'}
                        className={cn(
                          'h-9 px-3 text-xs font-medium border',
                          starred
                            ? 'text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100'
                            : 'text-muted-foreground border-border hover:bg-secondary',
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFavorite(quiz.id)
                        }}
                      >
                        {isFavoritePending(quiz.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Star className={cn('h-3.5 w-3.5', starred ? 'fill-amber-500 text-amber-500' : '')} />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-xl bg-secondary/10">
            <h3 className="text-lg font-semibold mb-2">No quizzes match your filters</h3>
            <p className="text-muted-foreground mb-4">Try changing search terms or filters.</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
