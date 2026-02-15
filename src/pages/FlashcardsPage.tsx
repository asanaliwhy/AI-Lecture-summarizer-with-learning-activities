import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
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
} from 'lucide-react'
import { cn } from '../lib/utils'

export function FlashcardsPage() {
    const navigate = useNavigate()
    const [decks, setDecks] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'az'>('newest')
    const [quickFilter, setQuickFilter] = useState<'all' | 'new' | 'small' | 'medium' | 'large'>('all')

    useEffect(() => {
        async function load() {
            try {
                const data = await api.flashcards.listDecks()
                setDecks(data.decks || [])
            } catch {
                setDecks([])
            } finally {
                setIsLoading(false)
            }
        }

        load()
    }, [])

    const totalCards = useMemo(
        () => decks.reduce((sum, d) => sum + (Number(d.card_count) || 0), 0),
        [decks],
    )

    const getCardCount = (deck: any): number => {
        const value = Number(deck?.card_count)
        return Number.isFinite(value) ? value : 0
    }

    const filteredDecks = useMemo(() => {
        return decks
            .filter((deck: any) => {
                const title = String(deck?.title || '').toLowerCase()
                const query = searchQuery.trim().toLowerCase()

                const matchesSearch = !query || title.includes(query)
                if (!matchesSearch) return false

                if (quickFilter === 'all') return true

                const cardCount = getCardCount(deck)
                const createdAt = deck?.created_at ? new Date(deck.created_at).getTime() : 0
                const ageDays = createdAt > 0 ? (Date.now() - createdAt) / (1000 * 60 * 60 * 24) : Number.POSITIVE_INFINITY

                if (quickFilter === 'new') return ageDays <= 7
                if (quickFilter === 'small') return cardCount <= 15
                if (quickFilter === 'medium') return cardCount >= 16 && cardCount <= 30
                return cardCount > 30
            })
            .sort((a: any, b: any) => {
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
        { key: 'new', label: 'New' },
        { key: 'small', label: 'Small' },
        { key: 'medium', label: 'Medium' },
        { key: 'large', label: 'Large' },
    ]

    return (
        <AppLayout>
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-3xl font-bold tracking-tight">My Flashcards</h1>
                            <Badge variant="secondary" className="rounded-full px-3">{decks.length}</Badge>
                        </div>
                        <p className="text-muted-foreground">Review your generated flashcard decks and continue studying.</p>
                    </div>
                    <Button variant="outline" onClick={() => navigate('/summaries')}>
                        Create Deck (Select Summary First)
                    </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="border-none shadow-sm bg-secondary/30">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                                <LayoutGrid className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{decks.length}</p>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Decks</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm bg-secondary/30">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                <Library className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{totalCards}</p>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Cards</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm bg-secondary/30">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                                <BarChart3 className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{decks.length > 0 ? Math.round(totalCards / decks.length) : 0}</p>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Avg Cards / Deck</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search decks..."
                            className="pl-9 transition-all focus-visible:ring-primary"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">Sort by:</span>
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

                {isLoading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                        {filteredDecks.map((deck: any) => (
                            <Card
                                key={deck.id}
                                className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-l-4 border-l-transparent hover:border-l-primary relative overflow-hidden"
                                onClick={() => navigate(`/flashcards/study/${deck.id}`)}
                            >
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
                                                    <div className="flex items-center gap-1">
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
