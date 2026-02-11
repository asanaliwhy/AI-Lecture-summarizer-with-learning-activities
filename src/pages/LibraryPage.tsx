import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs'
import { Checkbox } from '../components/ui/Checkbox'
import {
  Search,
  Filter,
  MoreHorizontal,
  FileText,
  BrainCircuit,
  Layers,
  Calendar,
  Grid,
  List as ListIcon,
  Trash2,
  Download,
  Star,
  Loader2,
} from 'lucide-react'
import { cn } from '../lib/utils'

export function LibraryPage() {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [items, setItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const type = params.get('type')
    if (!type) return

    if (type === 'flashcards') {
      setTypeFilter('flashcards')
      return
    }

    if (type === 'summary' || type === 'quiz' || type === 'flashcard' || type === 'all') {
      setTypeFilter(type === 'flashcard' ? 'flashcards' : type)
    }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const params: Record<string, string> = {}
        if (searchQuery) params.search = searchQuery
        if (typeFilter !== 'all') {
          params.type = typeFilter === 'flashcards' ? 'flashcard' : typeFilter
        }
        const data = await api.library.list(params)
        setItems(data.items || [])
      } catch {
        setItems([])
      } finally {
        setIsLoading(false)
      }
    }
    setIsLoading(true)
    load()
  }, [searchQuery, typeFilter])

  const toggleSelection = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleDelete = async () => {
    // Delete selected items (summaries for now)
    for (const id of selectedItems) {
      try { await api.summaries.delete(id) } catch { }
    }
    setSelectedItems([])
    // Refresh
    const data = await api.library.list()
    setItems(data.items || [])
  }

  const getItemRoute = (item: any) => {
    if (item.type === 'summary') return `/summary/${item.id}`
    if (item.type === 'quiz') return `/quiz/take/${item.id}`
    if (item.type === 'flashcard' || item.type === 'flashcards') return `/flashcards/study/${item.id}`
    return '/library'
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Library</h1>
            <p className="text-muted-foreground">Manage your generated content.</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedItems.length > 0 && (
              <div className="flex items-center gap-2 mr-4 animate-in fade-in slide-in-from-right-4">
                <span className="text-sm text-muted-foreground">
                  {selectedItems.length} selected
                </span>
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode('grid')}
              className={viewMode === 'grid' ? 'bg-secondary' : ''}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'bg-secondary' : ''}
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Filters Sidebar */}
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <CardContent className="p-4 space-y-6">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search library..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</h3>
                  <div className="space-y-2">
                    {[
                      { id: 'all', label: 'All Content' },
                      { id: 'summary', label: 'Summaries' },
                      { id: 'quiz', label: 'Quizzes' },
                      { id: 'flashcards', label: 'Flashcards' },
                    ].map(opt => (
                      <div key={opt.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={opt.id}
                          checked={typeFilter === opt.id}
                          onCheckedChange={() => setTypeFilter(opt.id)}
                        />
                        <label htmlFor={opt.id} className="text-sm font-medium">{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Content Grid */}
          <div className="lg:col-span-9">
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="all">All Items</TabsTrigger>
                <TabsTrigger value="favorites">Favorites</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-0">
                {isLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="h-16 w-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4 mx-auto">
                      <Search className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">No items found</h3>
                    <p className="text-muted-foreground mt-2">Create your first summary to get started.</p>
                    <Button className="mt-4" onClick={() => navigate('/create')}>Create Content</Button>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {items.map((item: any) => (
                      <Card
                        key={item.id}
                        className={cn(
                          'group relative transition-all hover:shadow-md cursor-pointer border-l-4',
                          selectedItems.includes(item.id) ? 'ring-2 ring-primary border-primary' : 'border-l-transparent',
                        )}
                      >
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <Checkbox
                            checked={selectedItems.includes(item.id)}
                            onCheckedChange={() => toggleSelection(item.id)}
                          />
                        </div>
                        <CardContent
                          className="p-6 pt-8"
                          onClick={() => navigate(getItemRoute(item))}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className={cn(
                              'p-2 rounded-lg',
                              item.type === 'summary' ? 'bg-blue-100 text-blue-700'
                                : item.type === 'quiz' ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700',
                            )}>
                              {item.type === 'summary' ? <FileText className="h-5 w-5" />
                                : item.type === 'quiz' ? <BrainCircuit className="h-5 w-5" />
                                  : <Layers className="h-5 w-5" />}
                            </div>
                            {item.is_favorite && (
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            )}
                          </div>
                          <h3 className="font-semibold text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors">
                            {item.title}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                            <Calendar className="h-3 w-3" />
                            <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(item.tags || []).map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-xs font-normal">{tag}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item: any) => (
                      <div
                        key={item.id}
                        className={cn(
                          'flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-secondary/20 transition-colors cursor-pointer group',
                          selectedItems.includes(item.id) ? 'bg-secondary/30 border-primary' : '',
                        )}
                      >
                        <Checkbox
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={() => toggleSelection(item.id)}
                        />
                        <div className={cn(
                          'p-2 rounded-lg shrink-0',
                          item.type === 'summary' ? 'bg-blue-100 text-blue-700'
                            : item.type === 'quiz' ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700',
                        )}>
                          {item.type === 'summary' ? <FileText className="h-4 w-4" />
                            : item.type === 'quiz' ? <BrainCircuit className="h-4 w-4" />
                              : <Layers className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0" onClick={() => navigate(getItemRoute(item))}>
                          <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                            {item.title}
                          </h3>
                        </div>
                        <div className="hidden md:flex items-center gap-2">
                          {(item.tags || []).map((tag: string) => (
                            <Badge key={tag} variant="secondary" className="text-xs font-normal">{tag}</Badge>
                          ))}
                        </div>
                        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground w-24 justify-end">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                        </div>
                        <div className="w-8 flex justify-end">
                          {item.is_favorite && (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
