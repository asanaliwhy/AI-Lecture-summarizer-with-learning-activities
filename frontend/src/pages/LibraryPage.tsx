import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  api,
  ApiError,
  type LibraryItemResponse,
  type LibraryItemType,
  type SummaryDetailResponse,
  type QuizAttemptDetailsResponse,
  type QuizDetailResponse,
  type FolderResponse,
} from '../lib/api'
import { exportQuizResultsPdf } from './QuizResultsPage'
import { exportFlashcardResultsPdf } from './FlashcardResultPage'
import { exportSummaryPdfFromData } from './SummaryPage'
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
  Presentation,
  Calendar,
  Grid,
  List as ListIcon,
  Trash2,
  Download,
  Star,
  Heart,
  Loader2,
  Folder,
  FolderPlus,
  FolderInput,
  FolderEdit,
  FolderOpen,
  X,
  CheckCircle,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import type { jsPDF } from 'jspdf'

type LibraryTab = string
type ViewMode = 'grid' | 'list'
type TypeFilter = 'all' | 'summary' | 'quiz' | 'flashcards' | 'presentations'

type NormalizedLibraryItemType = 'summary' | 'quiz' | 'flashcard' | 'presentation'

interface LibraryItem extends Omit<LibraryItemResponse, 'type'> {
  type: NormalizedLibraryItemType
}

type QuizExportPayload = QuizAttemptDetailsResponse | QuizDetailResponse

const normalizeItemType = (type: LibraryItemType): NormalizedLibraryItemType => {
  const value = String(type || '').toLowerCase()
  if (value === 'quiz') return 'quiz'
  if (value === 'flashcard' || value === 'flashcards') return 'flashcard'
  if (value === 'presentation' || value === 'presentations') return 'presentation'
  return 'summary'
}

