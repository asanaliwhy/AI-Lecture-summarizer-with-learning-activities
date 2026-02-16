import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError, type LibraryItemResponse, type LibraryItemType } from '../lib/api'
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
  Heart,
  Loader2,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'

type LibraryTab = 'all' | 'favorites'
type ViewMode = 'grid' | 'list'
type TypeFilter = 'all' | 'summary' | 'quiz' | 'flashcards'

type NormalizedLibraryItemType = 'summary' | 'quiz' | 'flashcard'

interface LibraryItem extends Omit<LibraryItemResponse, 'type'> {
  type: NormalizedLibraryItemType
}

const normalizeItemType = (type: LibraryItemType): NormalizedLibraryItemType => {
  const value = String(type || '').toLowerCase()
  if (value === 'quiz') return 'quiz'
  if (value === 'flashcard' || value === 'flashcards') return 'flashcard'
  return 'summary'
}

const normalizeLibraryItems = (items: LibraryItemResponse[] | undefined): LibraryItem[] => {
  if (!Array.isArray(items)) return []

  return items
    .filter((item): item is LibraryItemResponse & { id: string } => typeof item?.id === 'string' && item.id.trim().length > 0)
    .map((item) => ({
      ...item,
      id: item.id.trim(),
      type: normalizeItemType(item.type),
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) : [],
      title: String(item.title || 'Untitled').trim() || 'Untitled',
    }))
}

