import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type SummaryListItemResponse } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import {
  FileText,
  Search,
  Plus,
  Clock,
  Youtube,
  File,
  Star,
  ArrowRight,
  Filter,
  SortAsc,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { CardSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
export function SummariesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest')
  const [summaries, setSummaries] = useState<SummaryListItemResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [starredItems, setStarredItems] = useState<string[]>([])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      try {
        const data = await api.summaries.list({
          search: debouncedSearchQuery,
          sort: sortOrder === 'az' ? 'title' : sortOrder === 'oldest' ? 'oldest' : 'newest',
        })
        setSummaries(data.summaries || [])
        setStarredItems(
          (data.summaries || []).filter((s) => s.is_favorite).map((s) => s.id)
        )
      } catch {
        setSummaries([])
        toast.error('Failed to load summaries')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [debouncedSearchQuery, sortOrder, toast])

  const toggleStar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      await api.summaries.toggleFavorite(id)
      setStarredItems(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      )
    } catch {
      toast.error('Failed to update favorite')
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
    if (raw === 'cornell') return 'bg-violet-50 text-violet-700'
    if (raw === 'bullets') return 'bg-cyan-50 text-cyan-700'
    if (raw === 'paragraph') return 'bg-amber-50 text-amber-700'
    if (raw === 'smart') return 'bg-blue-50 text-blue-700'
    return 'bg-secondary/80 text-secondary-foreground'
  }

  const filteredSummaries = summaries
  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">
                My Summaries
              </h1>
              <Badge
                variant="secondary"
                className="rounded-full px-3 bg-secondary text-secondary-foreground"
              >
                {summaries.length}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Browse and manage your AI-generated study notes.
            </p>
          </div>
          <Button
            onClick={() => navigate('/create')}
            className="shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
          >
            <Plus className="mr-2 h-4 w-4" /> New Summary
          </Button>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search summaries..."
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

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filteredSummaries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSummaries.map((summary) => (
              (() => {
                const source = getSummarySource(summary)
                const readTime = getReadTime(summary)
                const progress = getProgress(summary)

                return (
                  <Card
                    key={summary.id}
                    className="group cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 border-l-transparent hover:border-l-primary relative overflow-hidden"
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
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-secondary/20 opacity-0 group-hover:opacity-100 transition-opacity" />

                    <CardHeader className="pb-3 relative z-10">
                      <div className="flex justify-between items-start">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <FileText className="h-5 w-5" />
                        </div>
                        <button
                          onClick={(e) => toggleStar(e, summary.id)}
                          className="text-muted-foreground hover:text-yellow-500 transition-colors focus:outline-none"
                        >
                          <Star
                            className={cn(
                              'h-5 w-5 transition-all',
                              starredItems.includes(summary.id)
                                ? 'fill-yellow-500 text-yellow-500 scale-110'
                                : '',
                            )}
                          />
                        </button>
                      </div>
                      <CardTitle className="text-lg leading-tight line-clamp-2 pt-4 group-hover:text-primary transition-colors">
                        {summary.title}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="pb-3 relative z-10">
                      <div className="mb-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="secondary"
                            className={cn('font-medium text-[11px] px-2.5 py-1', getFormatBadgeClass(summary))}
                          >
                            {getFormatLabel(summary)}
                          </Badge>
                          {summary.is_quality_fallback && (
                            <Badge
                              variant="outline"
                              className="font-medium text-[11px] px-2.5 py-1 border-amber-300 text-amber-700 bg-amber-50"
                            >
                              Estimated Content
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(summary.tags || []).map((tag: string) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="font-normal text-xs bg-secondary/80 group-hover:bg-secondary transition-colors"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div
                          className={cn(
                            'flex items-center gap-1 px-2 py-0.5 rounded-full',
                            source.isYouTube
                              ? 'bg-red-50 text-red-600'
                              : 'bg-blue-50 text-blue-600',
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
                    </CardContent>

                    {progress !== null && progress > 0 && (
                      <CardFooter className="pt-0 pb-0 px-0 relative z-10 mt-auto">
                        <div className="w-full h-1 bg-secondary mt-4">
                          <div
                            className="h-full bg-primary/50 group-hover:bg-primary transition-all duration-500"
                            style={{
                              width: `${progress}%`,
                            }}
                          />
                        </div>
                      </CardFooter>
                    )}

                    {/* Hover Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-3 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 flex items-center justify-center text-sm font-medium text-primary z-20">
                      Read Summary <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
                  </Card>
                )
              })()
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No summaries found</h3>
            <p className="text-muted-foreground max-w-sm mt-2">
              We couldn't find any summaries matching "{searchQuery}". Try a
              different search term or create a new summary.
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => setSearchQuery('')}
            >
              Clear Search
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
