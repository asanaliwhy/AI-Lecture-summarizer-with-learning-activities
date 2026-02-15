import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { api, type SummaryDetailResponse, type SummarySectionResponse } from '../lib/api'
import { ApiError } from '../lib/api'
import { useStudySession } from '../lib/useStudySession'
import { cn } from '../lib/utils'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Card, CardContent } from '../components/ui/Card'
import { useToast } from '../components/ui/Toast'
import {
  BrainCircuit,
  Layers,
  RotateCcw,
  Download,
  Copy,
  Calendar,
  Clock,
  ExternalLink,
  Edit2,
  Youtube,
  FileText,
  Trash2,
  Loader2,
} from 'lucide-react'

type TocItem = {
  id: string
  label: string
}

function createAnchorSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function buildTocItemsFromLabels(labels: string[], prefix: string): TocItem[] {
  const used = new Set<string>()

  return labels.map((rawLabel, index) => {
    const label = cleanInlineMarkdown(rawLabel) || `Section ${index + 1}`
    const slug = createAnchorSlug(label) || String(index + 1)
    const baseId = `${prefix}-${slug}`
    let id = baseId
    let suffix = 2

    while (used.has(id)) {
      id = `${baseId}-${suffix}`
      suffix += 1
    }

    used.add(id)
    return { id, label }
  })
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeGeneralSummaryText(value: string): string {
  if (!value) return ''

  let text = value.replace(/\r\n/g, '\n').trim()

  // Remove common heading markers while keeping heading text
  text = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s+/gm, '')

  // Normalize decimal-outline list markers like 1.1. / 2.3.
  text = text.replace(/^(\d+(?:\.\d+)+\.)\s+/gm, '• ')

  // Normalize single-level ordered list markers 1. 2. 3.
  text = text.replace(/^\d+\.\s+/gm, '• ')

  // Normalize markdown unordered list markers
  text = text.replace(/^[-*+]\s+/gm, '• ')

  // Keep line structure, but clean markdown noise per line
  const cleanedLines = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''

      if (trimmed.startsWith('• ')) {
        return `• ${cleanInlineMarkdown(trimmed.slice(2))}`
      }

      return cleanInlineMarkdown(trimmed)
    })

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function splitIntoSections(value: string): Array<{ title: string; body: string }> {
  const text = normalizeGeneralSummaryText(value)
  if (!text) return []

  const lines = text.split('\n')
  const sections: Array<{ title: string; body: string }> = []
  let currentTitle = 'Overview'
  let currentBody: string[] = []

  const flush = () => {
    const body = currentBody.join('\n').trim()
    if (body) {
      sections.push({ title: currentTitle, body })
    }
    currentBody = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const normalizedHeading = line.toLowerCase().replace(/:\s*$/, '')
    const isKnownHeading = [
      'overview',
      'core structures',
      'interesting facts',
      'summary',
      'key insights',
      'key insights and core concepts',
      'brain structure and functions',
    ].includes(normalizedHeading)

    const headingMatch = line.match(/^(.{3,80}):$/)
    const looksLikeHeading =
      !line.startsWith('• ') &&
      line.length <= 80 &&
      !/[.!?]$/.test(line) &&
      /[A-Za-zÀ-ÿ]/.test(line)

    if (isKnownHeading && currentBody.length === 0) {
      currentTitle = line.replace(/:\s*$/, '')
      continue
    }

    if (headingMatch) {
      flush()
      currentTitle = headingMatch[1]
      continue
    }

    if (looksLikeHeading && currentBody.length > 0) {
      flush()
      currentTitle = line
      continue
    }

    currentBody.push(line)
  }

  flush()

  if (sections.length === 0) {
    return [{ title: 'Summary', body: text }]
  }

  return sections
}

type BulletHierarchyItem = {
  text: string
  children: string[]
}

function parseBulletHierarchy(body: string): BulletHierarchyItem[] {
  if (!body) return []

  const lines = body.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim())
  const items: BulletHierarchyItem[] = []
  let currentParent: BulletHierarchyItem | null = null

  const childLabelRegex =
    /^(definition|function|role|example|examples|detail|details|description|size\/location|location|primary function(?:\(s\))?|key figure\/detail|key figure|figure)\s*:/i

  const stripBulletMarker = (line: string): string => line.replace(/^\s*[-*+•]\s+/, '').trim()

  for (const rawLine of lines) {
    const isExplicitIndentedChild = /^\s{2,}[-*+•]\s+/.test(rawLine)
    const text = stripBulletMarker(rawLine)
    if (!text) continue

    const isLabeledChild = childLabelRegex.test(text)

    if ((isExplicitIndentedChild || isLabeledChild) && currentParent) {
      currentParent.children.push(text)
      continue
    }

    currentParent = { text, children: [] }
    items.push(currentParent)
  }

  return items
}

function normalizeCornellText(value: string): string {
  if (!value) return ''

  const normalized = value.replace(/\r\n/g, '\n').trim()
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const hasTableRows = lines.some((line) => line.startsWith('|') && line.endsWith('|'))
  if (!hasTableRows) {
    return normalizeGeneralSummaryText(normalized)
  }

  const out: string[] = []

  for (const line of lines) {
    // Skip markdown table separator rows like: | :--- | :--- |
    if (/^\|\s*:?-{3,}.*\|$/.test(line)) continue

    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cleanInlineMarkdown(cell))
        .filter(Boolean)

      if (cells.length === 0) continue

      if (cells.length === 1) {
        out.push(`• ${cells[0]}`)
      } else {
        out.push(`• ${cells[0]}`)
        out.push(`  ${cells.slice(1).join(' — ')}`)
      }
      continue
    }

    out.push(cleanInlineMarkdown(line))
  }

  return normalizeGeneralSummaryText(out.join('\n').replace(/\n{3,}/g, '\n\n').trim())
}

