import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Layout, Calendar, Plus, Search, Loader2, Star, SlidersHorizontal, Sparkles } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { api, ApiError, presentationQueryKeys } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/utils'
import type { Presentation } from '../lib/presentationTypes'
import { getThemeById } from '../lib/presentationThemes'
import { PRESENTATION_CANVAS_HEIGHT, PRESENTATION_CANVAS_WIDTH, SlideRenderer } from '../components/presentation/SlideRenderer'

function PresentationCardPreview({ presentation }: { presentation: Presentation }) {
  const firstSlide = presentation.slides[0]
  const theme = getThemeById(presentation.theme)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = React.useState(1)

  React.useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateScale = () => {
      const width = element.clientWidth
      if (!width) return
      setScale(width / PRESENTATION_CANVAS_WIDTH)
    }

    updateScale()

    const observer = new ResizeObserver(() => updateScale())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (!firstSlide) {
    return (
      <div className="aspect-[16/9] rounded-xl border bg-secondary/30 flex items-center justify-center text-sm text-muted-foreground">
        No slides yet
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl overflow-hidden border bg-secondary/20"
      style={{ aspectRatio: `${PRESENTATION_CANVAS_WIDTH} / ${PRESENTATION_CANVAS_HEIGHT}` }}
    >
      <div
        className="absolute inset-0 origin-top-left"
        style={{
          width: `${PRESENTATION_CANVAS_WIDTH}px`,
          height: `${PRESENTATION_CANVAS_HEIGHT}px`,
          transform: `scale(${scale})`,
        }}
      >
        <SlideRenderer slide={firstSlide} theme={theme} scale={1} />
      </div>
    </div>
  )
}

export function PresentationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest')
  const [quickFilter, setQuickFilter] = useState<'all' | 'starred' | 'navy' | 'minimal' | 'academic' | 'dark'>('all')
  const [favoritePendingIds, setFavoritePendingIds] = useState<string[]>([])

  type PresentationListCache = {
    presentations: Presentation[]
    total?: number
    limit?: number
    offset?: number
  }

  const { data, isLoading, error } = useQuery({
    queryKey: [...presentationQueryKeys.all, { searchQuery, sortOrder }],
    queryFn: () => api.presentations.list({
      search: searchQuery,
      sort: sortOrder === 'az' ? 'title' : sortOrder === 'oldest' ? 'oldest' : 'newest',
    }),
  })

  const presentations = data?.presentations || []

  const isFavoritePending = (presentationID: string) => favoritePendingIds.includes(presentationID)

  const togglePresentationFavorite = async (presentationID: string) => {
    if (isFavoritePending(presentationID)) {
      return
    }

    const querySnapshots = queryClient.getQueriesData<PresentationListCache>({
      queryKey: presentationQueryKeys.all,
    })

    setFavoritePendingIds((prev) => [...prev, presentationID])

    for (const [key, value] of querySnapshots) {
      if (!value?.presentations) continue
      queryClient.setQueryData<PresentationListCache>(key, {
        ...value,
        presentations: value.presentations.map((presentation) =>
          presentation.id === presentationID
            ? { ...presentation, isFavorite: !Boolean(presentation.isFavorite) }
            : presentation,
        ),
      })
    }

    try {
      await api.presentations.toggleFavorite(presentationID)
      await queryClient.invalidateQueries({ queryKey: presentationQueryKeys.all })
    } catch (err: unknown) {
      for (const [key, value] of querySnapshots) {
        queryClient.setQueryData(key, value)
      }

      const message = err instanceof ApiError
        ? err.status === 404
          ? 'Favorites endpoint is unavailable. Update backend and run latest migrations.'
          : err.message
        : err instanceof Error
          ? err.message
          : 'Failed to update favorite'

      toast.error(message)
    } finally {
      setFavoritePendingIds((prev) => prev.filter((id) => id !== presentationID))
    }
  }

  const filteredPresentations = useMemo(() => {
    return presentations.filter((presentation) => {
      if (quickFilter === 'all') return true
      if (quickFilter === 'starred') return Boolean(presentation.isFavorite)
      return (presentation.theme || 'navy') === quickFilter
    })
  }, [presentations, quickFilter])

  const filterOptions: Array<{ key: typeof quickFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'starred', label: 'Starred' },
    { key: 'navy', label: 'Navy' },
    { key: 'minimal', label: 'Minimal' },
    { key: 'academic', label: 'Academic' },
    { key: 'dark', label: 'Dark' },
  ]

  const getFilterCount = (key: typeof quickFilter) => {
    if (key === 'all') return presentations.length
    if (key === 'starred') return presentations.filter((presentation) => Boolean(presentation.isFavorite)).length
    return presentations.filter((presentation) => (presentation.theme || 'navy') === key).length
  }

  return (
    <AppLayout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-secondary/25 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-blue-400/10 blur-3xl" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold tracking-tight">My Presentations</h1>
                <Badge variant="secondary" className="rounded-full px-3">{presentations.length}</Badge>
              </div>
              <p className="text-muted-foreground">
                Browse generated decks, reopen them quickly, and keep a visual study library.
              </p>
            </div>

            <Button variant="outline" className="bg-background/80 backdrop-blur" onClick={() => navigate('/presentations/new')}>
              <Plus className="h-4 w-4 mr-2" />
              New Presentation
            </Button>
          </div>

          <div className="relative mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: presentations.length },
              { label: 'Slides', value: presentations.reduce((sum, item) => sum + item.slideCount, 0) },
              { label: 'Themes', value: new Set(presentations.map((item) => item.theme || 'navy')).size },
              { label: 'Completed', value: presentations.filter((item) => item.status === 'completed').length },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border bg-card/90 p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <Layout className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="border shadow-sm">
          <CardContent className="p-4 md:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search presentations..."
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
                  {[
                    { key: 'newest', label: 'Newest' },
                    { key: 'oldest', label: 'Oldest' },
                    { key: 'az', label: 'A-Z' },
                  ].map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setSortOrder(option.key as typeof sortOrder)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                        sortOrder === option.key
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
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
                    {getFilterCount(option.key)}
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
        ) : error ? (
          <div className="text-center py-16 border rounded-xl bg-secondary/10">
            <h3 className="text-lg font-semibold mb-2">Failed to load presentations</h3>
            <p className="text-muted-foreground mb-4">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: presentationQueryKeys.all })}>Retry</Button>
          </div>
        ) : presentations.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 bg-blue-100 dark:bg-blue-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-8 w-8 text-blue-600 dark:text-blue-300" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No presentations yet</h3>
            <p className="text-muted-foreground mb-4">Generate your first presentation from a validated YouTube lecture.</p>
            <Button onClick={() => navigate('/presentations/new')}>Create Presentation</Button>
          </div>
        ) : filteredPresentations.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredPresentations.map((presentation) => (
              <Card
                key={presentation.id}
                className="group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border relative overflow-hidden"
                onClick={() => navigate(`/presentations/${presentation.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate(`/presentations/${presentation.id}`)
                  }
                }}
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500/60 via-slate-500/40 to-amber-500/30" />
                <CardContent className="p-6 relative z-10 space-y-4">
                  <PresentationCardPreview presentation={presentation} />

                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">
                        {presentation.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="secondary">{presentation.slideCount} slides</Badge>
                        <Badge variant="outline" className="capitalize">{presentation.language || 'en'}</Badge>
                        <Badge variant="outline" className="capitalize">{presentation.theme || 'navy'}</Badge>
                        <Badge variant="outline" className="capitalize">{presentation.status}</Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isFavoritePending(presentation.id)}
                      className={cn(
                        'h-9 px-3 border',
                        Boolean(presentation.isFavorite)
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-muted-foreground hover:text-amber-600',
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        void togglePresentationFavorite(presentation.id)
                      }}
                    >
                      <Star className={cn('h-4 w-4', Boolean(presentation.isFavorite) ? 'fill-current' : 'fill-none')} />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{presentation.createdAt ? new Date(presentation.createdAt).toLocaleDateString() : 'Unknown date'}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-xl bg-secondary/10">
            <h3 className="text-lg font-semibold mb-2">No presentations match your filters</h3>
            <p className="text-muted-foreground mb-4">Try a different search query or theme filter.</p>
          </div>
        )}

      </div>
    </AppLayout>
  )
}
