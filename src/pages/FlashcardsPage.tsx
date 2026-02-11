import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import {
    Layers,
    Calendar,
    RotateCcw,
    Eye,
    Loader2,
    BrainCircuit,
} from 'lucide-react'

export function FlashcardsPage() {
    const navigate = useNavigate()
    const [decks, setDecks] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

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
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold">{decks.length}</p>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Decks</p>
                        </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm bg-secondary/30">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold">{totalCards}</p>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Cards</p>
                        </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm bg-secondary/30">
                        <CardContent className="p-4">
                            <p className="text-2xl font-bold">{decks.length > 0 ? Math.round(totalCards / decks.length) : 0}</p>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Avg Cards / Deck</p>
                        </CardContent>
                    </Card>
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
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {decks.map((deck: any) => (
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
                )}
            </div>
        </AppLayout>
    )
}