function normalizeSmartSummaryMarkdown(value: string): string {
  if (!value) return ''

  const lines = value
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .split('\n')
  const out: string[] = []

  const addImplicitSpaces = (line: string): string =>
    line
      .replace(/([a-z\)])([A-Z])/g, '$1 $2')
      .replace(/([0-9%])([A-Z])/g, '$1 $2')

  const splitColumns = (line: string): string[] =>
    addImplicitSpaces(line)
      .trim()
      .split(/\s{2,}/)
      .map((cell) => cleanInlineMarkdown(cell))
      .filter(Boolean)

  const parseHeaderColumns = (line: string): string[] => {
    const bySpacing = splitColumns(line)
    if (bySpacing.length >= 2) return bySpacing

    const keywordMatches = line.match(
      /(Brain Part|Part|Topic|Section|Size\/Location|Primary Function\(s\)|Primary Function|Function|Description|Role|Key Figure\/Detail|Key Figure|Detail|Details)/gi,
    )

    if (keywordMatches && keywordMatches.length >= 2) {
      return keywordMatches.map((k) => cleanInlineMarkdown(k))
    }

    return []
  }

  const parseSmartTableRow = (line: string, colCount: number): string[] | null => {
    const normalized = addImplicitSpaces(line).trim()
    if (!normalized) return null

    const bySpacing = splitColumns(normalized)
    if (bySpacing.length >= 2) {
      return bySpacing
    }

    // Fallback for single-space collapsed rows: "Brain Stem ... Connected to spinal cord"
    const firstColMatch = normalized.match(/^([A-Z][A-Za-z-]*(?:\s+[A-Z][A-Za-z-]*)?)\s+(.+)$/)
    if (!firstColMatch) return null

    const first = cleanInlineMarkdown(firstColMatch[1])
    const remainder = cleanInlineMarkdown(firstColMatch[2])

    if (colCount >= 3) {
      const tailMatch = remainder.match(/^(.*)\s+(\d+%.*|[A-Z][A-Za-z-]*(?:\s+[A-Za-z-]+){0,5})$/)
      if (tailMatch) {
        const middle = cleanInlineMarkdown(tailMatch[1])
        const tail = cleanInlineMarkdown(tailMatch[2])
        if (middle && tail) return [first, middle, tail]
      }
      return [first, remainder, '—']
    }

    return [first, remainder]
  }

  const normalizeRow = (row: string[], size: number): string[] => {
    if (row.length === size) return row
    if (row.length > size) {
      return [...row.slice(0, size - 1), row.slice(size - 1).join(' ')]
    }
    return [...row, ...Array(size - row.length).fill('—')]
  }

  let i = 0
  let currentSmartSection = ''
  while (i < lines.length) {
    const raw = lines[i].trim()
    if (!raw) {
      out.push('')
      i += 1
      continue
    }

    // Drop wrapper titles like "Smart Summary" / "Smart Summary: ..."
    // so they do not render as visible content in Smart mode.
    if (/^smart\s*summary\s*(?::\s*.*)?$/i.test(raw)) {
      i += 1
      continue
    }

    const numberedHeading = raw.match(/^\d+[.)]\s+(.+)$/)
    if (numberedHeading) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
      const headingText = cleanInlineMarkdown(numberedHeading[1]).replace(/:\s*$/, '')
      out.push(`## ${headingText}`)
      out.push('')
      currentSmartSection = headingText.toLowerCase()
      i += 1
      continue
    }

    const knownSectionHeading = raw.match(/^(Summary of Video Content|Key Insights and Core Concepts|Brain Structure and Functions|Additional Interesting Facts|Conclusions|Summary Highlights):?$/i)
    if (knownSectionHeading) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
      const headingText = cleanInlineMarkdown(knownSectionHeading[1]).replace(/:\s*$/, '')
      out.push(`## ${headingText}`)
      out.push('')
      currentSmartSection = headingText.toLowerCase()
      i += 1
      continue
    }

    if (raw.startsWith('• ')) {
      out.push(`- ${cleanInlineMarkdown(raw.slice(2))}`)
      i += 1
      continue
    }

    if (/^[-*+]\s+/.test(raw)) {
      out.push(`- ${cleanInlineMarkdown(raw.replace(/^[-*+]\s+/, ''))}`)
      i += 1
      continue
    }

    if (currentSmartSection.includes('additional interesting facts')) {
      out.push(`- ${cleanInlineMarkdown(raw)}`)
      i += 1
      continue
    }

    const headerCols = parseHeaderColumns(raw)
    const nextRaw = (lines[i + 1] || '').trim()
    const nextCols = nextRaw ? parseSmartTableRow(nextRaw, Math.max(headerCols.length, 2)) || [] : []
    const headerLikeByKeywords =
      /(part|component|topic|section)/i.test(raw) &&
      /(function|description|role|detail|size|location|figure)/i.test(raw)
    const isTableBlock =
      (headerCols.length >= 2 || headerLikeByKeywords) &&
      nextCols.length >= 2 &&
      !/^\d+[.)]\s+/.test(nextRaw)

    if (isTableBlock) {
      const header = headerCols.length >= 2 ? headerCols : ['Item', 'Description', 'Details']
      const rows: string[][] = [header, nextCols]
      let j = i + 2

      while (j < lines.length) {
        const rowRaw = lines[j].trim()
        if (!rowRaw || /^\d+[.)]\s+/.test(rowRaw)) break
        const cols = parseSmartTableRow(rowRaw, Math.max(header.length, 2)) || []
        if (cols.length < 2) break
        rows.push(cols)
        j += 1
      }

      const colCount = Math.max(...rows.map((row) => row.length))
      const normalizedRows = rows.map((row) => normalizeRow(row, colCount))

      out.push(`| ${normalizedRows[0].join(' | ')} |`)
      out.push(`| ${Array(colCount).fill('---').join(' | ')} |`)
      normalizedRows.slice(1).forEach((row) => {
        out.push(`| ${row.join(' | ')} |`)
      })
      out.push('')

      i = j
      continue
    }

    const keyValue = raw.match(/^([A-Za-z][A-Za-z\s&/-]{1,40}):\s+(.+)$/)
    if (keyValue) {
      const label = cleanInlineMarkdown(keyValue[1])
      const value = cleanInlineMarkdown(keyValue[2])
      const normalizedLabel = label.toLowerCase()

      if (/^(key concept|definition|example|insight|fact|figure)$/.test(normalizedLabel)) {
        out.push(`> **${label}:** ${value}`)
      } else {
        out.push(`- **${label}:** ${value}`)
      }
      i += 1
      continue
    }

    out.push(cleanInlineMarkdown(raw))
    i += 1
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function enhanceSmartSummaryHtml(html: string): string {
  if (!html || typeof DOMParser === 'undefined') return html

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) return html

  const nodes = Array.from(root.childNodes)
  const body = doc.createElement('div')
  body.className = 'smart-summary-body'

  const createSection = () => {
    const section = doc.createElement('section')
    section.className = 'smart-summary-section'
    return section
  }

  let currentSection: HTMLElement | null = null
  const keyLabelRegex = /^(Key Concept|Definition|Example|Figure)\s*:\s*/i

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
      continue
    }

    const element = node as HTMLElement
    const tag = element.tagName?.toLowerCase()

    if (tag === 'h1' || tag === 'h2') {
      currentSection = createSection()
      currentSection.appendChild(node)
      body.appendChild(currentSection)
      continue
    }

    if (!currentSection) {
      currentSection = createSection()
      body.appendChild(currentSection)
    }

    if (tag === 'p') {
      const text = element.textContent?.trim() || ''
      const match = text.match(keyLabelRegex)
      if (match) {
        const label = match[1]
        let rest = text.slice(match[0].length).trim()

        // Fix collapsed text like "Boss of Your BodyThe brain..."
        if (/^key concept$/i.test(label)) {
          rest = rest.replace(/([a-z\)])([A-Z][a-z])/g, '$1\n$2')
        }

        const parts = rest.split(/\n+/, 2).map((v) => v.trim()).filter(Boolean)
        const title = parts[0] || ''
        const detail = parts[1] || (parts.length === 1 ? '' : parts.slice(1).join(' '))

        const p = doc.createElement('p')
        p.className = 'smart-key-row'

        const badge = doc.createElement('span')
        badge.className = 'smart-key-label'
        badge.textContent = `${label}:`
        p.appendChild(badge)

        if (title) {
          const titleSpan = doc.createElement('span')
          titleSpan.className = 'smart-key-title'
          titleSpan.textContent = title
          p.appendChild(titleSpan)
        }

        if (detail) {
          const detailSpan = doc.createElement('span')
          detailSpan.className = 'smart-key-detail'
          detailSpan.textContent = detail
          p.appendChild(detailSpan)
        }

        currentSection.appendChild(p)
        continue
      }
    }

    currentSection.appendChild(node)
  }

  root.innerHTML = ''
  root.appendChild(body)

  const smartHeadings = Array.from(body.querySelectorAll('h1, h2')).map((heading) => heading.textContent?.trim() || '')
  const smartHeadingAnchors = buildTocItemsFromLabels(smartHeadings, 'smart')
  Array.from(body.querySelectorAll('h1, h2')).forEach((heading, index) => {
    const anchorId = smartHeadingAnchors[index]?.id
    if (anchorId) {
      heading.id = anchorId
      heading.classList.add('scroll-mt-28')
    }
  })

  // Ensure Additional Interesting Facts renders as bullet points for faster scanning.
  const sectionNodes = body.querySelectorAll('.smart-summary-section')
  sectionNodes.forEach((section) => {
    const heading = section.querySelector('h1, h2, h3, h4, h5, h6')
    const paragraphs = Array.from(section.querySelectorAll('p'))
    const firstParagraphText = paragraphs[0]?.textContent?.trim() || ''
    const titleCandidate = (heading?.textContent?.trim() || firstParagraphText).toLowerCase()
    const normalizedTitle = titleCandidate.replace(/[:\-\s]+$/g, '')
    if (!normalizedTitle.includes('additional interesting facts')) return

    const existingList = section.querySelector('ul, ol')
    if (existingList) {
      // Tailwind preflight removes default list markers globally.
      // Ensure markdown-generated lists in this section keep explicit list styling.
      existingList.classList.add('smart-facts-list')
      return
    }

    if (paragraphs.length === 0) return

    const contentParagraphs = paragraphs.filter((p, index) => {
      if (heading) return true
      if (index !== 0) return true
      const text = p.textContent?.trim().toLowerCase() || ''
      return !/^additional\s+interesting\s+facts\b/.test(text)
    })
    if (contentParagraphs.length === 0) return

    const ul = doc.createElement('ul')
    ul.className = 'smart-facts-list'

    contentParagraphs.forEach((p) => {
      const htmlParts = p.innerHTML.split(/<br\s*\/?>/i)
      if (htmlParts.length > 1) {
        htmlParts.forEach((part) => {
          const temp = doc.createElement('div')
          temp.innerHTML = part
          const txt = temp.textContent?.trim() || ''
          if (!txt) return
          const li = doc.createElement('li')
          li.textContent = txt
          ul.appendChild(li)
        })
      } else {
        const txt = p.textContent?.trim() || ''
        if (!txt) return
        const li = doc.createElement('li')
        li.textContent = txt
        ul.appendChild(li)
      }
      p.remove()
    })

    if (!heading && paragraphs.length > 0) {
      const firstText = paragraphs[0].textContent?.trim().toLowerCase() || ''
      if (/^additional\s+interesting\s+facts\b/.test(firstText)) {
        paragraphs[0].remove()
      }
    }

    if (ul.children.length > 0) {
      section.appendChild(ul)
    }
  })

  return root.innerHTML
}

