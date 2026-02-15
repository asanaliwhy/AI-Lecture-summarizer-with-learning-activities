import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type FlashcardDeckListItemResponse } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { useToast } from '../components/ui/Toast'
import {
    Layers,
    Calendar,
    RotateCcw,
    Eye,
    Loader2,
    BrainCircuit,
    Search,
    LayoutGrid,
    Library,
    BarChart3,
    Sparkles,
    SlidersHorizontal,
    Plus,
    Star,
} from 'lucide-react'
import { cn } from '../lib/utils'

export function FlashcardsPage() {
    const navigate = useNavigate()
    const toast = useToast()
    const [decks, setDecks] = useState<FlashcardDeckListItemResponse[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest')
    const [quickFilter, setQuickFilter] = useState<'all' | 'starred' | 'new' | 'small' | 'medium' | 'large'>('all')
    const [favoritePendingIds, setFavoritePendingIds] = useState<string[]>([])
    const loadRequestIdRef = useRef(0)

    const loadDecks = useCallback(async () => {
        const requestId = ++loadRequestIdRef.current

        setIsLoading(true)
        setLoadError(null)
        try {
            const data = await api.flashcards.listDecks()
            if (requestId !== loadRequestIdRef.current) {
                return
            }

            setDecks(data.decks || [])
        } catch (err: unknown) {
            if (requestId !== loadRequestIdRef.current) {
                return
            }

            setDecks([])
            const message = err instanceof ApiError
                ? err.message
                : err instanceof Error
                    ? err.message
                    : 'Failed to load flashcard decks'
            setLoadError(message)
        } finally {
            if (requestId === loadRequestIdRef.current) {
                setIsLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        loadDecks()

        return () => {
            loadRequestIdRef.current += 1
        }
    }, [loadDecks])

    const totalCards = useMemo(
        () => decks.reduce((sum, d) => sum + (Number(d.card_count) || 0), 0),
        [decks],
    )

    const getCardCount = (deck: FlashcardDeckListItemResponse): number => {
        const value = Number(deck?.card_count)
        return Number.isFinite(value) ? value : 0
    }

    const isDeckStarred = (deckId: string) => {
        const deck = decks.find((d) => d.id === deckId)
        return Boolean(deck?.is_favorite)
    }

    const isFavoritePending = (deckId: string) => favoritePendingIds.includes(deckId)

    const toggleDeckFavorite = async (deckId: string) => {
        if (isFavoritePending(deckId)) return

        const current = isDeckStarred(deckId)
        setFavoritePendingIds((prev) => [...prev, deckId])

        setDecks((prev) =>
            prev.map((d) =>
                d.id === deckId
                    ? { ...d, is_favorite: !current }
                    : d,
            ),
        )

        try {
            await api.flashcards.toggleFavorite(deckId)
        } catch (err: unknown) {
            setDecks((prev) =>
                prev.map((d) =>
                    d.id === deckId
                        ? { ...d, is_favorite: current }
                        : d,
                ),
            )

            const message = err instanceof ApiError
                ? err.status === 404
                    ? 'Favorites endpoint is unavailable. Please update/restart backend and run latest migrations.'
                    : err.message
                : err instanceof Error
                    ? err.message
                    : 'Failed to update favorite'
            toast.error(message)
        } finally {
            setFavoritePendingIds((prev) => prev.filter((id) => id !== deckId))
        }
    }

    const filteredDecks = useMemo(() => {
        return decks
            .filter((deck) => {
                const title = String(deck?.title || '').toLowerCase()
                const query = searchQuery.trim().toLowerCase()

                const matchesSearch = !query || title.includes(query)
                if (!matchesSearch) return false

                if (quickFilter === 'all') return true
                if (quickFilter === 'starred') return Boolean(deck.is_favorite)

                const cardCount = getCardCount(deck)
                const createdAt = deck?.created_at ? new Date(deck.created_at).getTime() : 0
                const ageDays = createdAt > 0 ? (Date.now() - createdAt) / (1000 * 60 * 60 * 24) : Number.POSITIVE_INFINITY

                if (quickFilter === 'new') return ageDays <= 7
                if (quickFilter === 'small') return cardCount <= 15
                if (quickFilter === 'medium') return cardCount >= 16 && cardCount <= 30
                return cardCount > 30
            })
            .sort((a, b) => {
                if (sortOrder === 'az') {
                    return String(a?.title || '').localeCompare(String(b?.title || ''))
                }

                const aDate = a?.created_at ? new Date(a.created_at).getTime() : 0
                const bDate = b?.created_at ? new Date(b.created_at).getTime() : 0

                if (sortOrder === 'oldest') return aDate - bDate
                return bDate - aDate
            })
    }, [decks, searchQuery, quickFilter, sortOrder])

    const filterOptions: Array<{ key: typeof quickFilter; label: string }> = [
        { key: 'all', label: 'All' },
        { key: 'starred', label: 'Starred' },
        { key: 'new', label: 'New' },
        { key: 'small', label: 'Small' },
        { key: 'medium', label: 'Medium' },
        { key: 'large', label: 'Large' },
    ]

    const starredDecksCount = decks.filter((d) => Boolean(d.is_favorite)).length
    const newDecksCount = decks.filter((d) => {
        const createdAt = d?.created_at ? new Date(d.created_at).getTime() : 0
        const ageDays = createdAt > 0 ? (Date.now() - createdAt) / (1000 * 60 * 60 * 24) : Number.POSITIVE_INFINITY
        return ageDays <= 7
    }).length

    const getQuickFilterCount = (key: typeof quickFilter) => {
        if (key === 'all') return decks.length
        if (key === 'starred') return starredDecksCount
        if (key === 'new') return newDecksCount
        if (key === 'small') return decks.filter((d) => getCardCount(d) <= 15).length
        if (key === 'medium') return decks.filter((d) => {
            const c = getCardCount(d)
            return c >= 16 && c <= 30
        }).length
        return decks.filter((d) => getCardCount(d) > 30).length
    }

    return (
        <AppLayout>
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-secondary/25 p-6 shadow-sm">
                    <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
                    <div className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl" />

                    <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-3xl font-bold tracking-tight">My Flashcards</h1>
                                <Badge variant="secondary" className="rounded-full px-3">{decks.length}</Badge>
                            </div>
                            <p className="text-muted-foreground">Review your generated flashcard decks and continue studying.</p>
                        </div>

                        <Button variant="outline" className="bg-background/80 backdrop-blur" onClick={() => navigate('/summaries')}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Deck
                        </Button>
                    </div>

                    <div className="relative mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: 'Total', value: decks.length, icon: LayoutGrid },
                            { label: 'Total Cards', value: totalCards, icon: Library },
                            { label: 'Avg Cards/Deck', value: decks.length > 0 ? Math.round(totalCards / decks.length) : 0, icon: BarChart3 },
                        ].map((stat) => {
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
                                    placeholder="Search decks..."
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
                        <h3 className="text-lg font-semibold mb-2">Failed to load flashcard decks</h3>
                        <p className="text-muted-foreground mb-4">{loadError}</p>
                        <Button onClick={loadDecks}>Retry</Button>
                    </div>
                ) : decks.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="h-16 w-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <BrainCircuit className="h-8 w-8 text-amber-700" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">No flashcard decks yet</h3>
                        <p className="text-muted-foreground mb-4">Generate flashcards from a summary to start spaced repetition study.</p>
                        <Button onClick={() => navigate('/summaries')}>Go to Summaries</Button>
                    </div>
                ) : filteredDecks.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {filteredDecks.map((deck) => (
                            <Card
                                key={deck.id}
                                className="group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border relative overflow-hidden"
                                onClick={() => navigate(`/flashcards/study/${deck.id}`)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        navigate(`/flashcards/study/${deck.id}`)
                                    }
                                }}
                            >
                                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500/60 via-orange-500/40 to-yellow-500/30" />
                                <CardContent className="p-6 relative z-10">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex gap-4">
                                            <div className="h-12 w-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                                                <Layers className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors mb-1">
                                                    {deck.title}
                                                </h3>
                                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                    <div className="flex items-center gap-1 rounded-md bg-secondary/40 px-2 py-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {deck.created_at ? new Date(deck.created_at).toLocaleDateString() : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-xl font-bold">{deck.card_count || 0}</p>
                                            <p className="text-xs text-muted-foreground">Cards</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 mt-6 pt-4 border-t opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 h-9 text-xs font-medium"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                navigate(`/flashcards/study/${deck.id}`)
                                            }}
                                        >
                                            <RotateCcw className="mr-2 h-3 w-3" /> Study
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="flex-1 h-9 text-xs font-medium"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                navigate(`/flashcards/study/${deck.id}`)
                                            }}
                                        >
                                            <Eye className="mr-2 h-3 w-3" /> View Deck
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={isFavoritePending(deck.id)}
                                            title={deck.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                                            className={cn(
                                                'h-9 px-3 text-xs font-medium border',
                                                Boolean(deck.is_favorite)
                                                    ? 'text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100'
                                                    : 'text-muted-foreground border-border hover:bg-secondary',
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                toggleDeckFavorite(deck.id)
                                            }}
                                        >
                                            {isFavoritePending(deck.id) ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Star className={cn('h-3.5 w-3.5', deck.is_favorite ? 'fill-amber-500 text-amber-500' : '')} />
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 border rounded-xl bg-secondary/10">
                        <h3 className="text-lg font-semibold mb-2">No decks match your filters</h3>
                        <p className="text-muted-foreground mb-4">Try adjusting search, sort, or filter chips.</p>
                    </div>
                )}
            </div>
        </AppLayout>
    )
}
