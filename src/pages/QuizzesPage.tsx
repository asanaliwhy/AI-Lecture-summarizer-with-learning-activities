import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type QuizListItemResponse, type QuizQuestionResponse } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import {
  BrainCircuit,
  Trophy,
  Target,
  Flame,
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
  const [quizzes, setQuizzes] = useState<QuizListItemResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest')
  const [quickFilter, setQuickFilter] = useState<'all' | 'starred' | 'new' | 'completed' | 'easy' | 'medium' | 'hard'>('all')

  const toNumber = (value: any): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value)
    }
    return null
  }

  const safeParseJSON = (value: any) => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  useEffect(() => {
    async function load() {
      setLoadError(null)
      try {
        const data = await api.quizzes.list()
        setQuizzes(data.quizzes || [])
      } catch (err: unknown) {
        setQuizzes([])
        const message = err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load quizzes'
        setLoadError(message)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const isQuizStarred = (quizId: string) => {
    const quiz = quizzes.find((q) => q.id === quizId)
    return Boolean(quiz?.is_favorite)
  }

  const toggleFavorite = async (quizId: string) => {
    const current = isQuizStarred(quizId)

    setQuizzes((prev) =>
      prev.map((q) =>
        q.id === quizId
          ? { ...q, is_favorite: !current }
          : q,
      ),
    )

    try {
      await api.quizzes.toggleFavorite(quizId)
    } catch {
      setQuizzes((prev) =>
        prev.map((q) =>
          q.id === quizId
            ? { ...q, is_favorite: current }
            : q,
        ),
      )
    }
  }

  // Compute stats from real data
  const completedQuizzes = quizzes.filter((q) => q.last_score !== undefined && q.last_score !== null)
  const avgScore = completedQuizzes.length > 0
    ? Math.round(completedQuizzes.reduce((s: number, q) => s + (toNumber(q.last_score) ?? 0), 0) / completedQuizzes.length)
    : 0

  const stats = [
    {
      label: 'Avg. Score',
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
    {
      label: 'Total Quizzes',
      value: String(quizzes.length),
      icon: Flame,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
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

  const getDifficultyLabel = (diff: any) => {
    if (diff === 1 || diff === 'easy') return 'Easy'
    if (diff === 2 || diff === 'medium') return 'Medium'
    if (diff === 3 || diff === 'hard') return 'Hard'
    return diff || 'Medium'
  }

  const resolveQuizDifficulty = (quiz: QuizListItemResponse): QuizListItemResponse['difficulty'] => {
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

    const questions = safeParseJSON(quiz?.questions) as QuizQuestionResponse[] | string | undefined
    if (Array.isArray(questions) && questions.length > 0) {
      const fromQuestion = questions[0]?.difficulty
      if (fromQuestion !== undefined && fromQuestion !== null && String(fromQuestion).trim() !== '') {
        return fromQuestion
      }
    }

    return 'medium'
  }

  const normalizeDifficulty = (diff: any): 'easy' | 'medium' | 'hard' => {
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
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">My Quizzes</h1>
              <Badge variant="secondary" className="rounded-full px-3">{quizzes.length}</Badge>
            </div>
            <p className="text-muted-foreground">Review your performance and retake assessments.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/summaries')}>
            Create Quiz (Select Summary First)
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-none shadow-sm bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shadow-sm', stat.bg, stat.color)}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search quizzes..."
              className="pl-9 transition-all focus-visible:ring-primary"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">
              Sort by:
            </span>
            <div className="flex bg-secondary/50 rounded-lg p-1">
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
                'px-3 py-1.5 text-xs rounded-full border transition-colors',
                quickFilter === option.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground hover:text-foreground border-border',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : loadError ? (
          <div className="text-center py-16 border rounded-xl bg-secondary/10">
            <h3 className="text-lg font-semibold mb-2">Failed to load quizzes</h3>
            <p className="text-muted-foreground mb-4">{loadError}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
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
                  className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-l-4 border-l-transparent hover:border-l-primary relative overflow-hidden"
                  onClick={() => navigate(`/quiz/results/${quiz.last_attempt_id || quiz.id}`)}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="p-6 relative z-10">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex gap-4 min-w-0">
                        <div className="h-12 w-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 shadow-sm">
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
                            <div className="flex items-center gap-1">
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
                        <Star className={cn('h-3.5 w-3.5', starred ? 'fill-amber-500 text-amber-500' : '')} />
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