export function LibraryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [items, setItems] = useState<LibraryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [activeTab, setActiveTab] = useState<LibraryTab>('all')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

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
    let isAlive = true

    async function load() {
      setIsLoading(true)
      setLoadError(null)

      try {
        const params: Record<string, string> = {}
        if (debouncedSearchQuery) params.search = debouncedSearchQuery
        if (typeFilter !== 'all') {
          params.type = typeFilter === 'flashcards' ? 'flashcard' : typeFilter
        }
        const data = await api.library.list(params)

        if (!isAlive) return
        setItems(normalizeLibraryItems(data.items))
      } catch (err: unknown) {
        if (!isAlive) return

        const message = err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load library items'

        setItems([])
        setLoadError(message)
      } finally {
        if (isAlive) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      isAlive = false
    }
  }, [debouncedSearchQuery, typeFilter])

  const reloadLibrary = async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const params: Record<string, string> = {}
      if (debouncedSearchQuery) params.search = debouncedSearchQuery
      if (typeFilter !== 'all') {
        params.type = typeFilter === 'flashcards' ? 'flashcard' : typeFilter
      }

      const data = await api.library.list(params)
      setItems(normalizeLibraryItems(data.items))
    } catch (err: unknown) {
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to load library items'

      setItems([])
      setLoadError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleDelete = async () => {
    if (selectedItems.length === 0 || isDeleting) return

    setIsDeleting(true)

    const failed: string[] = []
    const succeeded: string[] = []

    for (const id of selectedItems) {
      const item = items.find((i) => i.id === id)
      if (!item) {
        failed.push(id)
        continue
      }

      try {
        if (item.type === 'summary') {
          await api.summaries.delete(id)
        } else if (item.type === 'quiz') {
          await api.quizzes.delete(id)
        } else {
          await api.flashcards.deleteDeck(id)
        }
        succeeded.push(id)
      } catch {
        failed.push(id)
      }
    }

    const params: Record<string, string> = {}
    if (debouncedSearchQuery) params.search = debouncedSearchQuery
    if (typeFilter !== 'all') {
      params.type = typeFilter === 'flashcards' ? 'flashcard' : typeFilter
    }

    try {
      const data = await api.library.list(params)
      setItems(normalizeLibraryItems(data.items))
    } catch (err: unknown) {
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to refresh library after delete'
      setLoadError(message)
      toast.error(message)
    } finally {
      setIsDeleting(false)
      setSelectedItems(failed)
    }

    if (succeeded.length > 0 && failed.length === 0) {
      toast.success(`Deleted ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}`)
    } else if (succeeded.length > 0 && failed.length > 0) {
      toast.warning(`Deleted ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}, ${failed.length} failed`)
    } else if (failed.length > 0) {
      toast.error(`Failed to delete ${failed.length} item${failed.length === 1 ? '' : 's'}`)
    }
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
        doc: {
          setFont: (family: string, style: 'bold' | 'normal') => void
          setFontSize: (size: number) => void
          splitTextToSize: (text: string, width: number) => string[]
          addPage: () => void
          text: (text: string, x: number, y: number) => void
        },
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

      let successCount = 0
      let failureCount = 0

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

            let questions: Array<Record<string, unknown>> = []
            if (Array.isArray(data?.questions)) {
              questions = data.questions as Array<Record<string, unknown>>
            } else if (Array.isArray(data?.questions_json)) {
              questions = data.questions_json as Array<Record<string, unknown>>
            } else if (typeof data?.questions_json === 'string') {
              try {
                const parsed = JSON.parse(data.questions_json)
                if (Array.isArray(parsed)) questions = parsed as Array<Record<string, unknown>>
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
              questions.forEach((q, index: number) => {
                const qText = String((q?.question as string) || (q?.text as string) || `Question ${index + 1}`)
                const options = Array.isArray(q?.options)
                  ? (q.options as unknown[]).map((opt) => String(opt))
                  : Array.isArray(q?.answers)
                    ? (q.answers as unknown[]).map((opt) => String(opt))
                    : []
                const correctIdx = Number.isInteger(q?.correct_index)
                  ? Number(q.correct_index)
                  : Number.isInteger(q?.correctIndex)
                    ? Number(q.correctIndex)
                    : null
                const hasValidCorrectIdx = correctIdx !== null && correctIdx >= 0 && correctIdx < options.length
                const correctAnswer =
                  hasValidCorrectIdx
                    ? options[correctIdx]
                    : String((q?.correct_answer as string) || (q?.correctAnswer as string) || 'N/A')

                writeWrapped(doc, `${index + 1}. ${qText}`, state, { size: 12, bold: true, gap: 2 })
                options.forEach((opt: string, optIdx: number) => {
                  writeWrapped(doc, `- ${String.fromCharCode(65 + optIdx)}. ${opt}`, state, { size: 11, gap: 1 })
                })
                writeWrapped(doc, `Correct answer: ${correctAnswer}`, state, { size: 10, gap: 7 })
              })
            }

            doc.save(`${title}-${id.slice(0, 8)}.pdf`)
          } else if (item.type === 'flashcard') {
            const data = await api.flashcards.getDeck(id)
            const doc = new jsPDF({ unit: 'pt', format: 'a4' })
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 42
            const width = doc.internal.pageSize.getWidth() - margin * 2
            const state = { y: margin, pageHeight, margin, width }

            const title = sanitizeFileName(item.title || data?.deck?.title || 'flashcards', 'flashcards')
            const createdAt = item.created_at || data?.deck?.created_at
            const cards = Array.isArray(data?.cards) ? (data.cards as Array<Record<string, unknown>>) : []

            writeWrapped(doc, title, state, { size: 17, bold: true, gap: 3 })
            writeWrapped(doc, `Type: Flashcards`, state, { size: 10, gap: 2 })
            writeWrapped(doc, `Generated: ${createdAt ? new Date(createdAt).toLocaleString() : '-'}`, state, { size: 10, gap: 10 })

            if (cards.length === 0) {
              writeWrapped(doc, 'No flashcards available.', state, { size: 11 })
            } else {
              cards.forEach((card: Record<string, unknown>, index: number) => {
                const front = String((card?.front as string) || (card?.question as string) || (card?.term as string) || `Card ${index + 1}`)
                const back = String((card?.back as string) || (card?.answer as string) || (card?.definition as string) || '')

                writeWrapped(doc, `${index + 1}. Front: ${front}`, state, { size: 12, bold: true, gap: 2 })
                writeWrapped(doc, `Back: ${back || 'N/A'}`, state, { size: 11, gap: 8 })
              })
            }

            doc.save(`${title}-${id.slice(0, 8)}.pdf`)
          }
          successCount += 1
          await wait(120)
        } catch {
          failureCount += 1
        }
      }

      if (successCount > 0 && failureCount === 0) {
        toast.success(`Exported ${successCount} item${successCount === 1 ? '' : 's'} as PDF`)
      } else if (successCount > 0 && failureCount > 0) {
        toast.warning(`Exported ${successCount} item${successCount === 1 ? '' : 's'}, ${failureCount} failed`)
      } else if (failureCount > 0) {
        toast.error(`Export failed for ${failureCount} item${failureCount === 1 ? '' : 's'}`)
      }
    } finally {
      setIsExporting(false)
    }
  }

  const getItemRoute = (item: LibraryItem) => {
    if (item.type === 'summary') return `/summary/${item.id}`
    if (item.type === 'quiz') return `/quiz/take/${item.id}`
    if (item.type === 'flashcard') return `/flashcards/study/${item.id}`
    return '/library'
  }

  const displayItems = activeTab === 'favorites'
    ? items.filter((item) => Boolean(item?.is_favorite))
    : items

  const summaryCount = items.filter((item) => item?.type === 'summary').length
  const quizCount = items.filter((item) => item?.type === 'quiz').length
  const flashcardCount = items.filter((item) => item?.type === 'flashcard').length
  const favoriteCount = items.filter((item) => Boolean(item?.is_favorite)).length

  const getTypeMeta = (type: NormalizedLibraryItemType) => {
    if (type === 'summary') {
      return {
        label: 'Summary',
        icon: FileText,
        iconClass: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
        badgeClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/40',
        railClass: 'from-blue-500/50 to-blue-300/20',
      }
    }

    if (type === 'quiz') {
      return {
        label: 'Quiz',
        icon: BrainCircuit,
        iconClass: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40',
        railClass: 'from-emerald-500/50 to-emerald-300/20',
      }
    }

    return {
      label: 'Flashcards',
      icon: Layers,
      iconClass: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40',
      railClass: 'from-amber-500/50 to-amber-300/20',
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full gap-6">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background to-secondary/30 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Library</h1>
              <p className="text-muted-foreground">Manage your generated content.</p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-xl border bg-background/80 p-1 backdrop-blur">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                className={cn('rounded-lg', viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground')}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('list')}
                aria-label="List view"
                className={cn('rounded-lg', viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground')}
              >
                <ListIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: items.length, icon: Search },
              { label: 'Favorites', value: favoriteCount, icon: Heart },
              { label: 'Summaries', value: summaryCount, icon: FileText },
              { label: 'Quizzes / Flashcards', value: quizCount + flashcardCount, icon: BrainCircuit },
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

        {selectedItems.length > 0 && (
          <div className="rounded-xl border bg-card p-3 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {selectedItems.length} selected
              </span>
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting || isExporting}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting || isDeleting}>
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {isExporting ? 'Exporting...' : 'Export'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Filters Sidebar */}
          <div className="lg:col-span-3 space-y-6">
            <Card className="border shadow-sm">
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
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5" />
                    Type
                  </h3>
                  <div className="space-y-2">
                    {([
                      { id: 'all', label: 'All Content' },
                      { id: 'summary', label: 'Summaries' },
                      { id: 'quiz', label: 'Quizzes' },
                      { id: 'flashcards', label: 'Flashcards' },
                    ] as Array<{ id: TypeFilter; label: string }>).map(opt => (
                      <div key={opt.id} className={cn(
                        'flex items-center space-x-2 rounded-lg border px-3 py-2 transition-colors',
                        typeFilter === opt.id ? 'bg-secondary/60 border-primary/30' : 'hover:bg-secondary/30',
                      )}>
                        <Checkbox
                          id={opt.id}
                          checked={typeFilter === opt.id}
                          aria-label={`Filter ${opt.label}`}
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
              <TabsList className="mb-6 bg-muted/70 border">
                <TabsTrigger value="all">All Items</TabsTrigger>
                <TabsTrigger value="favorites">Favorites</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-0">
                {isLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : loadError ? (
                  <div className="text-center py-16 border rounded-xl bg-secondary/10">
                    <h3 className="text-lg font-semibold mb-2">Failed to load library</h3>
                    <p className="text-muted-foreground mb-4">{loadError}</p>
                    <Button onClick={reloadLibrary}>Retry</Button>
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
                    {displayItems.map((item) => {
                      const typeMeta = getTypeMeta(item.type)
                      const TypeIcon = typeMeta.icon
                      const itemRoute = getItemRoute(item)

                      return (
                        <Card
                          key={item.id}
                          className={cn(
                            'group relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer border',
                            selectedItems.includes(item.id) ? 'ring-2 ring-primary border-primary shadow-md' : 'border-border/70',
                          )}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open ${item.title}`}
                          onClick={() => navigate(itemRoute)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(itemRoute)
                            }
                          }}
                        >
                          <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', typeMeta.railClass)} />
                          {item.is_favorite && (
                            <div className="absolute top-3 right-3 z-10 rounded-full bg-background/85 p-1 shadow-sm">
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            </div>
                          )}
                          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 rounded-md bg-background/85 p-1 shadow-sm">
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              aria-label={`Select ${item.title}`}
                              onCheckedChange={() => toggleSelection(item.id)}
                            />
                          </div>
                          <CardContent
                            className="p-6 pt-7"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div className={cn('p-2 rounded-lg', typeMeta.iconClass)}>
                                <TypeIcon className="h-5 w-5" />
                              </div>
                              <Badge variant="outline" className={cn('text-[11px] font-medium', typeMeta.badgeClass)}>
                                {typeMeta.label}
                              </Badge>
                            </div>
                            <h3 className="font-semibold text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors">
                              {item.title}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 rounded-md bg-secondary/40 px-2 py-1 w-fit">
                              <Calendar className="h-3 w-3" />
                              <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</span>
                            </div>
                            {item.type !== 'summary' && (item.tags || []).length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {(item.tags || []).slice(0, 4).map((tag: string) => (
                                  <Badge key={tag} variant="secondary" className="text-xs font-normal">{tag}</Badge>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displayItems.map((item) => {
                      const typeMeta = getTypeMeta(item.type)
                      const TypeIcon = typeMeta.icon
                      const itemRoute = getItemRoute(item)

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'flex items-center gap-4 p-4 rounded-xl border bg-card shadow-sm hover:bg-secondary/20 transition-colors cursor-pointer group',
                            selectedItems.includes(item.id) ? 'bg-secondary/30 border-primary shadow' : 'border-border/70',
                          )}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open ${item.title}`}
                          onClick={() => navigate(itemRoute)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(itemRoute)
                            }
                          }}
                        >
                          <Checkbox
                            checked={selectedItems.includes(item.id)}
                            aria-label={`Select ${item.title}`}
                            onCheckedChange={() => toggleSelection(item.id)}
                          />
                          <div className={cn('p-2 rounded-lg shrink-0', typeMeta.iconClass)}>
                            <TypeIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                            <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                              {item.title}
                            </h3>
                          </div>
                          {item.type !== 'summary' && (item.tags || []).length > 0 && (
                            <div className="hidden md:flex items-center gap-2">
                              {(item.tags || []).slice(0, 3).map((tag: string) => (
                                <Badge key={tag} variant="secondary" className="text-xs font-normal">{tag}</Badge>
                              ))}
                            </div>
                          )}
                          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground w-24 justify-end rounded-md bg-secondary/40 px-2 py-1">
                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                          </div>
                          <div className="w-8 flex justify-end">
                            {item.is_favorite && (
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            )}
                          </div>
                        </div>
                      )
                    })}
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