function renderSmartSummaryHtml(value: string): string {
  if (!value) return ''

  const normalized = normalizeSmartSummaryMarkdown(value)
  const html = marked.parse(normalized || value, { async: false, gfm: true, breaks: true }) as string
  const enhanced = enhanceSmartSummaryHtml(html)
  return DOMPurify.sanitize(enhanced)
}

type PdfContentBlock =
  | { type: 'text'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }

function isMarkdownTableSeparator(line: string): boolean {
  return /^\|\s*:?-{3,}.*\|$/.test(line.trim())
}

function parseMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cleanInlineMarkdown(cell))
}

function parsePdfBlocks(markdown: string): PdfContentBlock[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const lines = normalized.split('\n')
  const blocks: PdfContentBlock[] = []
  const textLines: string[] = []

  const flushText = () => {
    const text = textLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    if (text) blocks.push({ type: 'text', text })
    textLines.length = 0
  }

  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()

    if (!line) {
      textLines.push('')
      i += 1
      continue
    }

    const next = (lines[i + 1] || '').trim()
    const isTableHeader = line.startsWith('|') && line.endsWith('|') && isMarkdownTableSeparator(next)
    if (isTableHeader) {
      flushText()

      const headers = parseMarkdownTableRow(line)
      const rows: string[][] = []
      i += 2 // skip separator line

      while (i < lines.length) {
        const rowLine = lines[i].trim()
        if (!(rowLine.startsWith('|') && rowLine.endsWith('|'))) break
        const row = parseMarkdownTableRow(rowLine)
        if (row.length > 0) rows.push(row)
        i += 1
      }

      if (headers.length > 0 && rows.length > 0) {
        blocks.push({ type: 'table', headers, rows })
      }
      continue
    }

    let cleaned = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*+]\s+/, '• ')
      .replace(/^•\s+/, '• ')
    cleaned = cleanInlineMarkdown(cleaned)
    if (cleaned) textLines.push(cleaned)

    i += 1
  }

  flushText()

  return blocks
}

