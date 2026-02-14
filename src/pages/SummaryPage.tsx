import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { api, type SummaryDetailResponse, type SummarySectionResponse } from '../lib/api'
import { useStudySession } from '../lib/useStudySession'
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

    const headingMatch = line.match(/^(.{3,80}):$/)
    const looksLikeHeading =
      !line.startsWith('• ') &&
      line.length <= 80 &&
      !/[.!?]$/.test(line) &&
      /[A-Za-zÀ-ÿ]/.test(line)

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

function renderSmartSummaryHtml(value: string): string {
  if (!value) return ''

  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/^\s*(\d+)[.)]\s+(.+)$/gm, '## $2')
    .replace(/^\s*([A-Za-z][A-Za-z\s&/-]{2,40}):\s+(.+)$/gm, '- **$1:** $2')

  const html = marked.parse(normalized, { async: false }) as string
  return DOMPurify.sanitize(html)
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

  useEffect(() => {
    if (!id) return
    async function load() {
      try {
        const data = await api.summaries.get(id!)
        setSummary(data)
        setTitle(data.title || 'Untitled Summary')
      } catch {
        setSummary(null)
      } finally {
        setIsLoading(false)
      }
    }
    load()
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
      const { job_id } = await api.summaries.regenerate(id)
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

      const rawMain = normalizeGeneralSummaryText(summary?.content_raw || summary?.content || summary?.body || '')
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

      doc.setFontSize(12)
      const lines = doc.splitTextToSize(text, contentWidth)

      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin, y)
        y += 18
      }

      doc.save(`${fileTitle}.pdf`)
      toast.success('PDF exported')
    } catch {
      toast.error('Failed to export PDF')
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    )
  }

  if (!summary) {
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

  const createdAt = summary.created_at ? new Date(summary.created_at).toLocaleDateString() : 'Recently'
  const duration = summary.source_duration || summary.duration || ''
  const sourceUrl = summary.source_url || ''
  const sourceRaw = String(summary.source || summary.source_type || '').toLowerCase()
  const isYouTubeSource = sourceRaw.includes('youtube') || sourceRaw.includes('youtu')
  const sourceLabel = isYouTubeSource ? 'YouTube' : 'Document'
  const tags: string[] = summary.tags || []
  const contentRaw: string = summary.content_raw || summary.content || summary.body || ''
  const cornellCues: string = summary.cornell_cues || ''
  const cornellNotes: string = summary.cornell_notes || ''
  const cornellSummary: string = summary.cornell_summary || ''
  const renderedCornellCues = normalizeCornellText(cornellCues)
  const renderedCornellNotes = normalizeCornellText(cornellNotes)
  const renderedCornellSummary = normalizeCornellText(cornellSummary)
  const renderedContentRaw = normalizeGeneralSummaryText(contentRaw)
  const renderedSections = splitIntoSections(renderedContentRaw)
  const smartSummaryHtml = summary.format === 'smart' ? renderSmartSummaryHtml(contentRaw) : ''
  const hasCornellSections = summary.format === 'cornell' && (cornellCues || cornellNotes || cornellSummary)
  const isSmartSummary = summary.format === 'smart'

  // Parse content sections
  const sections: SummarySectionResponse[] = summary.sections || []
  const hasSections = sections.length > 0

  return (
    <AppLayout>
      <div className="max-w-[1380px] mx-auto pb-8">
        {/* Top Header / Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 md:mb-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant="secondary"
                className="bg-blue-100/90 text-blue-700 hover:bg-blue-100 border-blue-200/80"
              >
                Summary
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
          <div className="lg:col-span-3 space-y-6">
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
                  {duration && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Duration
                      </h3>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {duration}
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Date
                    </h3>
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {createdAt}
                    </div>
                  </div>
                </div>
                {tags.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-[11px] px-2.5 py-1 bg-background/70">{tag}</Badge>
                      ))}
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
                  className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white h-11 text-base"
                  onClick={() => navigate(`/quiz/create/${id}`)}
                >
                  <BrainCircuit className="h-4 w-4 mr-2" />
                  Generate Quiz
                </Button>
                <Button
                  className="w-full justify-start bg-white text-blue-700 border-blue-200 hover:bg-blue-50 hover:text-blue-800 h-11 text-base"
                  variant="outline"
                  onClick={() => navigate(`/flashcards/create/${id}`)}
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Create Flashcards
                </Button>
              </div>
            </div>
          </div>

          {/* Center - Content (60%) */}
          <div className="lg:col-span-7">
            <Card className="min-h-[620px] shadow-sm border-border/70">
              <CardContent className="p-6 md:p-10 lg:p-12">
                {isSmartSummary ? (
                  <div className="rounded-2xl border border-[#1f335f] bg-[#0b1736] p-6 md:p-8 text-slate-200 shadow-sm">
                    <div className="prose max-w-none prose-invert prose-headings:text-slate-100 prose-headings:font-bold prose-headings:tracking-tight prose-p:text-slate-200 prose-strong:text-slate-100 prose-li:text-slate-200 prose-ul:my-2 prose-table:w-full prose-table:rounded-lg prose-table:overflow-hidden prose-table:border prose-table:border-[#2b416f] prose-th:border prose-th:border-[#2b416f] prose-th:bg-[#253455] prose-th:text-slate-100 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-[#2b416f] prose-td:px-3 prose-td:py-2">
                      <div dangerouslySetInnerHTML={{ __html: smartSummaryHtml || '<p>No content available yet.</p>' }} />
                    </div>
                  </div>
                ) : hasSections ? (
                  <div className="space-y-10">
                    {sections.map((section, idx: number) => (
                      <div key={idx} className="border-b border-border/60 pb-8 last:border-b-0">
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
                            <div className="text-slate-800 leading-8 space-y-4 prose prose-slate max-w-[72ch]"
                              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(section.content || section.body || '') }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {summary.summary_text && (
                      <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mt-8">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Summary</h3>
                        <p className="text-slate-700 leading-relaxed">{summary.summary_text}</p>
                      </div>
                    )}
                  </div>
                ) : hasCornellSections ? (
                  <div className="space-y-6">
                    <div className="border border-border/70 rounded-xl p-5 bg-slate-50/60">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Cues</h3>
                      <div className="whitespace-pre-wrap leading-8 text-slate-800 max-w-[75ch]">
                        {renderedCornellCues || 'No cues available.'}
                      </div>
                    </div>
                    <div className="border border-border/70 rounded-xl p-5 bg-white">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Notes</h3>
                      <div className="whitespace-pre-wrap leading-8 text-slate-800 max-w-[75ch]">
                        {renderedCornellNotes || 'No notes available.'}
                      </div>
                    </div>
                    <div className="border rounded-xl p-5 bg-blue-50/70 border-blue-100">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-700 mb-3">Summary</h3>
                      <div className="whitespace-pre-wrap leading-8 text-slate-800 max-w-[75ch]">
                        {renderedCornellSummary || 'No summary available.'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {(renderedSections.length > 0 ? renderedSections : [{ title: 'Summary', body: renderedContentRaw || 'No content available yet.' }]).map((section, idx) => (
                      <div key={idx} className="border border-border/70 rounded-xl p-6 bg-muted/20">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                          {section.title}
                        </h3>
                        <div className="whitespace-pre-wrap leading-8 text-slate-800 text-[15px] max-w-[75ch]">
                          {section.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar - Actions (20%) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="sticky top-24">
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </h3>
                  <Button variant="outline" className="w-full justify-start" size="sm" onClick={handleCopy}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Text
                  </Button>
                  <Button variant="outline" className="w-full justify-start" size="sm" onClick={handleExportPdf}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full justify-start"
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
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-muted-foreground hover:text-foreground border border-transparent hover:border-border/60"
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
                </CardContent>
              </Card>
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
