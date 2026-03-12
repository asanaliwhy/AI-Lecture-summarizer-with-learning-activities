import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, Loader2, Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/utils'
import { AppLayout } from '../components/layout/AppLayout'
import { useToast } from '../components/ui/Toast'

type FlashcardResultCard = {
  id: string
  front: string
  back: string
}

type FlashcardResultPageProps = {
  flashcardSetId: string
  title: string
  cards: FlashcardResultCard[]
  ratings: Record<string, 'mastered' | 'learning'>
  elapsedSeconds: number
  onStudyAgain: () => void
}

export async function exportFlashcardResultsPdf(params: {
  title: string
  cards: Array<{ id: string; front: string; back: string }>
  ratings: Record<string, 'mastered' | 'learning'>
  elapsedSeconds: number
  fileName?: string
}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40

  const { title, cards, ratings } = params

  const totalCards = cards.length
  const masteredCount = Object.values(ratings).filter((v) => v === 'mastered').length
  const learningCount = Object.values(ratings).filter((v) => v === 'learning').length

  const flashPageWidth = doc.internal.pageSize.getWidth()
  const flashPageHeight = doc.internal.pageSize.getHeight()
  const flashContentWidth = flashPageWidth - margin * 2
  let yFlash = margin

  const ensurePageSpaceFlash = (h: number) => {
    if (yFlash + h > flashPageHeight - margin) {
      doc.addPage()
      yFlash = margin
    }
  }

  const NAVY = '#1a1a2e'
  const SLATE = '#475569'
  const BODY_COLOR = '#334155'
  const OFF_WHITE = '#f8fafc'
  const RULE = '#e2e8f0'
  const GRAY_LIGHT = '#f1f5f9'
  const GRAY_TEXT = '#94a3b8'

  const badgeHeight = 16
  const badgeToTitleGap = 28
  doc.setFillColor(NAVY)
  doc.rect(margin, yFlash, flashContentWidth, badgeHeight, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor('#ffffff')
  doc.text('FLASHCARDS', margin + 8, yFlash + 11)
  yFlash += badgeHeight + badgeToTitleGap

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(NAVY)
  const deckTitle = title || 'Flashcards'
  const titleLines = doc.splitTextToSize(deckTitle, flashContentWidth) as string[]
  for (const line of titleLines) {
    ensurePageSpaceFlash(28)
    doc.text(line, margin, yFlash)
    yFlash += 28
  }
  yFlash += -7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(GRAY_TEXT)
  ensurePageSpaceFlash(16)

  const d = new Date()
  const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  doc.text(`Generated: ${dateStr}`, margin, yFlash)
  yFlash += 12

  doc.setFillColor(NAVY)
  doc.rect(margin, yFlash, flashContentWidth, 1, 'F')
  yFlash += 20

  const statsRowHeight = 44
  ensurePageSpaceFlash(statsRowHeight + 20)
  const colW = flashContentWidth / 3

  doc.setFillColor(OFF_WHITE)
  doc.rect(margin, yFlash, flashContentWidth, statsRowHeight, 'F')
  doc.setDrawColor(RULE)
  doc.setLineWidth(0.5)
  doc.rect(margin, yFlash, flashContentWidth, statsRowHeight, 'S')

  doc.line(margin + colW, yFlash, margin + colW, yFlash + statsRowHeight)
  doc.line(margin + colW * 2, yFlash, margin + colW * 2, yFlash + statsRowHeight)

  const drawStatCol = (index: number, value: string, label: string) => {
    const cx = margin + colW * index + (colW / 2)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(NAVY)
    doc.text(value, cx, yFlash + 18, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(GRAY_TEXT)
    doc.text(label, cx, yFlash + 32, { align: 'center' })
  }

  drawStatCol(0, String(totalCards), 'Total Cards')
  drawStatCol(1, String(learningCount), 'To Review')
  drawStatCol(2, String(masteredCount), 'Mastered')

  yFlash += statsRowHeight + 20

  ensurePageSpaceFlash(25)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(SLATE)
  yFlash += 20
  doc.text('ALL CARDS', margin, yFlash)
  yFlash += 25

  const frontColWidth = flashContentWidth * 0.42
  const backColWidth = flashContentWidth * 0.58
  const frontTextMaxWidth = Math.max(frontColWidth - 32, 80)
  const backTextMaxWidth = Math.max(backColWidth - 32, 80)

  const normalizeInlineText = (value: string) => String(value || '').replace(/\s+/g, ' ').trim()
  const fitLineToWidth = (line: string, maxWidth: number) => {
    const fitted = doc.splitTextToSize(line, maxWidth) as string[]
    if (fitted.length <= 1) return fitted[0] || ''
    const first = (fitted[0] || '').trim()
    return first ? `${first}…` : ''
  }

  cards.forEach((card, index) => {
    const frontText = normalizeInlineText(card.front || '')
    const backText = normalizeInlineText(card.back || '')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    const frontWrappedRaw = doc.splitTextToSize(frontText, frontTextMaxWidth) as string[]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const backWrappedRaw = doc.splitTextToSize(backText, backTextMaxWidth) as string[]
    const frontWrapped = frontWrappedRaw.map((line: string) => fitLineToWidth(String(line), frontTextMaxWidth))
    const backWrapped = backWrappedRaw.map((line: string) => fitLineToWidth(String(line), backTextMaxWidth))

    const frontHeight = frontWrapped.length * 15 + 36
    const backHeight = backWrapped.length * 15 + 36
    const cardHeight = Math.max(frontHeight, backHeight)

    ensurePageSpaceFlash(cardHeight + 22 + 5 + 10)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(SLATE)
    yFlash += 20
    doc.text(`Card ${index + 1}`, margin, yFlash)
    yFlash += 12

    doc.setFillColor(NAVY)
    doc.rect(margin, yFlash, frontColWidth, cardHeight, 'F')

    doc.setFillColor(GRAY_LIGHT)
    doc.rect(margin + frontColWidth, yFlash, backColWidth, 24, 'F')

    doc.setFillColor(OFF_WHITE)
    doc.rect(margin + frontColWidth, yFlash + 24, backColWidth, cardHeight - 24, 'F')

    doc.setDrawColor(RULE)
    doc.setLineWidth(0.5)
    doc.rect(margin, yFlash, flashContentWidth, cardHeight, 'S')
    doc.line(margin + frontColWidth, yFlash, margin + frontColWidth, yFlash + cardHeight)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor('#94a3b8')
    doc.text('FRONT', margin + 12, yFlash + 14)

    doc.setFontSize(10)
    doc.setTextColor('#ffffff')
    let frontTextY = yFlash + 14 + 15
    frontWrapped.forEach((line: string) => {
      doc.text(line, margin + 12, frontTextY)
      frontTextY += 15
    })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(GRAY_TEXT)
    doc.text('BACK', margin + frontColWidth + 12, yFlash + 14)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(BODY_COLOR)
    let backTextY = yFlash + 24 + 5
    backWrapped.forEach((line: string) => {
      doc.text(line, margin + frontColWidth + 12, backTextY, { align: 'left' })
      backTextY += 15
    })

    yFlash += cardHeight + 10
  })

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.5)
    doc.line(margin, flashPageHeight - margin + 8, margin + flashContentWidth, flashPageHeight - margin + 8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`Lectura · Page ${i} of ${totalPages}`, flashPageWidth / 2, flashPageHeight - margin + 18, {
      align: 'center',
    })
  }

  doc.save(`${params.fileName || deckTitle}.pdf`)
}