export function SummaryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState<SummaryDetailResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isNotFound, setIsNotFound] = useState(false)
  const [readingDensity, setReadingDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [activeTocId, setActiveTocId] = useState('')

  const loadSummary = async () => {
    if (!id) return
    setIsLoading(true)
    setLoadError(null)
    setIsNotFound(false)
    try {
      const data = await api.summaries.get(id)
      setSummary(data)
      setTitle(data.title || 'Untitled Summary')
    } catch (err: unknown) {
      setSummary(null)
      if (err instanceof ApiError && err.status === 404) {
        setIsNotFound(true)
      } else {
        const message = err instanceof Error ? err.message : 'Failed to load summary'
        setLoadError(message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSummary()
  }, [id])

  useStudySession({
    activityType: 'summary',
    resourceId: id,
    enabled: !!id && !isLoading && !!summary,
    clientMeta: { page: 'summary' },
  })

  const handleTitleSave = async () => {
    setIsEditingTitle(false)
    if (id && title !== summary?.title) {
      try {
        await api.summaries.update(id, { title })
      } catch {
        toast.error('Failed to update title')
      }
    }
  }

  const handleRegenerate = async () => {
    if (!id) return
    setIsRegenerating(true)
    try {
      const config = (summary?.config || {}) as {
        content_id?: string
        format?: string
        length?: string
        focus_areas?: string[]
        target_audience?: string
        language?: string
      }
      const payload = {
        content_id: summary?.content_id || config.content_id,
        format: summary?.format || config.format,
        length: summary?.length_setting || config.length,
        focus_areas: config.focus_areas || [],
        target_audience: config.target_audience || '',
        language: config.language || 'en',
      }

      const { job_id } = await api.summaries.regenerate(id, payload)
      if (job_id) {
        navigate(`/processing/${job_id}`)
      }
    } catch {
      toast.error('Failed to regenerate summary')
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleDelete = () => {
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!id) return

    setIsDeleting(true)
    try {
      await api.summaries.delete(id)
      setDeleteModalOpen(false)
      toast.success('Summary deleted')
      navigate('/summaries')
    } catch {
      toast.error('Failed to delete summary')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCopy = async () => {
    const contentRaw = summary?.content_raw || summary?.content || summary?.body || ''
    const cornellCues = summary?.cornell_cues || ''
    const cornellNotes = summary?.cornell_notes || ''
    const cornellSummary = summary?.cornell_summary || ''

    const text =
      summary?.format === 'cornell'
        ? `[CUES]\n${cornellCues}\n\n[NOTES]\n${cornellNotes}\n\n[SUMMARY]\n${cornellSummary}`.trim()
        : contentRaw

    try {
      await navigator.clipboard.writeText(text)
      toast.success('Summary copied to clipboard')
    } catch {
      toast.error('Failed to copy text')
    }
  }

  const sanitizeFileName = (value: string) => {
    return value
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'summary'
  }

  const handleExportPdf = async () => {
    if (!summary) return

    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })

      const fileTitle = sanitizeFileName(title || summary?.title || 'summary')
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 48
      const contentWidth = pageWidth - margin * 2

      const rawSmart = summary?.content_raw || summary?.content || summary?.body || ''
      const rawMain = normalizeGeneralSummaryText(rawSmart)
      const cues = normalizeCornellText(summary?.cornell_cues || '')
      const notes = normalizeCornellText(summary?.cornell_notes || '')
      const cornellSummaryText = normalizeCornellText(summary?.cornell_summary || '')

      const text = summary?.format === 'cornell'
        ? `CUES\n${cues || 'No cues available.'}\n\nNOTES\n${notes || 'No notes available.'}\n\nSUMMARY\n${cornellSummaryText || 'No summary available.'}`
        : rawMain || 'No content available.'

      let y = margin

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.text(fileTitle, margin, y)
      y += 22

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      const dateLabel = summary?.created_at ? new Date(summary.created_at).toLocaleDateString() : 'Unknown date'
      doc.text(`Generated: ${dateLabel}`, margin, y)
      y += 24

      const ensurePageSpace = (heightNeeded: number) => {
        if (y + heightNeeded > pageHeight - margin) {
          doc.addPage()
          y = margin
        }
      }

      const renderTextParagraphs = (blockText: string) => {
        const rows = blockText.split('\n')
        for (const row of rows) {
          const line = row.trim()
          if (!line) {
            y += 8
            continue
          }

          const looksLikeHeading = !line.startsWith('• ') && line.length <= 90 && !/[.!?]$/.test(line)
          doc.setFont('helvetica', looksLikeHeading ? 'bold' : 'normal')
          doc.setFontSize(looksLikeHeading ? 12.5 : 12)

          const wrapped = doc.splitTextToSize(line, contentWidth) as string[]
          for (const wrappedLine of wrapped) {
            ensurePageSpace(18)
            doc.text(wrappedLine, margin, y)
            y += looksLikeHeading ? 18 : 17
          }

          if (looksLikeHeading) y += 2
        }
        y += 8
      }

      const renderMarkdownTable = (headers: string[], rows: string[][]) => {
        const colCount = Math.max(headers.length, ...rows.map((r) => r.length), 2)
        const colWidth = contentWidth / colCount

        const normalizeRow = (row: string[]): string[] => {
          const normalized = [...row]
          while (normalized.length < colCount) normalized.push('')
          return normalized.slice(0, colCount)
        }

        const tableHeaders = normalizeRow(headers)
        const tableRows = rows.map(normalizeRow)

        const getRowLayout = (cells: string[]) => {
          const cellLines = cells.map((cell) =>
            doc.splitTextToSize(cell || '—', Math.max(colWidth - 10, 24)) as string[],
          )
          const maxLines = Math.max(1, ...cellLines.map((lineGroup) => lineGroup.length))
          const rowHeight = Math.max(22, maxLines * 13 + 8)
          return { cellLines, rowHeight }
        }

        const drawRow = (cells: string[], isHeader: boolean) => {
          const { cellLines, rowHeight } = getRowLayout(cells)

          for (let c = 0; c < colCount; c += 1) {
            const x = margin + c * colWidth
            doc.setDrawColor(203, 213, 225)
            if (isHeader) {
              doc.setFillColor(241, 245, 249)
              doc.rect(x, y, colWidth, rowHeight, 'FD')
            } else {
              doc.rect(x, y, colWidth, rowHeight)
            }

            doc.setFont('helvetica', isHeader ? 'bold' : 'normal')
            doc.setFontSize(isHeader ? 10.5 : 10)
            doc.text(cellLines[c], x + 5, y + 14, { maxWidth: Math.max(colWidth - 10, 24) })
          }

          y += rowHeight
        }

        const drawHeader = () => {
          const { rowHeight } = getRowLayout(tableHeaders)
          ensurePageSpace(rowHeight)
          drawRow(tableHeaders, true)
        }

        y += 2
        drawHeader()

        for (const row of tableRows) {
          const { rowHeight } = getRowLayout(row)
          if (y + rowHeight > pageHeight - margin) {
            doc.addPage()
            y = margin
            drawHeader()
          }
          drawRow(row, false)
        }

        y += 12
      }

      const exportSource =
        summary?.format === 'cornell'
          ? `# CUES\n${cues || 'No cues available.'}\n\n# NOTES\n${notes || 'No notes available.'}\n\n# SUMMARY\n${cornellSummaryText || 'No summary available.'}`
          : (summary?.content_raw || summary?.content || summary?.body || text)

      const normalizedExportSource =
        summary?.format === 'smart'
          ? rawSmart
          : normalizeGeneralSummaryText(exportSource || text || 'No content available.')

      const blocks = parsePdfBlocks(normalizedExportSource)
      const safeBlocks =
        blocks.length > 0
          ? blocks
          : [{ type: 'text', text: normalizeGeneralSummaryText(normalizedExportSource) || 'No content available.' } as PdfContentBlock]

      safeBlocks.forEach((block) => {
        if (block.type === 'table') {
          renderMarkdownTable(block.headers, block.rows)
        } else {
          renderTextParagraphs(block.text)
        }
      })

      doc.save(`${fileTitle}.pdf`)
      toast.success('PDF exported')
    } catch {
      toast.error('Failed to export PDF')
    }
  }

  const createdAt = summary?.created_at ? new Date(summary.created_at).toLocaleDateString() : 'Recently'
  const duration = summary?.source_duration || summary?.duration || ''
  const sourceUrl = summary?.source_url || ''
  const sourceRaw = String(summary?.source || summary?.source_type || '').toLowerCase()
  const isYouTubeSource = sourceRaw.includes('youtube') || sourceRaw.includes('youtu')
  const sourceLabel = isYouTubeSource ? 'YouTube' : 'Document'
  const tags: string[] = summary?.tags || []
  const contentRaw: string = summary?.content_raw || summary?.content || summary?.body || ''
  const cornellCues: string = summary?.cornell_cues || ''
  const cornellNotes: string = summary?.cornell_notes || ''
  const cornellSummary: string = summary?.cornell_summary || ''
  const renderedCornellCues = normalizeCornellText(cornellCues)
  const renderedCornellNotes = normalizeCornellText(cornellNotes)
  const renderedCornellSummary = normalizeCornellText(cornellSummary)
  const renderedContentRaw = normalizeGeneralSummaryText(contentRaw)
  const renderedSections = splitIntoSections(renderedContentRaw)
  const smartSummaryHtml = summary?.format === 'smart' ? renderSmartSummaryHtml(contentRaw) : ''
  const hasCornellSections = summary?.format === 'cornell' && (cornellCues || cornellNotes || cornellSummary)
  const isCornellSummary = summary?.format === 'cornell'
  const isParagraphSummary = summary?.format === 'paragraph'
  const isBulletSummary = summary?.format === 'bullets'
  const isSmartSummary = summary?.format === 'smart'
  const isStyledSectionSummary = isBulletSummary || isParagraphSummary
  const isWideSummaryLayout = isSmartSummary || isBulletSummary || isCornellSummary || isParagraphSummary
  const summaryFormatRaw = String(summary?.format || summary?.config?.format || '').toLowerCase()
  const summaryTypeLabel =
    summaryFormatRaw === 'cornell'
      ? 'Cornell'
      : summaryFormatRaw === 'bullets'
        ? 'Bullet Points'
        : summaryFormatRaw === 'paragraph'
          ? 'Paragraph'
          : summaryFormatRaw === 'smart'
            ? 'Smart Summary'
            : 'Summary'

  // Parse content sections
  const sections: SummarySectionResponse[] = summary?.sections || []
  const hasSections = sections.length > 0

  const smartHeadingLabels = useMemo(() => {
    if (!isSmartSummary) return []

    return normalizeSmartSummaryMarkdown(contentRaw)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^##\s+/.test(line))
      .map((line) => cleanInlineMarkdown(line.replace(/^##\s+/, '')))
      .filter(Boolean)
  }, [isSmartSummary, contentRaw])

  const sectionTocItems = useMemo(
    () => buildTocItemsFromLabels(sections.map((section, index) => section.title || `Section ${index + 1}`), 'section'),
    [sections],
  )

  const renderedSectionTocItems = useMemo(
    () => buildTocItemsFromLabels(renderedSections.map((section, index) => section.title || `Section ${index + 1}`), 'summary'),
    [renderedSections],
  )

  const smartTocItems = useMemo(() => {
    if (!isSmartSummary) return []
    if (smartHeadingLabels.length === 0) {
      return [{ id: 'smart-summary-top', label: 'Summary' }]
    }

    return buildTocItemsFromLabels(smartHeadingLabels, 'smart')
  }, [isSmartSummary, smartHeadingLabels])

  const tocItems: TocItem[] = useMemo(() => {
    if (isSmartSummary) return smartTocItems
    if (hasSections) return sectionTocItems
    if (hasCornellSections) {
      return [
        { id: 'cornell-cues', label: 'Cues' },
        { id: 'cornell-notes', label: 'Notes' },
        { id: 'cornell-summary', label: 'Summary' },
      ]
    }

    return renderedSectionTocItems.length > 0
      ? renderedSectionTocItems
      : [{ id: 'summary-main', label: 'Summary' }]
  }, [
    hasCornellSections,
    hasSections,
    isSmartSummary,
    renderedSectionTocItems,
    sectionTocItems,
    smartTocItems,
  ])

  useEffect(() => {
    setActiveTocId((prev) => {
      if (prev && tocItems.some((item) => item.id === prev)) return prev
      return tocItems[0]?.id || ''
    })
  }, [tocItems])

  useEffect(() => {
    if (tocItems.length === 0) return
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return

    const observed = tocItems
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => Boolean(node))

    if (observed.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible[0]?.target instanceof HTMLElement) {
          setActiveTocId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-30% 0px -55% 0px',
        threshold: [0.1, 0.35, 0.7],
      },
    )

    observed.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [tocItems])

  const handleTocJump = (anchorId: string) => {
    const node = document.getElementById(anchorId)
    if (!node) return
    setActiveTocId(anchorId)
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const visibleTags = tags.slice(0, 3)
  const hiddenTagCount = Math.max(0, tags.length - visibleTags.length)
  const comfortableReading = readingDensity === 'comfortable'
  const leftColumnClass = isWideSummaryLayout
    ? 'lg:col-span-2 space-y-6 lg:-ml-8 xl:-ml-12'
    : 'lg:col-span-3 space-y-6 lg:-ml-8 xl:-ml-12'
  const centerColumnClass = isWideSummaryLayout ? 'lg:col-span-8' : 'lg:col-span-7'
  const rightColumnClass = 'lg:col-span-2 space-y-6'

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    )
  }

  if (loadError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 text-center">
          <h2 className="text-2xl font-bold mb-2">Failed to load summary</h2>
          <p className="text-muted-foreground mb-6">{loadError}</p>
          <div className="flex items-center gap-3">
            <Button onClick={loadSummary}>Retry</Button>
            <Button variant="outline" onClick={() => navigate('/summaries')}>Back to Summaries</Button>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (isNotFound || !summary) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 text-center">
          <h2 className="text-2xl font-bold mb-2">Summary Not Found</h2>
          <p className="text-muted-foreground mb-6">This summary may have been deleted or doesn't exist.</p>
          <Button onClick={() => navigate('/summaries')}>Back to Summaries</Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-[1680px] mx-auto pb-8">
        {/* Top Header / Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 md:mb-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant="secondary"
                className="bg-blue-100/90 text-blue-700 hover:bg-blue-100 border-blue-200/80"
              >
                {summaryTypeLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Generated {createdAt}
              </span>
            </div>
            {isEditingTitle ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                autoFocus
                className="text-3xl font-bold tracking-tight bg-transparent border-b border-primary focus:outline-none w-full"
              />
            ) : (
              <h1
                className="text-3xl md:text-[2.2rem] font-bold tracking-tight cursor-pointer hover:text-primary/80 flex items-start gap-2 group break-words"
                onClick={() => setIsEditingTitle(true)}
              >
                {title}
                <Edit2 className="h-4 w-4 mt-2 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </h1>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8">
          {/* Left Sidebar - Metadata (20%) */}
          <div className={leftColumnClass}>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-5 space-y-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Source
                  </h3>
                  {sourceUrl ? (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-base font-semibold text-primary hover:underline truncate"
                    >
                      {isYouTubeSource ? <Youtube className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      {sourceLabel}
                    </a>
                  ) : (
                    <span className="text-base font-semibold text-foreground inline-flex items-center gap-2">
                      {isYouTubeSource ? <Youtube className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      {sourceLabel}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Details
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-[11px] font-medium bg-background/70 px-2.5 py-1">
                        <Calendar className="h-3 w-3 mr-1.5" />
                        {createdAt}
                      </Badge>
                      {duration && (
                        <Badge variant="outline" className="text-[11px] font-medium bg-background/70 px-2.5 py-1">
                          <Clock className="h-3 w-3 mr-1.5" />
                          {duration}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {tags.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleTags.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-[11px] px-2.5 py-1 bg-background/70">{tag}</Badge>
                      ))}
                      {hiddenTagCount > 0 && (
                        <Badge variant="secondary" className="text-[11px] px-2.5 py-1">
                          +{hiddenTagCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="bg-gradient-to-b from-blue-50 to-indigo-50/40 border border-blue-100/90 rounded-xl p-5 shadow-sm">
              <h3 className="font-bold text-blue-900 mb-3 text-lg">Study Tools</h3>
              <p className="text-sm text-blue-700 mb-5 leading-relaxed">
                Ready to test your knowledge? Create a quiz or flashcards from this summary.
              </p>
              <div className="space-y-2">
                <Button
                  className="w-full justify-center bg-blue-600 hover:bg-blue-700 text-white h-11 text-base"
                  onClick={() => navigate(`/quiz/create/${id}`)}
                >
                  <BrainCircuit className="h-4 w-4 mr-2" />
                  Generate Quiz
                </Button>
                <Button
                  className="w-full justify-center bg-white text-blue-700 border-blue-200 hover:bg-blue-50 hover:text-blue-800 h-11 text-base"
                  variant="outline"
                  onClick={() => navigate(`/flashcards/create/${id}`)}
                >
                  <Layers className="h-4 w-4 mr-2 shrink-0 text-blue-700" />
                  Create Flashcards
                </Button>
              </div>
            </div>
          </div>

          {/* Center - Content (60%) */}
          <div className={centerColumnClass}>
            <Card className="min-h-[620px] shadow-sm border-border/70">
              <CardContent className={isSmartSummary || hasCornellSections || isStyledSectionSummary ? 'p-4 md:p-5 lg:p-6' : 'p-6 md:p-10 lg:p-12'}>
                {isSmartSummary ? (
                  <article
                    id="smart-summary-top"
                    className={cn(
                      'smart-summary-content smart-summary-modern smart-summary-scroll overflow-x-auto prose mx-auto prose-slate prose-headings:font-extrabold prose-headings:tracking-tight prose-headings:text-slate-900 prose-h2:text-[1.62rem] prose-h2:leading-tight prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-[1.2rem] prose-h3:font-bold prose-h3:mt-5 prose-h3:mb-3 prose-strong:text-slate-900 prose-ul:my-3 prose-ol:my-3 prose-hr:my-6 prose-a:text-blue-700 hover:prose-a:text-blue-800 scroll-mt-28',
                      comfortableReading
                        ? 'max-w-[92ch] prose-p:my-3 prose-p:leading-[1.82] prose-li:leading-[1.8]'
                        : 'max-w-[104ch] prose-p:my-2 prose-p:leading-[1.68] prose-li:leading-[1.64]',
                    )}
                  >
                    <div dangerouslySetInnerHTML={{ __html: smartSummaryHtml || '<p>No content available yet.</p>' }} />
                  </article>
                ) : hasSections ? (
                  <div className={cn('space-y-10 mx-auto', comfortableReading ? 'max-w-[90ch]' : 'max-w-[100ch]')}>
                    {sections.map((section, idx: number) => (
                      <section
                        key={idx}
                        id={sectionTocItems[idx]?.id}
                        className="border-b border-border/60 pb-8 last:border-b-0 scroll-mt-28"
                      >
                        <h2 className="text-2xl md:text-[1.7rem] font-bold text-slate-900 mb-4">
                          {idx + 1}. {section.title}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                          {section.key_concepts && (
                            <div className="md:col-span-1">
                              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide sticky top-4">
                                Key Concepts
                              </div>
                              <ul className="mt-4 space-y-4 text-sm font-medium text-slate-700">
                                {(section.key_concepts as string[]).map((concept: string, i: number) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                                    {concept}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div className={section.key_concepts ? 'md:col-span-2' : 'md:col-span-3'}>
                            <div
                              className={cn(
                                'text-slate-800 space-y-4 prose prose-slate',
                                comfortableReading ? 'leading-8 max-w-[74ch]' : 'leading-7 max-w-[80ch]',
                              )}
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(section.content || section.body || '') }}
                            />
                          </div>
                        </div>
                      </section>
                    ))}

                    {summary.summary_text && (
                      <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mt-8">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Summary</h3>
                        <p className="text-slate-700 leading-relaxed">{summary.summary_text}</p>
                      </div>
                    )}
                  </div>
                ) : hasCornellSections ? (
                  <div className={cn('space-y-3 mx-auto', comfortableReading ? 'max-w-[90ch]' : 'max-w-[100ch]')}>
                    <section
                      id="cornell-cues"
                      className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 px-4 py-3 md:px-5 md:py-4 scroll-mt-28"
                    >
                      <h3 className="flex items-center gap-2 pb-1.5 mb-2 border-b border-slate-200/80 text-slate-900 font-extrabold text-[1.02rem] tracking-tight">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500/90 ring-4 ring-blue-200/60" />
                        Cues
                      </h3>
                      <div className={cn('whitespace-pre-wrap text-slate-800 max-w-none', comfortableReading ? 'leading-[1.78] text-[15.5px]' : 'leading-[1.6] text-[14.5px]')}>
                        {renderedCornellCues || 'No cues available.'}
                      </div>
                    </section>
                    <section
                      id="cornell-notes"
                      className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 px-4 py-3 md:px-5 md:py-4 scroll-mt-28"
                    >
                      <h3 className="flex items-center gap-2 pb-1.5 mb-2 border-b border-slate-200/80 text-slate-900 font-extrabold text-[1.02rem] tracking-tight">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500/90 ring-4 ring-blue-200/60" />
                        Notes
                      </h3>
                      <div className={cn('whitespace-pre-wrap text-slate-800 max-w-none', comfortableReading ? 'leading-[1.78] text-[15.5px]' : 'leading-[1.6] text-[14.5px]')}>
                        {renderedCornellNotes || 'No notes available.'}
                      </div>
                    </section>
                    <section
                      id="cornell-summary"
                      className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 px-4 py-3 md:px-5 md:py-4 scroll-mt-28"
                    >
                      <h3 className="flex items-center gap-2 pb-1.5 mb-2 border-b border-slate-200/80 text-slate-900 font-extrabold text-[1.02rem] tracking-tight">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500/90 ring-4 ring-blue-200/60" />
                        Summary
                      </h3>
                      <div className={cn('whitespace-pre-wrap text-slate-800 max-w-none', comfortableReading ? 'leading-[1.78] text-[15.5px]' : 'leading-[1.6] text-[14.5px]')}>
                        {renderedCornellSummary || 'No summary available.'}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div
                    id="summary-main"
                    className={cn(
                      isStyledSectionSummary ? 'space-y-3' : 'space-y-6',
                      'mx-auto scroll-mt-28',
                      comfortableReading ? 'max-w-[88ch]' : 'max-w-[98ch]',
                    )}
                  >
                    {(renderedSections.length > 0 ? renderedSections : [{ title: 'Summary', body: renderedContentRaw || 'No content available yet.' }]).map((section, idx) => {
                      const bulletHierarchy = isBulletSummary ? parseBulletHierarchy(section.body) : []
                      const hasBulletHierarchy = bulletHierarchy.some((item) => item.children.length > 0)

                      return (
                        <section
                          key={idx}
                          id={renderedSectionTocItems[idx]?.id}
                          className={isStyledSectionSummary
                            ? 'rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 px-4 py-3 md:px-5 md:py-4 scroll-mt-28'
                            : 'border border-border/70 rounded-xl p-6 bg-muted/20 scroll-mt-28'}
                        >
                          <h3 className={isStyledSectionSummary
                            ? 'flex items-center gap-2 pb-1.5 mb-2 border-b border-slate-200/80 text-slate-900 font-extrabold text-[1.02rem] tracking-tight'
                            : 'text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3'}>
                            {isStyledSectionSummary && (
                              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500/90 ring-4 ring-blue-200/60" />
                            )}
                            {section.title}
                          </h3>

                          {isBulletSummary && hasBulletHierarchy ? (
                            <ul className="list-disc pl-5 space-y-2 leading-[1.72] text-slate-800 text-[15px] max-w-none marker:text-slate-500">
                              {bulletHierarchy.map((item, itemIdx) => (
                                <li key={itemIdx}>
                                  <span className={item.children.length > 0 ? 'font-semibold text-slate-900' : ''}>{item.text}</span>
                                  {item.children.length > 0 && (
                                    <ul className="list-disc pl-6 mt-1.5 space-y-1 marker:text-slate-400">
                                      {item.children.map((child, childIdx) => (
                                        <li key={childIdx} className="font-normal text-slate-800">{child}</li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className={isBulletSummary
                              ? comfortableReading
                                ? 'whitespace-pre-wrap leading-[1.76] text-slate-800 text-[15.5px] max-w-none'
                                : 'whitespace-pre-wrap leading-[1.58] text-slate-800 text-[14.5px] max-w-none'
                              : isParagraphSummary
                                ? comfortableReading
                                  ? 'whitespace-pre-wrap leading-[2.02] text-slate-800 text-[15.5px] max-w-none'
                                  : 'whitespace-pre-wrap leading-[1.72] text-slate-800 text-[14.5px] max-w-none'
                                : comfortableReading
                                  ? 'whitespace-pre-wrap leading-[2.02] text-slate-800 text-[15.5px] max-w-[75ch]'
                                  : 'whitespace-pre-wrap leading-[1.72] text-slate-800 text-[14.5px] max-w-[84ch]'}>
                              {section.body}
                            </div>
                          )}
                        </section>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar - Actions (20%) */}
          <div className={rightColumnClass}>
            <div className="sticky top-20 space-y-4">
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </h3>
                  <Button
                    variant="default"
                    className="w-full justify-start"
                    size="sm"
                    disabled={isRegenerating}
                    onClick={handleRegenerate}
                  >
                    {isRegenerating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-2" />
                    )}
                    Regenerate
                  </Button>
                  <Button variant="outline" className="w-full justify-start" size="sm" onClick={handleCopy}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Text
                  </Button>
                  <Button variant="outline" className="w-full justify-start" size="sm" onClick={handleExportPdf}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    size="sm"
                    disabled={isDeleting}
                    onClick={handleDelete}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Reading Mode
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant={comfortableReading ? 'default' : 'outline'}
                      onClick={() => setReadingDensity('comfortable')}
                    >
                      Comfortable
                    </Button>
                    <Button
                      size="sm"
                      variant={!comfortableReading ? 'default' : 'outline'}
                      onClick={() => setReadingDensity('compact')}
                    >
                      Compact
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {tocItems.length > 0 && (
                <Card className="border-border/70 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      On this page
                    </h3>
                    <div className="space-y-1.5">
                      {tocItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleTocJump(item.id)}
                          className={cn(
                            'w-full text-left text-sm rounded-md px-2.5 py-1.5 transition-colors border',
                            item.id === activeTocId
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-transparent text-muted-foreground border-transparent hover:bg-muted/60 hover:text-foreground',
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
      {deleteModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
            onClick={() => !isDeleting && setDeleteModalOpen(false)}
            aria-label="Close delete confirmation modal"
          />
          <div className="relative w-full max-w-md rounded-2xl border bg-background shadow-2xl">
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Delete summary?</h3>
                  <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground pt-1">
                You are about to permanently remove <span className="font-medium text-foreground">{title || 'this summary'}</span>.
              </p>
              <div className="pt-3 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </AppLayout>
  )
}