const mapTypeFilterToApiType = (typeFilter: TypeFilter): string | null => {
  if (typeFilter === 'all') return null
  if (typeFilter === 'flashcards') return 'flashcard'
  if (typeFilter === 'presentations') return 'presentation'
  return typeFilter
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
  const [folders, setFolders] = useState<FolderResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [targetFolderId, setTargetFolderId] = useState<string>('')
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

    if (type === 'presentations' || type === 'presentation') {
      setTypeFilter('presentations')
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
        const apiType = mapTypeFilterToApiType(typeFilter)
        if (apiType) {
          params.type = apiType
        }
        const [data, foldersData] = await Promise.all([
          api.library.list(params),
          api.folders.list().catch(() => ({ folders: [] })) // Silently fail if folders fetch fails
        ])

        if (!isAlive) return
        setItems(normalizeLibraryItems(data.items))
        setFolders(foldersData.folders || [])
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
      const apiType = mapTypeFilterToApiType(typeFilter)
      if (apiType) {
        params.type = apiType
      }

      const [data, foldersData] = await Promise.all([
        api.library.list(params),
        api.folders.list().catch(() => ({ folders: [] }))
      ])
      setItems(normalizeLibraryItems(data.items))
      setFolders(foldersData.folders || [])
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
        } else if (item.type === 'presentation') {
          await api.presentations.delete(id)
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
    const apiType = mapTypeFilterToApiType(typeFilter)
    if (apiType) {
      params.type = apiType
    }

    try {
      const [data, foldersData] = await Promise.all([
        api.library.list(params),
        api.folders.list().catch(() => ({ folders: [] }))
      ])
      setItems(normalizeLibraryItems(data.items))
      setFolders(foldersData.folders || [])
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

      const stripInlineMarkdown = (value: string): string =>
        String(value || '')
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/__(.*?)__/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\s+/g, ' ')
          .trim()

      const isTableSeparator = (line: string): boolean => /^\|\s*:?-{3,}.*\|$/.test(line.trim())

      const parseTableRow = (line: string): string[] =>
        line
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => stripInlineMarkdown(cell))

      const parseSmartSections = (markdown: string): Array<{ heading: string; lines: string[] }> => {
        const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
        const sections: Array<{ heading: string; lines: string[] }> = []

        let heading = 'Summary'
        let buffer: string[] = []

        const flush = () => {
          const cleaned = buffer.map((line) => line.trim()).filter(Boolean)
          if (cleaned.length > 0) {
            sections.push({ heading: stripInlineMarkdown(heading), lines: cleaned })
          }
          buffer = []
        }

        for (const raw of lines) {
          const line = raw.trim()
          const headingMatch = line.match(/^#{1,6}\s+(.+)$/)
          if (headingMatch) {
            flush()
            heading = headingMatch[1]
            continue
          }

          const numberedHeading = line.match(/^\d+[.)]\s+(.+)$/)
          if (numberedHeading) {
            flush()
            heading = numberedHeading[1]
            continue
          }

          buffer.push(raw)
        }

        flush()
        return sections
      }

      const formatPdfDate = (value?: string): string => {
        if (!value) return '-'
        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) return '-'
        const dd = String(parsed.getDate()).padStart(2, '0')
        const mm = String(parsed.getMonth() + 1).padStart(2, '0')
        const yyyy = String(parsed.getFullYear())
        return `${dd}.${mm}.${yyyy}`
      }

      const drawSmartSummaryPdf = (
        doc: jsPDF,
        state: { y: number; pageHeight: number; margin: number; width: number },
        payload: {
          title: string
          sourceLabel: string
          generatedAt: string
          tags: string[]
          markdown: string
        },
      ) => {
        const ensurePage = (needed: number) => {
          if (state.y + needed > state.pageHeight - state.margin) {
            doc.addPage()
            state.y = state.margin
          }
        }

        const setFill = (r: number, g: number, b: number) => {
          if (typeof doc.setFillColor === 'function') doc.setFillColor(r, g, b)
        }

        const setDraw = (r: number, g: number, b: number) => {
          if (typeof doc.setDrawColor === 'function') doc.setDrawColor(r, g, b)
        }

        const drawRect = (x: number, y: number, w: number, h: number, mode: 'F' | 'FD' | undefined = undefined) => {
          if (typeof doc.rect === 'function') {
            doc.rect(x, y, w, h, mode)
          }
        }

        // Badge strip
        ensurePage(22)
        setFill(232, 236, 247)
        drawRect(state.margin, state.y, state.width, 16, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('SMART SUMMARY', state.margin + 8, state.y + 11)
        state.y += 30

        // Large title
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(25)
        const titleLines = doc.splitTextToSize(payload.title, state.width) as string[]
        for (const line of titleLines) {
          ensurePage(26)
          doc.text(line, state.margin, state.y)
          state.y += 26
        }
        state.y += 2

        // Meta line
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        ensurePage(14)
        doc.text(`Source: ${payload.sourceLabel} · Generated: ${payload.generatedAt}`, state.margin, state.y)
        state.y += 12

        // Chips row
        const tags = payload.tags.filter(Boolean).slice(0, 5)
        if (tags.length > 0) {
          const chipGap = 6
          const chipW = (state.width - chipGap * (tags.length - 1)) / tags.length
          const chipH = 18
          ensurePage(chipH + 10)

          tags.forEach((tag, index) => {
            const x = state.margin + index * (chipW + chipGap)
            setFill(209, 250, 229)
            drawRect(x, state.y, chipW, chipH, 'F')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(10)
            const chipText = stripInlineMarkdown(tag)
            const line = (doc.splitTextToSize(chipText, chipW - 10) as string[])[0] || chipText
            doc.text(line, x + 5, state.y + 12)
          })

          state.y += chipH + 10
        }

        // Accent divider
        ensurePage(2)
        setFill(79, 70, 229)
        drawRect(state.margin, state.y, state.width, 1.4, 'F')
        state.y += 14

        const sections = parseSmartSections(payload.markdown)

        const drawParagraph = (text: string) => {
          const wrapped = doc.splitTextToSize(stripInlineMarkdown(text), state.width) as string[]
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(12)
          for (const line of wrapped) {
            ensurePage(16)
            doc.text(line, state.margin, state.y)
            state.y += 16
          }
          state.y += 4
        }

        const drawBullet = (text: string) => {
          const wrapped = doc.splitTextToSize(stripInlineMarkdown(text), state.width - 16) as string[]
          if (wrapped.length === 0) return

          ensurePage(16)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(12)
          doc.text('•', state.margin, state.y)
          doc.text(wrapped[0], state.margin + 12, state.y)
          state.y += 16

          for (const line of wrapped.slice(1)) {
            ensurePage(16)
            doc.text(line, state.margin + 12, state.y)
            state.y += 16
          }
        }

        const drawKeyCard = (label: string, title: string, detail: string) => {
          const cardX = state.margin + 6
          const cardW = state.width - 6
          const padX = 10

          const titleText = `${label}: ${title}`
          const titleLines = doc.splitTextToSize(stripInlineMarkdown(titleText), cardW - padX * 2 - 6) as string[]
          const detailLines = detail
            ? (doc.splitTextToSize(stripInlineMarkdown(detail), cardW - padX * 2 - 6) as string[])
            : []

          const titleH = Math.max(14, titleLines.length * 14)
          const detailH = detailLines.length > 0 ? detailLines.length * 13 + 4 : 0
          const cardH = Math.max(42, 10 + titleH + detailH + 8)

          ensurePage(cardH + 8)
          setFill(238, 242, 255)
          drawRect(cardX, state.y, cardW, cardH, 'F')
          setFill(79, 70, 229)
          drawRect(cardX + cardW - 2, state.y, 2, cardH, 'F')

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(12)
          doc.text(titleLines, cardX + padX, state.y + 16, { maxWidth: cardW - padX * 2 - 6 })

          if (detailLines.length > 0) {
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(11)
            doc.text(detailLines, cardX + padX, state.y + 16 + titleH + 2, { maxWidth: cardW - padX * 2 - 6 })
          }

          state.y += cardH + 8
        }

        const drawMarkdownTable = (headers: string[], rows: string[][]) => {
          const colCount = Math.max(headers.length, ...rows.map((r) => r.length), 2)
          const colWidth = state.width / colCount

          const normalizeRow = (row: string[]): string[] => {
            const normalized = [...row]
            while (normalized.length < colCount) normalized.push('')
            return normalized.slice(0, colCount)
          }

          const headerRow = normalizeRow(headers)
          const dataRows = rows.map(normalizeRow)

          const getLayout = (cells: string[]) => {
            const cellLines = cells.map((cell) =>
              doc.splitTextToSize(stripInlineMarkdown(cell || '—'), Math.max(colWidth - 10, 24)) as string[],
            )
            const rowHeight = Math.max(22, Math.max(...cellLines.map((group) => group.length)) * 13 + 8)
            return { cellLines, rowHeight }
          }

          const drawRow = (cells: string[], isHeader: boolean) => {
            const { cellLines, rowHeight } = getLayout(cells)
            ensurePage(rowHeight)

            for (let c = 0; c < colCount; c += 1) {
              const x = state.margin + c * colWidth
              setDraw(203, 213, 225)
              if (isHeader) {
                setFill(241, 245, 249)
                drawRect(x, state.y, colWidth, rowHeight, 'FD')
              } else {
                drawRect(x, state.y, colWidth, rowHeight)
              }

              doc.setFont('helvetica', isHeader ? 'bold' : 'normal')
              doc.setFontSize(isHeader ? 10.5 : 10)
              doc.text(cellLines[c], x + 5, state.y + 14, { maxWidth: Math.max(colWidth - 10, 24) })
            }

            state.y += rowHeight
          }

          state.y += 2
          drawRow(headerRow, true)
          dataRows.forEach((row) => drawRow(row, false))
          state.y += 10
        }

        sections.forEach((section, sectionIndex) => {
          ensurePage(20)
          if (typeof doc.setFillColor === 'function') {
            doc.setFillColor(79, 70, 229)
          }
          if (typeof doc.circle === 'function') {
            doc.circle(state.margin + 3.2, state.y - 4.6, 3.2, 'F')
          } else {
            drawRect(state.margin, state.y - 8, 6, 6, 'F')
          }

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(16)
          const headingLines = doc.splitTextToSize(stripInlineMarkdown(section.heading), state.width - 16) as string[]
          doc.text(headingLines, state.margin + 13, state.y)
          state.y += Math.max(18, headingLines.length * 16)

          let i = 0
          while (i < section.lines.length) {
            const line = section.lines[i].trim()
            if (!line) {
              i += 1
              continue
            }

            const next = (section.lines[i + 1] || '').trim()
            const isTableHeader = line.startsWith('|') && line.endsWith('|') && isTableSeparator(next)
            if (isTableHeader) {
              const headers = parseTableRow(line)
              const rows: string[][] = []
              i += 2
              while (i < section.lines.length) {
                const rowLine = (section.lines[i] || '').trim()
                if (!(rowLine.startsWith('|') && rowLine.endsWith('|'))) break
                rows.push(parseTableRow(rowLine))
                i += 1
              }
              if (headers.length > 0 && rows.length > 0) {
                drawMarkdownTable(headers, rows)
              }
              continue
            }

            if (/^[-*+]\s+/.test(line)) {
              while (i < section.lines.length) {
                const bulletLine = (section.lines[i] || '').trim()
                if (!/^[-*+]\s+/.test(bulletLine)) break
                drawBullet(bulletLine.replace(/^[-*+]\s+/, ''))
                i += 1
              }
              state.y += 4
              continue
            }

            const keyMatch = stripInlineMarkdown(line).match(/^(Key Concept|Definition|Figure)\s*:\s*(.+)$/i)
            if (keyMatch) {
              const label = keyMatch[1]
              const title = keyMatch[2]
              const details: string[] = []
              i += 1
              while (i < section.lines.length) {
                const d = (section.lines[i] || '').trim()
                if (!d) {
                  i += 1
                  if (details.length > 0) break
                  continue
                }
                if (/^[-*+]\s+/.test(d) || d.match(/^(#{1,6}|\d+[.)])\s+/) || stripInlineMarkdown(d).match(/^(Key Concept|Definition|Figure)\s*:/i)) {
                  break
                }
                if (d.startsWith('|') && d.endsWith('|')) break
                details.push(stripInlineMarkdown(d))
                i += 1
              }
              drawKeyCard(label, title, details.join(' '))
              continue
            }

            const paragraphLines: string[] = [stripInlineMarkdown(line)]
            i += 1
            while (i < section.lines.length) {
              const candidate = (section.lines[i] || '').trim()
              if (!candidate) {
                i += 1
                break
              }
              if (
                /^[-*+]\s+/.test(candidate) ||
                stripInlineMarkdown(candidate).match(/^(Key Concept|Definition|Figure)\s*:/i) ||
                candidate.match(/^(#{1,6}|\d+[.)])\s+/) ||
                (candidate.startsWith('|') && candidate.endsWith('|'))
              ) {
                break
              }
              paragraphLines.push(stripInlineMarkdown(candidate))
              i += 1
            }

            drawParagraph(paragraphLines.join(' '))
          }

          if (sectionIndex < sections.length - 1) {
            ensurePage(12)
            setFill(229, 231, 235)
            drawRect(state.margin, state.y, state.width, 1, 'F')
            state.y += 14
          }
        })
      }

      let successCount = 0
      let failureCount = 0
      let unsupportedCount = 0

      for (const id of selectedItems) {
        const item = items.find((i) => i.id === id)
        if (!item) continue

        if (item.type === 'presentation') {
          unsupportedCount += 1
          continue
        }

        try {
          if (item.type === 'summary') {
            const data = await api.summaries.get(id)
            const title = sanitizeFileName(item.title || data?.title || 'summary', 'summary')
            await exportSummaryPdfFromData({
              summary: data as SummaryDetailResponse,
              preferredFileTitle: title,
            })
          } else if (item.type === 'quiz') {
            const data = await api.quizzes.get(id)
            const title = sanitizeFileName(item.title || data?.title || 'quiz', 'quiz')
            const latestAttemptId = (data as { last_attempt_id?: string | null })?.last_attempt_id
            let attemptPayload: QuizExportPayload = data

            if (latestAttemptId) {
              try {
                attemptPayload = await api.quizzes.getAttempt(latestAttemptId)
              } catch {
                attemptPayload = data
              }
            }

            await exportQuizResultsPdf({
              attemptData: attemptPayload,
              preferredFileTitle: `${title} quiz results`,
            })
          } else if (item.type === 'flashcard') {
            const data = await api.flashcards.getDeck(id)
            const title = sanitizeFileName(item.title || data?.deck?.title || 'flashcards', 'flashcards')
            const cards = Array.isArray(data?.cards) ? (data.cards as Array<Record<string, unknown>>) : []

            const ratings = cards.reduce<Record<string, 'mastered' | 'learning'>>((acc, card, index) => {
              const rawId = card?.id
              const key = typeof rawId === 'string' && rawId.trim() ? rawId : `card-${index + 1}`
              const repetitions = Number(card?.repetitions ?? 0)
              acc[key] = Number.isFinite(repetitions) && repetitions > 0 ? 'mastered' : 'learning'
              return acc
            }, {})

            const exportCards = cards.map((card: Record<string, unknown>, index: number) => {
              const rawId = card?.id
              return {
                id: typeof rawId === 'string' && rawId.trim() ? rawId : `card-${index + 1}`,
                front: String((card?.front as string) || (card?.question as string) || (card?.term as string) || `Card ${index + 1}`),
                back: String((card?.back as string) || (card?.answer as string) || (card?.definition as string) || ''),
              }
            })

            await exportFlashcardResultsPdf({
              title,
              cards: exportCards,
              ratings,
              elapsedSeconds: 0,
              fileName: `${title}-${id.slice(0, 8)}`,
            })
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

      if (unsupportedCount > 0) {
        toast.warning(`Skipped ${unsupportedCount} presentation${unsupportedCount === 1 ? '' : 's'} (export arrives in Stage 3).`)
      }
    } finally {
      setIsExporting(false)
    }
  }

  const getItemRoute = (item: LibraryItem) => {
    if (item.type === 'summary') return `/summary/${item.id}`
    if (item.type === 'quiz') return `/quiz/take/${item.id}`
    if (item.type === 'flashcard') return `/flashcards/study/${item.id}`
    if (item.type === 'presentation') return `/presentations/${item.id}`
    return '/library'
  }

  const handleToggleFavorite = async (e: React.MouseEvent, item: LibraryItem) => {
    e.stopPropagation()
    
    // Optimistic UI update
    setItems((prev) => 
      prev.map((i) => i.id === item.id ? { ...i, is_favorite: !i.is_favorite } : i)
    )

    try {
      if (item.type === 'summary') {
        await api.summaries.toggleFavorite(item.id)
      } else if (item.type === 'quiz') {
        await api.quizzes.toggleFavorite(item.id)
      } else if (item.type === 'flashcard') {
        await api.flashcards.toggleFavorite(item.id)
      } else if (item.type === 'presentation') {
        await api.presentations.toggleFavorite(item.id)
      }
      toast.success(item.is_favorite ? 'Removed from favorites' : 'Added to favorites')
    } catch (err) {
      // Revert on error
      setItems((prev) => 
        prev.map((i) => i.id === item.id ? { ...i, is_favorite: item.is_favorite } : i)
      )
      console.error('Toggle favorite error:', err)
      toast.error('Failed to update favorite status')
    }
  }

  const displayItems = activeTab === 'favorites'
    ? items.filter((item) => Boolean(item?.is_favorite))
    : activeTab.startsWith('folder_')
      ? items.filter((item) => item.folder_id === activeTab.replace('folder_', ''))
      : items

  const summaryCount = items.filter((item) => item?.type === 'summary').length
  const quizCount = items.filter((item) => item?.type === 'quiz').length
  const flashcardCount = items.filter((item) => item?.type === 'flashcard').length
  const presentationCount = items.filter((item) => item?.type === 'presentation').length
  const favoriteCount = items.filter((item) => Boolean(item?.is_favorite)).length

  const getTypeMeta = (type: NormalizedLibraryItemType) => {
    if (type === 'summary') {
      return {
        label: 'Summary',
        icon: FileText,
        iconClass: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 ring-1 ring-blue-500/20',
        badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30',
        railClass: 'from-blue-500/80 to-blue-300/40',
      }
    }

    if (type === 'quiz') {
      return {
        label: 'Quiz',
        icon: BrainCircuit,
        iconClass: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 ring-1 ring-emerald-500/20',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
        railClass: 'from-emerald-500/80 to-emerald-300/40',
      }
    }

    if (type === 'presentation') {
      return {
        label: 'Presentation',
        icon: Presentation,
        iconClass: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 ring-1 ring-indigo-500/20',
        badgeClass: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30',
        railClass: 'from-indigo-500/80 to-indigo-300/40',
      }
    }

    return {
      label: 'Flashcards',
      icon: Layers,
      iconClass: 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 ring-1 ring-orange-500/20',
      badgeClass: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30',
      railClass: 'from-orange-500/80 to-orange-300/40',
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      const folder = await api.folders.create({ name: newFolderName, color: 'blue' })
      setFolders(prev => [folder, ...prev])
      setNewFolderName('')
      setIsCreateFolderOpen(false)
      toast.success('Folder created')
    } catch (err) {
      toast.error('Failed to create folder')
    }
  }

  const handleDeleteFolder = async (folderId: string) => {
    if (!window.confirm('Are you sure you want to delete this folder? Items inside will not be deleted.')) return
    try {
      await api.folders.delete(folderId)
      setFolders(prev => prev.filter(f => f.id !== folderId))
      if (activeTab === `folder_${folderId}`) setActiveTab('all')
      toast.success('Folder deleted')
    } catch (err) {
      toast.error('Failed to delete folder')
    }
  }

  const handleMoveToFolder = async () => {
    if (selectedItems.length === 0 || !targetFolderId || isMoving) return
    setIsMoving(true)
    
    // Group selected items by type
    const byType: Record<string, string[]> = {}
    for (const id of selectedItems) {
      const item = items.find(i => i.id === id)
      if (item) {
        if (!byType[item.type]) byType[item.type] = []
        byType[item.type].push(id)
      }
    }

    let successCount = 0
    let failCount = 0

    for (const [type, ids] of Object.entries(byType)) {
      try {
        if (targetFolderId === 'none') {
          await api.folders.removeItems(ids, type)
        } else {
          await api.folders.moveItems(targetFolderId, ids, type)
        }
        successCount += ids.length
      } catch {
        failCount += ids.length
      }
    }

    if (successCount > 0) {
      toast.success(`Moved ${successCount} items`)
      // Refresh items to update their folder_id
      const params: Record<string, string> = {}
      if (debouncedSearchQuery) params.search = debouncedSearchQuery
      const apiType = mapTypeFilterToApiType(typeFilter)
      if (apiType) params.type = apiType
      
      const [data, foldersData] = await Promise.all([
        api.library.list(params),
        api.folders.list().catch(() => ({ folders: [] }))
      ])
      setItems(normalizeLibraryItems(data.items))
      setFolders(foldersData.folders || [])
      setSelectedItems([])
      setIsMoveModalOpen(false)
    }
    if (failCount > 0) {
      toast.error(`Failed to move ${failCount} items`)
    }
    setIsMoving(false)
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
                { label: 'Quizzes / Flashcards / Presentations', value: quizCount + flashcardCount + presentationCount, icon: BrainCircuit },
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
                <Button variant="outline" size="sm" onClick={() => setIsMoveModalOpen(true)} disabled={isExporting || isDeleting || isMoving}>
                  <FolderInput className="h-4 w-4 mr-2" />
                  Move to Folder
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting || isDeleting || isMoving}>
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

        {isMoveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">Move to Folder</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsMoveModalOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Select a folder to move {selectedItems.length} items.</p>
              
              <div className="grid gap-2">
                <Button 
                  variant={targetFolderId === 'none' ? 'default' : 'outline'}
                  className="justify-start h-12"
                  onClick={() => setTargetFolderId('none')}
                >
                  <X className="h-4 w-4 mr-3" />
                  Remove from current folder
                </Button>
                {folders.map(folder => (
                  <Button 
                    key={folder.id}
                    variant={targetFolderId === folder.id ? 'default' : 'outline'}
                    className="justify-start h-12"
                    onClick={() => setTargetFolderId(folder.id)}
                  >
                    <Folder className="h-4 w-4 mr-3" />
                    {folder.name}
                  </Button>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsMoveModalOpen(false)}>Cancel</Button>
                <Button onClick={handleMoveToFolder} disabled={isMoving || !targetFolderId}>
                  {isMoving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  {isMoving ? 'Moving...' : 'Confirm Move'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Filters Sidebar */}
          <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-6 z-10">
            <Card className="border shadow-sm bg-card/80 backdrop-blur-xl">
              <CardContent className="p-5 space-y-6">
                <div className="relative group">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    placeholder="Search library..."
                    className="pl-9 bg-background/50 border-border/50 focus-visible:ring-primary/30 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5" />
                    Content Type
                  </h3>
                  <div className="space-y-1.5">
                    {([
                      { id: 'all', label: 'All Content' },
                      { id: 'summary', label: 'Summaries' },
                      { id: 'quiz', label: 'Quizzes' },
                      { id: 'flashcards', label: 'Flashcards' },
                      { id: 'presentations', label: 'Presentations' },
                    ] as Array<{ id: TypeFilter; label: string }>).map(opt => (
                      <div key={opt.id} className={cn(
                        'flex items-center space-x-3 rounded-xl border border-transparent px-3 py-2.5 transition-all cursor-pointer',
                        typeFilter === opt.id ? 'bg-primary/5 text-primary border-primary/20 shadow-sm' : 'hover:bg-secondary/40 text-foreground',
                      )}
                      onClick={() => setTypeFilter(opt.id)}>
                        <Checkbox
                          id={opt.id}
                          checked={typeFilter === opt.id}
                          aria-label={`Filter ${opt.label}`}
                          className="pointer-events-none"
                        />
                        <label className="text-sm font-medium pointer-events-none flex-1">{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Content Grid */}
          <div className="lg:col-span-9">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value)} className="w-full">
              <div className="flex items-center justify-between mb-6">
                <TabsList className="bg-muted/70 border flex-wrap h-auto py-1 px-1">
                  <TabsTrigger value="all">All Items</TabsTrigger>
                  <TabsTrigger value="favorites">Favorites</TabsTrigger>
                  <div className="w-[1px] h-4 bg-border mx-2" />
                  {folders.map(folder => (
                    <TabsTrigger key={folder.id} value={`folder_${folder.id}`} className="flex items-center gap-2 group">
                      <Folder className="h-3.5 w-3.5 text-primary" />
                      {folder.name}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteFolder(folder.id)
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TabsTrigger>
                  ))}
                </TabsList>

                <Button variant="outline" size="sm" onClick={() => setIsCreateFolderOpen(true)}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Folder
                </Button>
              </div>

              {isCreateFolderOpen && (
                <div className="mb-6 p-4 rounded-xl border bg-card shadow-sm animate-in fade-in slide-in-from-top-2 flex gap-3 items-center">
                  <FolderInput className="h-5 w-5 text-muted-foreground" />
                  <Input 
                    placeholder="Enter folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="max-w-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder()
                      if (e.key === 'Escape') setIsCreateFolderOpen(false)
                    }}
                  />
                  <Button onClick={handleCreateFolder} size="sm">Create</Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsCreateFolderOpen(false)}>Cancel</Button>
                </div>
              )}

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
                  <div className="text-center py-20 border border-dashed rounded-2xl bg-secondary/10 flex flex-col items-center">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                      <div className="relative h-20 w-20 bg-background border rounded-2xl flex items-center justify-center shadow-sm">
                        <Layers className="h-10 w-10 text-muted-foreground/50" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold tracking-tight">
                      {activeTab === 'favorites' ? 'No favorites yet' : 'Your library is empty'}
                    </h3>
                    <p className="text-muted-foreground mt-2 max-w-sm">
                      {activeTab === 'favorites'
                        ? 'Star your favorite summaries and quizzes to easily access them here.'
                        : 'Generate your first smart summary, quiz, or flashcards from any document to get started.'}
                    </p>
                    {activeTab !== 'favorites' && (
                      <Button className="mt-8 rounded-full shadow-md hover:shadow-lg transition-all" size="lg" onClick={() => navigate('/create')}>
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Content
                      </Button>
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
                            'group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer border',
                            selectedItems.includes(item.id) ? 'ring-2 ring-primary border-primary shadow-md' : 'border-border/60 hover:border-border',
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
                          <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-70 group-hover:opacity-100 transition-opacity', typeMeta.railClass)} />
                          <div 
                            className={cn(
                              "absolute top-4 right-4 z-10 rounded-full bg-background/80 backdrop-blur-md p-1.5 shadow-sm border border-border/50 cursor-pointer hover:bg-background transition-all",
                              item.is_favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            )}
                            onClick={(e) => handleToggleFavorite(e, item)}
                            role="button"
                            aria-label={item.is_favorite ? "Remove from favorites" : "Add to favorites"}
                          >
                            <Star className={cn("h-3.5 w-3.5 transition-colors", item.is_favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground hover:text-yellow-500")} />
                          </div>
                          <div className="absolute bottom-4 left-5 z-10">
                            <Badge variant="outline" className={cn('text-[11px] font-medium bg-background/90 backdrop-blur-md shadow-sm', typeMeta.badgeClass)}>
                              {typeMeta.label}
                            </Badge>
                          </div>
                          <div className={cn(
                            "absolute bottom-4 right-4 z-10 rounded-md bg-background/90 backdrop-blur-md p-1 shadow-sm border border-border/50 transition-all duration-200",
                            selectedItems.includes(item.id) ? "opacity-100 scale-100" : "opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100"
                          )}>
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              aria-label={`Select ${item.title}`}
                              onClick={(e) => e.stopPropagation()}
                              onCheckedChange={() => toggleSelection(item.id)}
                            />
                          </div>
                          <CardContent
                            className="p-5 pt-6 pb-14"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-start mb-4">
                              <div className={cn('p-2.5 rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3', typeMeta.iconClass)}>
                                <TypeIcon className="h-5 w-5" />
                              </div>
                            </div>
                            <h3 className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors leading-tight">
                              {item.title}
                            </h3>
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-4 opacity-80">
                              <Calendar className="h-3 w-3" />
                              <span>{item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</span>
                            </div>
                            {item.type !== 'summary' && (item.tags || []).length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {(item.tags || []).slice(0, 3).map((tag: string) => (
                                  <Badge key={tag} variant="secondary" className="text-[10px] font-medium px-1.5 py-0 bg-secondary/60 hover:bg-secondary/80 transition-colors">
                                    {tag}
                                  </Badge>
                                ))}
                                {(item.tags || []).length > 3 && (
                                  <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0 bg-secondary/40 text-muted-foreground">
                                    +{(item.tags || []).length - 3}
                                  </Badge>
                                )}
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
                            onClick={(e) => e.stopPropagation()}
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
                          <div 
                            className="w-8 flex justify-end cursor-pointer"
                            onClick={(e) => handleToggleFavorite(e, item)}
                            role="button"
                            aria-label={item.is_favorite ? "Remove from favorites" : "Add to favorites"}
                          >
                            <Star className={cn(
                              "h-4 w-4 transition-colors", 
                              item.is_favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30 hover:text-yellow-500 opacity-0 group-hover:opacity-100"
                            )} />
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
