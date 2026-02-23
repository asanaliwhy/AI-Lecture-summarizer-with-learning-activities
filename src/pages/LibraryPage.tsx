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
        doc: any,
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

      const drawStyledQuizPdf = (
        doc: any,
        state: { y: number; pageHeight: number; margin: number; width: number },
        payload: {
          title: string
          generatedAt: string
          questions: Array<{ question: string; options: string[]; correctAnswer: string }>
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

        ensurePage(22)
        setFill(209, 250, 229)
        drawRect(state.margin, state.y, state.width, 16, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('QUIZ', state.margin + 8, state.y + 11)
        state.y += 30

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(24)
        const titleLines = doc.splitTextToSize(payload.title, state.width) as string[]
        for (const line of titleLines) {
          ensurePage(24)
          doc.text(line, state.margin, state.y)
          state.y += 24
        }
        state.y += 2

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        ensurePage(14)
        doc.text(`Questions: ${payload.questions.length} · Generated: ${payload.generatedAt}`, state.margin, state.y)
        state.y += 12

        ensurePage(2)
        setFill(16, 185, 129)
        drawRect(state.margin, state.y, state.width, 1.4, 'F')
        state.y += 14

        if (payload.questions.length === 0) {
          writeWrapped(doc, 'No questions available.', state, { size: 11 })
          return
        }

        payload.questions.forEach((question, index) => {
          const cardX = state.margin
          const cardW = state.width
          const bodyW = cardW - 20
          const qLabel = `Question ${index + 1}`
          const questionLines = doc.splitTextToSize(stripInlineMarkdown(question.question), bodyW) as string[]
          const optionGroups = question.options.map((option, optionIdx) => {
            const prefix = `${String.fromCharCode(65 + optionIdx)}. `
            const wrapped = doc.splitTextToSize(stripInlineMarkdown(option), bodyW - 12) as string[]
            if (wrapped.length === 0) return [`${prefix}—`]
            return [`${prefix}${wrapped[0]}`, ...wrapped.slice(1).map((line) => `   ${line}`)]
          })
          const correctLines = doc.splitTextToSize(`Correct answer: ${stripInlineMarkdown(question.correctAnswer || 'N/A')}`, bodyW) as string[]

          const cardH = Math.max(
            80,
            14 +
            14 +
            questionLines.length * 14 +
            optionGroups.reduce((sum, group) => sum + group.length * 13 + 2, 0) +
            correctLines.length * 13 +
            16,
          )

          ensurePage(cardH + 8)
          setFill(236, 253, 245)
          setDraw(167, 243, 208)
          drawRect(cardX, state.y, cardW, cardH, 'FD')

          let cursorY = state.y + 16
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(11)
          doc.text(qLabel, cardX + 10, cursorY)
          cursorY += 16

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(12)
          questionLines.forEach((line) => {
            doc.text(line, cardX + 10, cursorY)
            cursorY += 14
          })
          cursorY += 2

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10.5)
          optionGroups.forEach((group) => {
            group.forEach((line) => {
              doc.text(line, cardX + 10, cursorY)
              cursorY += 13
            })
            cursorY += 2
          })

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10.5)
          correctLines.forEach((line) => {
            doc.text(line, cardX + 10, cursorY)
            cursorY += 13
          })

          state.y += cardH + 8
        })
      }

      const drawStyledFlashcardsPdf = (
        doc: any,
        state: { y: number; pageHeight: number; margin: number; width: number },
        payload: {
          title: string
          generatedAt: string
          cards: Array<{ front: string; back: string }>
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

        ensurePage(22)
        setFill(254, 243, 199)
        drawRect(state.margin, state.y, state.width, 16, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('FLASHCARDS', state.margin + 8, state.y + 11)
        state.y += 30

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(24)
        const titleLines = doc.splitTextToSize(payload.title, state.width) as string[]
        for (const line of titleLines) {
          ensurePage(24)
          doc.text(line, state.margin, state.y)
          state.y += 24
        }
        state.y += 2

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        ensurePage(14)
        doc.text(`Cards: ${payload.cards.length} · Generated: ${payload.generatedAt}`, state.margin, state.y)
        state.y += 12

        ensurePage(2)
        setFill(245, 158, 11)
        drawRect(state.margin, state.y, state.width, 1.4, 'F')
        state.y += 14

        if (payload.cards.length === 0) {
          writeWrapped(doc, 'No flashcards available.', state, { size: 11 })
          return
        }

        payload.cards.forEach((card, index) => {
          const cardX = state.margin
          const cardW = state.width
          const bodyW = cardW - 24
          const frontLines = doc.splitTextToSize(stripInlineMarkdown(card.front || `Card ${index + 1}`), bodyW) as string[]
          const backLines = doc.splitTextToSize(stripInlineMarkdown(card.back || 'N/A'), bodyW) as string[]

          const blockH = Math.max(88, 18 + frontLines.length * 14 + 10 + 14 + backLines.length * 13 + 12)
          ensurePage(blockH + 8)

          setFill(255, 251, 235)
          setDraw(252, 211, 77)
          drawRect(cardX, state.y, cardW, blockH, 'FD')
          setFill(245, 158, 11)
          drawRect(cardX + cardW - 3, state.y, 3, blockH, 'F')

          let cursorY = state.y + 16
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(11)
          doc.text(`Card ${index + 1}`, cardX + 12, cursorY)
          cursorY += 16

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(12)
          doc.text('Front', cardX + 12, cursorY)
          cursorY += 14
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(11)
          frontLines.forEach((line) => {
            doc.text(line, cardX + 12, cursorY)
            cursorY += 14
          })

          cursorY += 2
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(12)
          doc.text('Back', cardX + 12, cursorY)
          cursorY += 14
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(11)
          backLines.forEach((line) => {
            doc.text(line, cardX + 12, cursorY)
            cursorY += 13
          })

          state.y += blockH + 8
        })
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

            if (String(data?.format || '').toLowerCase() === 'smart') {
              const sourceRaw = String((data as { source?: string; source_type?: string })?.source || (data as { source?: string; source_type?: string })?.source_type || '').toLowerCase()
              const sourceLabel = sourceRaw.includes('youtube') || sourceRaw.includes('youtu') ? 'YouTube' : 'Document'
              const tags = Array.isArray((data as { tags?: string[] })?.tags)
                ? ((data as { tags?: string[] }).tags || [])
                : (Array.isArray(item.tags) ? item.tags : [])

              drawSmartSummaryPdf(doc as any, state, {
                title,
                sourceLabel,
                generatedAt: formatPdfDate(createdAt),
                tags,
                markdown: summaryText,
              })
            } else {
              writeWrapped(doc, title, state, { size: 17, bold: true, gap: 3 })
              writeWrapped(doc, `Type: Summary`, state, { size: 10, gap: 2 })
              writeWrapped(doc, `Generated: ${createdAt ? new Date(createdAt).toLocaleString() : '-'}`, state, { size: 10, gap: 10 })
              writeWrapped(doc, summaryText, state, { size: 11, gap: 6 })
            }

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

            const exportQuestions = questions.map((q, index: number) => {
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

              return {
                question: qText,
                options,
                correctAnswer,
              }
            })

            drawStyledQuizPdf(doc as any, state, {
              title,
              generatedAt: formatPdfDate(createdAt),
              questions: exportQuestions,
            })

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

            const exportCards = cards.map((card: Record<string, unknown>, index: number) => ({
              front: String((card?.front as string) || (card?.question as string) || (card?.term as string) || `Card ${index + 1}`),
              back: String((card?.back as string) || (card?.answer as string) || (card?.definition as string) || ''),
            }))

            drawStyledFlashcardsPdf(doc as any, state, {
              title,
              generatedAt: formatPdfDate(createdAt),
              cards: exportCards,
            })

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
                            <div className="absolute top-4 right-4 z-10 rounded-full bg-background/85 p-1 shadow-sm">
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            </div>
                          )}
                          <div className="absolute bottom-4 left-6 z-10">
                            <Badge variant="outline" className={cn('text-[11px] font-medium bg-background/90 shadow-sm', typeMeta.badgeClass)}>
                              {typeMeta.label}
                            </Badge>
                          </div>
                          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10 rounded-md bg-background/85 p-1 shadow-sm">
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              aria-label={`Select ${item.title}`}
                              onClick={(e) => e.stopPropagation()}
                              onCheckedChange={() => toggleSelection(item.id)}
                            />
                          </div>
                          <CardContent
                            className="p-6 pt-7 pb-12"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-start mb-4">
                              <div className={cn('p-2 rounded-lg', typeMeta.iconClass)}>
                                <TypeIcon className="h-5 w-5" />
                              </div>
                            </div>
                            <h3 className="font-semibold text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors">
                              {item.title}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 rounded-md bg-secondary/40 px-2 py-1 w-fit">
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
