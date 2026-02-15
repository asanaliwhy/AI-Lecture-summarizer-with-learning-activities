import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  const location = useLocation()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [items, setItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const type = params.get('type')
    const search = params.get('search')

    setSearchQuery(search?.trim() || '')

    if (!type) return

    if (type === 'flashcards') {
      setTypeFilter('flashcards')
      return
    }

    if (type === 'summary' || type === 'quiz' || type === 'flashcard' || type === 'all') {
      setTypeFilter(type === 'flashcard' ? 'flashcards' : type)
    }
  }, [location.search])

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
    for (const id of selectedItems) {
      const item = items.find((i) => i.id === id)
      if (!item) continue

      try {
        if (item.type === 'summary') {
          await api.summaries.delete(id)
        } else if (item.type === 'quiz') {
          await api.quizzes.delete(id)
        } else if (item.type === 'flashcard' || item.type === 'flashcards') {
          await api.flashcards.deleteDeck(id)
        }
      } catch { }
    }

    setSelectedItems([])

    const params: Record<string, string> = {}
    if (searchQuery) params.search = searchQuery
    if (typeFilter !== 'all') {
      params.type = typeFilter === 'flashcards' ? 'flashcard' : typeFilter
    }

    const data = await api.library.list(params)
    setItems(data.items || [])
  }

  const sanitizeFileName = (value: string, fallback = 'export') => {
    const cleaned = value
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)

    return cleaned || fallback
  }

  const handleExport = async () => {
    if (selectedItems.length === 0 || isExporting) return

    setIsExporting(true)
    try {
      const { jsPDF } = await import('jspdf')

      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

      const writeWrapped = (
        doc: any,
        text: string,
        state: { y: number; pageHeight: number; margin: number; width: number },
        options?: { size?: number; bold?: boolean; gap?: number },
      ) => {
        const size = options?.size ?? 11
        const bold = options?.bold ?? false
        const gap = options?.gap ?? 6

        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setFontSize(size)
        const lines = doc.splitTextToSize(text || '', state.width) as string[]

        for (const line of lines) {
          if (state.y + size + 6 > state.pageHeight - state.margin) {
            doc.addPage()
            state.y = state.margin
          }
          doc.text(line, state.margin, state.y)
          state.y += size + 4
        }

        state.y += gap
      }

      for (const id of selectedItems) {
        const item = items.find((i) => i.id === id)
        if (!item) continue

        try {
          if (item.type === 'summary') {
            const data = await api.summaries.get(id)
            const doc = new jsPDF({ unit: 'pt', format: 'a4' })
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 42
            const width = doc.internal.pageSize.getWidth() - margin * 2
            const state = { y: margin, pageHeight, margin, width }

            const title = sanitizeFileName(item.title || data?.title || 'summary', 'summary')
            const createdAt = item.created_at || data?.created_at
            const summaryText =
              data?.content_raw ||
              data?.content ||
              data?.body ||
              (data?.format === 'cornell'
                ? `CUES\n${data?.cornell_cues || ''}\n\nNOTES\n${data?.cornell_notes || ''}\n\nSUMMARY\n${data?.cornell_summary || ''}`
                : '') ||
              'No content available.'

            writeWrapped(doc, title, state, { size: 17, bold: true, gap: 3 })
            writeWrapped(doc, `Type: Summary`, state, { size: 10, gap: 2 })
            writeWrapped(doc, `Generated: ${createdAt ? new Date(createdAt).toLocaleString() : '-'}`, state, { size: 10, gap: 10 })
            writeWrapped(doc, summaryText, state, { size: 11, gap: 6 })

            doc.save(`${title}-${id.slice(0, 8)}.pdf`)
          } else if (item.type === 'quiz') {
            const data = await api.quizzes.get(id)
            const doc = new jsPDF({ unit: 'pt', format: 'a4' })
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 42
            const width = doc.internal.pageSize.getWidth() - margin * 2
            const state = { y: margin, pageHeight, margin, width }

            const title = sanitizeFileName(item.title || data?.title || 'quiz', 'quiz')
            const createdAt = item.created_at || data?.created_at

            let questions: any[] = []
            if (Array.isArray(data?.questions)) {
              questions = data.questions
            } else if (Array.isArray(data?.questions_json)) {
              questions = data.questions_json
            } else if (typeof data?.questions_json === 'string') {
              try {
                const parsed = JSON.parse(data.questions_json)
                if (Array.isArray(parsed)) questions = parsed
              } catch {
                questions = []
              }
            }

            writeWrapped(doc, title, state, { size: 17, bold: true, gap: 3 })
            writeWrapped(doc, `Type: Quiz`, state, { size: 10, gap: 2 })
            writeWrapped(doc, `Generated: ${createdAt ? new Date(createdAt).toLocaleString() : '-'}`, state, { size: 10, gap: 10 })

            if (questions.length === 0) {
              writeWrapped(doc, 'No questions available.', state, { size: 11 })
            } else {
              questions.forEach((q: any, index: number) => {
                const qText = q?.question || q?.text || `Question ${index + 1}`
                const options = Array.isArray(q?.options)
                  ? q.options
                  : Array.isArray(q?.answers)
                    ? q.answers
                    : []
                const correctIdx = Number.isInteger(q?.correct_index) ? q.correct_index : (Number.isInteger(q?.correctIndex) ? q.correctIndex : null)
                const correctAnswer =
                  correctIdx !== null && options[correctIdx] !== undefined
                    ? options[correctIdx]
                    : (q?.correct_answer || q?.correctAnswer || 'N/A')

                writeWrapped(doc, `${index + 1}. ${qText}`, state, { size: 12, bold: true, gap: 2 })
                options.forEach((opt: string, optIdx: number) => {
                  writeWrapped(doc, `- ${String.fromCharCode(65 + optIdx)}. ${opt}`, state, { size: 11, gap: 1 })
                })
                writeWrapped(doc, `Correct answer: ${correctAnswer}`, state, { size: 10, gap: 7 })
              })
            }

            doc.save(`${title}-${id.slice(0, 8)}.pdf`)
          } else if (item.type === 'flashcard' || item.type === 'flashcards') {
            const data = await api.flashcards.getDeck(id)
            const doc = new jsPDF({ unit: 'pt', format: 'a4' })
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 42
            const width = doc.internal.pageSize.getWidth() - margin * 2
            const state = { y: margin, pageHeight, margin, width }

            const title = sanitizeFileName(item.title || data?.deck?.title || 'flashcards', 'flashcards')
            const createdAt = item.created_at || data?.deck?.created_at
            const cards = Array.isArray(data?.cards) ? data.cards : []

            writeWrapped(doc, title, state, { size: 17, bold: true, gap: 3 })
            writeWrapped(doc, `Type: Flashcards`, state, { size: 10, gap: 2 })
            writeWrapped(doc, `Generated: ${createdAt ? new Date(createdAt).toLocaleString() : '-'}`, state, { size: 10, gap: 10 })

            if (cards.length === 0) {
              writeWrapped(doc, 'No flashcards available.', state, { size: 11 })
            } else {
              cards.forEach((card: any, index: number) => {
                const front = card?.front || card?.question || card?.term || `Card ${index + 1}`
                const back = card?.back || card?.answer || card?.definition || ''

                writeWrapped(doc, `${index + 1}. Front: ${front}`, state, { size: 12, bold: true, gap: 2 })
                writeWrapped(doc, `Back: ${back || 'N/A'}`, state, { size: 11, gap: 8 })
              })
            }

            doc.save(`${title}-${id.slice(0, 8)}.pdf`)
          }
          await wait(120)
        } catch {
          // Continue with remaining selections even if one export fails.
        }
      }
    } finally {
      setIsExporting(false)
    }
  }

  const getItemRoute = (item: any) => {
    if (item.type === 'summary') return `/summary/${item.id}`
    if (item.type === 'quiz') return `/quiz/take/${item.id}`
    if (item.type === 'flashcard' || item.type === 'flashcards') return `/flashcards/study/${item.id}`
    return '/library'
  }

  const displayItems = activeTab === 'favorites'
    ? items.filter((item) => Boolean(item?.is_favorite))
    : items

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
                <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {isExporting ? 'Exporting...' : 'Export'}
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
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'all' | 'favorites')} className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="all">All Items</TabsTrigger>
                <TabsTrigger value="favorites">Favorites</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-0">
                {isLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : displayItems.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="h-16 w-16 bg-secondary/50 rounded-full flex items-center justify-center mb-4 mx-auto">
                      <Search className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">
                      {activeTab === 'favorites' ? 'No favorites yet' : 'No items found'}
                    </h3>
                    <p className="text-muted-foreground mt-2">
                      {activeTab === 'favorites'
                        ? 'Star content to see it in Favorites.'
                        : 'Create your first summary to get started.'}
                    </p>
                    {activeTab !== 'favorites' && (
                      <Button className="mt-4" onClick={() => navigate('/create')}>Create Content</Button>
                    )}
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {displayItems.map((item: any) => (
                      <Card
                        key={item.id}
                        className={cn(
                          'group relative transition-all hover:shadow-md cursor-pointer border-l-4',
                          selectedItems.includes(item.id) ? 'ring-2 ring-primary border-primary' : 'border-l-transparent',
                        )}
                      >
                        {item.is_favorite && (
                          <div className="absolute top-3 right-3 z-10">
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          </div>
                        )}
                        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
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
                          </div>
                          <h3 className="font-semibold text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors">
                            {item.title}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                            <Calendar className="h-3 w-3" />
                            <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</span>
                          </div>
                          {item.type !== 'summary' && (item.tags || []).length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {(item.tags || []).map((tag: string) => (
                                <Badge key={tag} variant="secondary" className="text-xs font-normal">{tag}</Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayItems.map((item: any) => (
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
                        {item.type !== 'summary' && (item.tags || []).length > 0 && (
                          <div className="hidden md:flex items-center gap-2">
                            {(item.tags || []).map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-xs font-normal">{tag}</Badge>
                            ))}
                          </div>
                        )}
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
