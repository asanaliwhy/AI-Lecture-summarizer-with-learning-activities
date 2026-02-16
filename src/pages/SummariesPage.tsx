import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type SummaryListItemResponse } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  Card,
  CardContent,
} from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import {
  Calendar,
  FileText,
  Search,
  Plus,
  Clock,
  Youtube,
  File,
  Star,
  ArrowRight,
  SlidersHorizontal,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'

export function SummariesPage() {
  const navigate = useNavigate()
  const toast = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest')
  const [quickFilter, setQuickFilter] = useState<'all' | 'starred' | 'youtube' | 'document' | 'smart' | 'cornell' | 'bullets' | 'paragraph'>('all')
  const [summaries, setSummaries] = useState<SummaryListItemResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [favoritePendingIds, setFavoritePendingIds] = useState<string[]>([])
  const loadRequestIdRef = useRef(0)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  const loadSummaries = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current

    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await api.summaries.list({
        search: debouncedSearchQuery,
        sort: sortOrder === 'az' ? 'title' : sortOrder === 'oldest' ? 'oldest' : 'newest',
      })

      if (requestId !== loadRequestIdRef.current) {
        return
      }

      setSummaries(data.summaries || [])
    } catch (err: unknown) {
      if (requestId !== loadRequestIdRef.current) {
        return
      }

      setSummaries([])
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to load summaries'
      setLoadError(message)
      toast.error(message)
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [debouncedSearchQuery, sortOrder, toast])

  useEffect(() => {
    loadSummaries()

    return () => {
      loadRequestIdRef.current += 1
    }
  }, [loadSummaries])

  const isFavoritePending = (summaryId: string) => favoritePendingIds.includes(summaryId)

  const toggleStar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()

    if (isFavoritePending(id)) return

    const current = summaries.find((s) => s.id === id)?.is_favorite === true
    setFavoritePendingIds((prev) => [...prev, id])

    setSummaries((prev) =>
      prev.map((summary) =>
        summary.id === id
          ? { ...summary, is_favorite: !current }
          : summary,
      ),
    )

    try {
      await api.summaries.toggleFavorite(id)
    } catch (err: unknown) {
      setSummaries((prev) =>
        prev.map((summary) =>
          summary.id === id
            ? { ...summary, is_favorite: current }
            : summary,
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
      setFavoritePendingIds((prev) => prev.filter((summaryId) => summaryId !== id))
    }
  }

  const getSummarySource = (summary: SummaryListItemResponse) => {
    const raw = String(
      summary?.source ||
      summary?.source_type ||
      summary?.config?.source ||
      summary?.config?.source_type ||
      '',
    ).toLowerCase()

    const isYouTube = raw.includes('youtube') || raw.includes('youtu')
    return {
      isYouTube,
      label: isYouTube ? 'YouTube' : 'Document',
    }
  }

  const getReadTime = (summary: SummaryListItemResponse) => {
    const direct = summary?.readTime ?? summary?.read_time
    if (typeof direct === 'string' && direct.trim()) return direct

    const words = Number(summary?.word_count ?? summary?.wordCount ?? 0)
    if (Number.isFinite(words) && words > 0) {
      const minutes = Math.max(1, Math.round(words / 200))
      return `${minutes} min read`
    }

    return null
  }

  const getProgress = (summary: SummaryListItemResponse) => {
    const raw = Number(summary?.progress ?? summary?.completion)
    if (!Number.isFinite(raw)) return null
    return Math.max(0, Math.min(100, raw))
  }

  const getFormatLabel = (summary: SummaryListItemResponse) => {
    const raw = String(summary?.format || summary?.config?.format || '').toLowerCase()
    if (raw === 'cornell') return 'Cornell'
    if (raw === 'bullets') return 'Bullet Points'
    if (raw === 'paragraph') return 'Paragraph'
    if (raw === 'smart') return 'Smart Summary'
    return 'Summary'
  }

  const getFormatBadgeClass = (summary: SummaryListItemResponse) => {
    const raw = String(summary?.format || summary?.config?.format || '').toLowerCase()
    if (raw === 'cornell') return 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
    if (raw === 'bullets') return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300'
    if (raw === 'paragraph') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    if (raw === 'smart') return 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
    return 'bg-secondary/80 text-secondary-foreground'
  }

  const getSummaryFormatValue = (summary: SummaryListItemResponse) =>
    String(summary?.format || summary?.config?.format || '').toLowerCase()

  const filterOptions: Array<{ key: typeof quickFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'starred', label: 'Starred' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'document', label: 'Document' },
    { key: 'smart', label: 'Smart' },
    { key: 'cornell', label: 'Cornell' },
    { key: 'bullets', label: 'Bullets' },
    { key: 'paragraph', label: 'Paragraph' },
  ]

  const totalWords = useMemo(
    () => summaries.reduce((sum, summary) => {
      const words = Number(summary.word_count ?? summary.wordCount ?? 0)
      return Number.isFinite(words) ? sum + words : sum
    }, 0),
    [summaries],
  )

  const starredSummariesCount = summaries.filter((summary) => Boolean(summary.is_favorite)).length
  const youtubeSummariesCount = summaries.filter((summary) => getSummarySource(summary).isYouTube).length
  const documentSummariesCount = Math.max(0, summaries.length - youtubeSummariesCount)

  const avgReadMinutes = summaries.length > 0
    ? Math.max(1, Math.round(totalWords / 200 / summaries.length))
    : 0

  const getQuickFilterCount = (key: typeof quickFilter) => {
    if (key === 'all') return summaries.length
    if (key === 'starred') return starredSummariesCount
    if (key === 'youtube') return youtubeSummariesCount
    if (key === 'document') return documentSummariesCount
    return summaries.filter((summary) => getSummaryFormatValue(summary) === key).length
  }

  const filteredSummaries = summaries.filter((summary) => {
    if (quickFilter === 'all') return true
    if (quickFilter === 'starred') return Boolean(summary.is_favorite)
    if (quickFilter === 'youtube') return getSummarySource(summary).isYouTube
    if (quickFilter === 'document') return !getSummarySource(summary).isYouTube
    return getSummaryFormatValue(summary) === quickFilter
  })

  const hasActiveSearch = debouncedSearchQuery.trim().length > 0
  const hasActiveFilters = quickFilter !== 'all' || hasActiveSearch

  const stats = [
    {
      label: 'Total',
      value: String(summaries.length),
      icon: FileText,
    },
    {
      label: 'Document',
      value: String(documentSummariesCount),
      icon: File,
    },
    {
      label: 'YouTube',
      value: String(youtubeSummariesCount),
      icon: Youtube,
    },
    {
      label: 'Avg Read',
      value: `${avgReadMinutes}m`,
      icon: Clock,
    },
  ]

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-secondary/25 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-blue-400/10 blur-3xl" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold tracking-tight">My Summaries</h1>
                <Badge variant="secondary" className="rounded-full px-3">{summaries.length}</Badge>
              </div>
              <p className="text-muted-foreground">
                Explore your AI-generated notes, favorites, and study progress in one place.
              </p>
            </div>

            <Button variant="outline" className="bg-background/80 backdrop-blur" onClick={() => navigate('/create')}>
              <Plus className="h-4 w-4 mr-2" />
              New Summary
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

        <Card className="border shadow-sm">
          <CardContent className="p-4 md:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search summaries..."
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

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : loadError ? (
          <div className="text-center py-16 border rounded-xl bg-secondary/10">
            <h3 className="text-lg font-semibold mb-2">Failed to load summaries</h3>
            <p className="text-muted-foreground mb-4">{loadError}</p>
            <Button onClick={loadSummaries}>Retry</Button>
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 bg-blue-100 dark:bg-blue-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-8 w-8 text-blue-600 dark:text-blue-300" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No summaries yet</h3>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              Create your first summary from uploaded content to build your study library.
            </p>
            <Button onClick={() => navigate('/create')}>
              <Plus className="mr-2 h-4 w-4" />
              Create Content
            </Button>
          </div>
        ) : filteredSummaries.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredSummaries.map((summary) => (
              (() => {
                const source = getSummarySource(summary)
                const readTime = getReadTime(summary)
                const progress = getProgress(summary)
                const tags = summary.tags || []
                const visibleTags = tags.slice(0, 3)
                const hiddenTagsCount = Math.max(0, tags.length - visibleTags.length)
                const isStarred = Boolean(summary.is_favorite)

                return (
                  <Card
                    key={summary.id}
                    className="group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border relative overflow-hidden"
                    onClick={() => navigate(`/summary/${summary.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/summary/${summary.id}`)
                      }
                    }}
                  >
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500/60 via-indigo-500/40 to-cyan-500/30" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity" />

                    <CardContent className="p-6 relative z-10">
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                          <FileText className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors mb-2 line-clamp-2">
                            {summary.title || 'Untitled Summary'}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={cn('font-medium text-[11px] px-2.5 py-1', getFormatBadgeClass(summary))}
                            >
                              {getFormatLabel(summary)}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4">
                        {visibleTags.map((tag: string) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="font-normal text-xs bg-secondary/80 group-hover:bg-secondary transition-colors"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {hiddenTagsCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="font-normal text-xs bg-secondary/80"
                          >
                            +{hiddenTagsCount}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-4">
                        <div className="flex items-center gap-1 rounded-md bg-secondary/40 px-2 py-1">
                          <Calendar className="h-3 w-3" />
                          {summary.created_at ? new Date(summary.created_at).toLocaleDateString() : 'Unknown date'}
                        </div>

                        <div
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-md',
                            source.isYouTube
                              ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                              : 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
                          )}
                        >
                          {source.isYouTube ? (
                            <Youtube className="h-3 w-3" />
                          ) : (
                            <File className="h-3 w-3" />
                          )}
                          {source.label}
                        </div>
                        {readTime && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {readTime}
                          </div>
                        )}
                      </div>

                      {progress !== null && progress > 0 && (
                        <div className="mt-5">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                            <span>Progress</span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/60 group-hover:bg-primary transition-all duration-500"
                              style={{
                                width: `${progress}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3 mt-6 pt-4 border-t opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-9 text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/summary/${summary.id}`)
                          }}
                        >
                          <ArrowRight className="mr-2 h-3 w-3" />
                          Read Summary
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-3 text-xs font-medium border"
                          disabled={isFavoritePending(summary.id)}
                          onClick={(e) => toggleStar(e, summary.id)}
                        >
                          {isFavoritePending(summary.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Star className={cn('h-3.5 w-3.5', isStarred ? 'fill-amber-500 text-amber-500' : '')} />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })()
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-xl bg-secondary/10">
            <div className="h-16 w-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No summaries match your filters</h3>
            <p className="text-muted-foreground mb-4">
              {hasActiveFilters
                ? 'Try changing search terms, sort order, or filter chips.'
                : 'No summary data is available right now.'}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('')
                setQuickFilter('all')
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