export function FlashcardResultPage({
  flashcardSetId,
  title,
  cards,
  ratings,
  elapsedSeconds,
  onStudyAgain,
}: FlashcardResultPageProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [isExporting, setIsExporting] = useState(false)

  const totalCards = cards.length
  const masteredCount = Object.values(ratings).filter((v) => v === 'mastered').length
  const learningCount = Object.values(ratings).filter((v) => v === 'learning').length
  const percentage = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s === 0 ? `${m}m` : `${m}m ${s}s`
  }

  const handleExportPdf = async () => {
    if (cards.length === 0) return
    setIsExporting(true)

    try {
      await exportFlashcardResultsPdf({
        title,
        cards,
        ratings,
        elapsedSeconds,
      })
      toast.success('PDF exported')
    } catch (err) {
      console.error(err)
      toast.error('Failed to export PDF')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <AppLayout>
      <main className="max-w-5xl mx-auto py-8" data-flashcard-set-id={flashcardSetId}>
        <div className="mb-10">
          <div className="inline-flex items-center px-3 py-1 rounded-md bg-[#e8e8f0] text-[#1a1a2e] text-[11px] font-bold uppercase tracking-[0.08em] mb-4">
            FLASHCARD RESULTS
          </div>
          <h1 className="text-4xl font-bold text-[#1a1a2e] leading-tight">{title}</h1>
        </div>

        <div className="rounded-xl overflow-hidden border border-[#e2e8f0] mb-1">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,30%)_1fr]">
            <div className="bg-[#1a1a2e] text-white px-6 py-7 flex flex-col items-center justify-center text-center">
              <div className="text-4xl font-bold leading-none">{percentage}%</div>
              <div className="text-[12px] text-[#cbd5e1] mt-2">
                {masteredCount} of {totalCards} mastered
              </div>
            </div>

            <div className="bg-[#f8fafc] grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#e2e8f0]">
              <div className="px-6 py-5 text-center">
                <div className="text-xl font-bold text-[#1a1a2e]">{totalCards}</div>
                <div className="text-[11px] uppercase tracking-wide text-[#94a3b8] mt-1">Total Cards</div>
              </div>
              <div className="px-6 py-5 text-center">
                <div className="text-xl font-bold text-[#1a1a2e] inline-flex items-center gap-1.5">
                  <Clock3 className="h-4 w-4" />
                  {formatElapsed(elapsedSeconds)}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-[#94a3b8] mt-1">Session Time</div>
              </div>
              <div className="px-6 py-5 text-center">
                <div className="text-xl font-bold text-[#15803d]">Complete</div>
                <div className="text-[11px] uppercase tracking-wide text-[#94a3b8] mt-1">Result</div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-[5px] w-full bg-[#e2e8f0] mb-9 rounded-sm overflow-hidden">
          <div className="h-full bg-[#1a1a2e]" style={{ width: `${percentage}%` }} />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-[#1a1a2e]">CARD BREAKDOWN</h2>
          <div className="text-xs text-muted-foreground">{learningCount} learning</div>
        </div>

        <div className="space-y-4">
          {cards.map((card, index) => {
            const status = ratings[card.id] || 'learning'
            const isMastered = status === 'mastered'
            const statusText = isMastered ? 'Mastered' : 'Learning'

            return (
              <div key={card.id || `card-${index}`} className="border border-[#e2e8f0] rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                  <div className="h-6 min-w-6 px-1 bg-[#1a1a2e] text-white text-[10px] font-bold rounded-sm flex items-center justify-center">
                    C{index + 1}
                  </div>
                  <p className="text-sm font-semibold text-[#1a1a2e]">Card {index + 1}</p>
                </div>

                <div className="px-4 pb-4">
                  <div className="flex items-stretch border border-[#e2e8f0]">
                    <div className="w-1 bg-[#1a1a2e]" />
                    <div className="flex-1 bg-[#f8fafc] px-3 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">Front</div>
                      <div className="text-sm font-semibold text-[#1a1a2e] leading-relaxed">{card.front}</div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#e2e8f0] border border-t-0 border-[#e2e8f0]',
                      isMastered ? 'bg-green-50 dark:bg-green-500/10' : 'bg-amber-50 dark:bg-amber-500/10',
                    )}
                  >
                    <div className="px-3 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">YOUR RATING</div>
                      <div className={cn('text-sm font-semibold', isMastered ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300')}>
                        {statusText}
                      </div>
                    </div>
                    <div className="px-3 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[#94a3b8] mb-1">CARD STATUS</div>
                      <div className={cn('text-sm font-semibold', isMastered ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300')}>
                        {statusText}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-4 mt-10">
          <Button variant="outline" size="lg" onClick={handleExportPdf} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </Button>
          <Button size="lg" onClick={onStudyAgain}>
            Study Again
          </Button>
        </div>

        <div className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          Lectura · Flashcard Results
        </div>
      </main>
    </AppLayout>
  )
}

