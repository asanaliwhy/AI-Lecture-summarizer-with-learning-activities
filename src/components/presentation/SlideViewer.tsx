import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ArrowLeft,
  Play,
  Palette,
  MoreHorizontal,
  FileText,
  FileArchive,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Presentation, SlideTheme } from '../../lib/presentationTypes'
import { DEFAULT_PRESENTATION_THEME_ID, getThemeById, isThemeId } from '../../lib/presentationThemes'
import { PRESENTATION_CANVAS_HEIGHT, PRESENTATION_CANVAS_WIDTH, SlideRenderer } from './SlideRenderer'
import { SlideThumbnail } from './SlideThumbnail'
import { ThemeSelector } from './ThemeSelector'
import { exportPresentationPdf, exportPresentationPptx, type PresentationExportFormat } from '../../lib/presentationExport'
import { useToast } from '../ui/Toast'
import { ConfirmDialog } from '../ui/ConfirmDialog'

interface SlideViewerProps {
  presentation: Presentation
  onBack?: () => void
  onDelete?: (presentationId: string) => Promise<void> | void
  canDelete?: boolean
}

export function SlideViewer({ presentation, onBack, onDelete, canDelete = true }: SlideViewerProps) {
  const storageKey = `presentation-theme:${presentation.id}`
  const toast = useToast()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedTheme, setSelectedTheme] = useState<SlideTheme>(presentation.theme || DEFAULT_PRESENTATION_THEME_ID)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPresenting, setIsPresenting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportingFormat, setExportingFormat] = useState<PresentationExportFormat | null>(null)
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? PRESENTATION_CANVAS_WIDTH : window.innerWidth,
    height: typeof window === 'undefined' ? PRESENTATION_CANVAS_HEIGHT : window.innerHeight,
  }))
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const thumbRef = useRef<HTMLDivElement>(null)

  const slides = presentation.slides
  const total = slides.length
  const theme = getThemeById(selectedTheme)

  useEffect(() => {
    const preferredTheme = presentation.theme || DEFAULT_PRESENTATION_THEME_ID
    const storedTheme = localStorage.getItem(storageKey)

    if (storedTheme && isThemeId(storedTheme)) {
      setSelectedTheme(storedTheme)
      return
    }

    setSelectedTheme(isThemeId(preferredTheme) ? preferredTheme : DEFAULT_PRESENTATION_THEME_ID)
  }, [presentation.theme, storageKey])

  useEffect(() => {
    if (!isThemeId(selectedTheme)) {
      return
    }
    localStorage.setItem(storageKey, selectedTheme)
  }, [selectedTheme, storageKey])

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    updateViewportSize()
    window.addEventListener('resize', updateViewportSize)
    return () => window.removeEventListener('resize', updateViewportSize)
  }, [])

  // Track which slide is most visible
  useEffect(() => {
    if (isPresenting) return
    const container = scrollRef.current
    if (!container) return
    const handleScroll = () => {
      let bestIndex = 0
      let bestVisibility = 0
      const containerRect = container.getBoundingClientRect()
      slideRefs.current.forEach((el, i) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const top = Math.max(rect.top, containerRect.top)
        const bottom = Math.min(rect.bottom, containerRect.bottom)
        const visible = Math.max(0, bottom - top)
        if (visible > bestVisibility) {
          bestVisibility = visible
          bestIndex = i
        }
      })
      setCurrentIndex(bestIndex)
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isPresenting])

  // Auto-scroll thumbnail into view
  useEffect(() => {
    if (isPresenting) return
    const thumbContainer = thumbRef.current
    if (!thumbContainer) return
    const activeThumb = thumbContainer.children[currentIndex] as HTMLElement
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentIndex, isPresenting])

  const scrollToSlide = useCallback((index: number) => {
    const el = slideRefs.current[index]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return
    if (isPresenting) {
      setCurrentIndex((prev) => Math.max(0, prev - 1))
      return
    }
    scrollToSlide(currentIndex - 1)
  }, [currentIndex, isPresenting, scrollToSlide])

  const goNext = useCallback(() => {
    if (currentIndex >= total - 1) return
    if (isPresenting) {
      setCurrentIndex((prev) => Math.min(total - 1, prev + 1))
      return
    }
    scrollToSlide(currentIndex + 1)
  }, [currentIndex, isPresenting, scrollToSlide, total])

  const exitPresentMode = useCallback(async () => {
    setIsPresenting(false)
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch {
        // Ignore fullscreen exit failures
      }
    }
  }, [])

  const handlePresent = useCallback(async () => {
    setShowThemePicker(false)
    setShowExportMenu(false)
    setShowActionsMenu(false)
    setIsPresenting(true)

    const root = rootRef.current
    if (!root || document.fullscreenElement) {
      return
    }

    try {
      await root.requestFullscreen()
    } catch {
      // Continue in in-app present mode if fullscreen fails
    }
  }, [])

  const handleDelete = useCallback(async () => {
    if (!onDelete || isDeleting || !canDelete) {
      return
    }

    setIsDeleting(true)
    try {
      await onDelete(presentation.id)
      toast.success('Presentation deleted')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete presentation'
      toast.error(message)
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }, [canDelete, isDeleting, onDelete, presentation.id, toast])

  const collectExportSlideElements = useCallback((): HTMLElement[] => {
    const nodes: HTMLElement[] = []
    slideRefs.current.forEach((container) => {
      if (!container) {
        return
      }
      const captureRoot = container.querySelector<HTMLElement>('[data-slide-capture="true"]')
      if (captureRoot) {
        nodes.push(captureRoot)
      }
    })
    return nodes
  }, [])

  const handleExport = useCallback(async (format: PresentationExportFormat) => {
    if (isExporting) {
      return
    }

    const exportSlides = collectExportSlideElements()
    if (!exportSlides.length) {
      toast.error('No slides available for export')
      return
    }

    setShowExportMenu(false)
    setIsExporting(true)
    setExportingFormat(format)

    try {
      if (format === 'pdf') {
        await exportPresentationPdf({
          presentation,
          slideElements: exportSlides,
          slideWidth: PRESENTATION_CANVAS_WIDTH,
          slideHeight: PRESENTATION_CANVAS_HEIGHT,
        })
      } else {
        await exportPresentationPptx({
          presentation,
          slideElements: exportSlides,
          slideWidth: PRESENTATION_CANVAS_WIDTH,
          slideHeight: PRESENTATION_CANVAS_HEIGHT,
        })
      }

      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to export presentation'
      toast.error(message)
    } finally {
      setIsExporting(false)
      setExportingFormat(null)
    }
  }, [collectExportSlideElements, isExporting, presentation, toast])

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsPresenting(false)
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPresenting) {
        e.preventDefault()
        void exitPresentMode()
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [exitPresentMode, goPrev, goNext, isPresenting])

  if (isPresenting) {
    const activeSlide = slides[currentIndex]
    const horizontalPadding = viewportSize.width < 768 ? 24 : 48
    const verticalPadding = viewportSize.height < 900 ? 88 : 112
    const availableWidth = Math.max(320, viewportSize.width - horizontalPadding)
    const availableHeight = Math.max(180, viewportSize.height - verticalPadding)
    const presentScale = Math.min(
      availableWidth / PRESENTATION_CANVAS_WIDTH,
      availableHeight / PRESENTATION_CANVAS_HEIGHT,
    )
    const presentationWidth = PRESENTATION_CANVAS_WIDTH * presentScale
    const presentationHeight = PRESENTATION_CANVAS_HEIGHT * presentScale

    return (
      <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div
            className="shrink-0"
            style={{
              width: `${presentationWidth}px`,
              height: `${presentationHeight}px`,
            }}
          >
            <SlideRenderer slide={activeSlide} theme={theme} scale={presentScale} />
          </div>
        </div>

        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl border border-white/20 bg-black/50 backdrop-blur">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className={cn(
              'h-9 w-9 flex items-center justify-center rounded-md transition-colors',
              currentIndex === 0 ? 'text-white/30 cursor-not-allowed' : 'text-white hover:bg-white/15',
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <span className="text-white text-sm tabular-nums min-w-[64px] text-center">
            {currentIndex + 1} / {total}
          </span>

          <button
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className={cn(
              'h-9 w-9 flex items-center justify-center rounded-md transition-colors',
              currentIndex === total - 1 ? 'text-white/30 cursor-not-allowed' : 'text-white hover:bg-white/15',
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <button
            onClick={() => void exitPresentMode()}
            className="h-9 w-9 flex items-center justify-center rounded-md text-white hover:bg-white/15 transition-colors"
            title="Exit presentation mode"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col" style={{ background: 'linear-gradient(180deg, #eef2f7 0%, #e6ecf3 100%)' }}>

      {/* ═══════ TOP BAR (Light nav) ═══════ */}
      <div className="h-14 flex-shrink-0 flex items-center justify-between px-5 border-b border-black/[0.08]"
           style={{ background: '#ffffff' }}>
        {/* Left: Back + title */}
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-black/[0.05] transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[15px] font-semibold text-slate-800 truncate max-w-[400px]">
              {presentation.title}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <div className="relative">
            <button
              onClick={() => {
                setShowExportMenu(false)
                setShowActionsMenu(false)
                setShowThemePicker((prev) => !prev)
              }}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-black/[0.05] transition-colors"
            >
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Theme</span>
            </button>

            {/* Theme picker dropdown */}
            {showThemePicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowThemePicker(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 p-2.5 rounded-xl border border-black/[0.08] shadow-xl"
                     style={{ background: '#ffffff' }}>
                  <ThemeSelector
                    activeTheme={selectedTheme}
                    onThemeChange={(t) => {
                      setSelectedTheme(t)
                      setShowThemePicker(false)
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                if (isExporting || isDeleting) return
                setShowThemePicker(false)
                setShowActionsMenu(false)
                setShowExportMenu((prev) => !prev)
              }}
              disabled={isExporting || isDeleting}
              className={cn(
                'flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-medium transition-colors',
                isExporting || isDeleting
                  ? 'text-slate-400 cursor-not-allowed bg-black/[0.03]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-black/[0.05]',
              )}
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {isExporting
                  ? `Exporting ${exportingFormat ? exportingFormat.toUpperCase() : ''}`.trim()
                  : 'Export'}
              </span>
            </button>

            {showExportMenu && !isExporting && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-2 z-50 w-44 rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-xl"
                >
                  <button
                    type="button"
                    onClick={() => void handleExport('pdf')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <FileText className="h-4 w-4 text-slate-500" />
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport('pptx')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <FileArchive className="h-4 w-4 text-slate-500" />
                    Export PPTX
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                if (isDeleting || isExporting) return
                setShowThemePicker(false)
                setShowExportMenu(false)
                setShowActionsMenu((prev) => !prev)
              }}
              disabled={isDeleting || isExporting}
              className={cn(
                'h-9 w-9 flex items-center justify-center rounded-lg transition-colors',
                isDeleting || isExporting
                  ? 'text-slate-400 cursor-not-allowed bg-black/[0.03]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-black/[0.05]',
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>

            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowActionsMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-xl">
                  <button
                    type="button"
                    disabled={!canDelete || isDeleting}
                    onClick={() => {
                      if (!canDelete || isDeleting) return
                      setShowActionsMenu(false)
                      setShowDeleteDialog(true)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium',
                      !canDelete || isDeleting
                        ? 'text-slate-400 cursor-not-allowed'
                        : 'text-red-600 hover:bg-red-50',
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Presentation
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Present button */}
          <button
            onClick={() => void handlePresent()}
            className="flex items-center gap-2 h-9 px-5 rounded-lg text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors ml-2"
          >
            <Play className="h-3.5 w-3.5 fill-white" />
            Present
          </button>
        </div>
      </div>

      {/* ═══════ BODY: Sidebar + Canvas ═══════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ─── Left Thumbnail Sidebar ─── */}
        <div className="hidden md:flex flex-col flex-shrink-0 border-r border-black/[0.08] w-[184px]"
             style={{ background: '#f1f5f9' }}>
          <div
            ref={thumbRef}
            className="flex-1 overflow-y-auto px-2 py-4 flex flex-col items-center gap-4"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}
          >
            {slides.map((slide, index) => (
              <SlideThumbnail
                key={slide.id}
                slide={slide}
                theme={theme}
                index={index}
                isActive={index === currentIndex}
                onClick={() => scrollToSlide(index)}
              />
            ))}
          </div>
        </div>

        {/* ─── Main Canvas ─── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}
          >
            <div className="mx-auto px-3 sm:px-5 pt-6 pb-24" style={{ maxWidth: '1700px' }}>
              {slides.map((slide, index) => (
                <div
                  key={slide.id}
                  ref={(el) => { slideRefs.current[index] = el }}
                  className="mb-8"
                >
                  {/* Slide card */}
                  <div
                    data-slide-card="true"
                    className={cn(
                      'rounded-xl overflow-hidden transition-shadow duration-300 mx-auto',
                      index === currentIndex
                        ? 'shadow-[0_0_0_2px_rgba(59,130,246,0.5),0_8px_40px_rgba(0,0,0,0.4)]'
                        : 'shadow-[0_4px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_40px_rgba(0,0,0,0.4)]',
                    )}
                    style={{ width: '100%', maxWidth: `${PRESENTATION_CANVAS_WIDTH}px`, aspectRatio: `${PRESENTATION_CANVAS_WIDTH} / ${PRESENTATION_CANVAS_HEIGHT}` }}
                  >
                    <div data-slide-capture="true" className="h-full w-full">
                      <SlideRenderer slide={slide} theme={theme} scale={1} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ BOTTOM RIGHT: Slide counter ═══════ */}
      <div className="absolute bottom-5 right-5 z-30 flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[14px] font-medium text-slate-600 border border-black/[0.08] shadow-sm"
             style={{ background: '#ffffff' }}>
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded-md transition-colors',
              currentIndex === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-900 hover:bg-black/[0.05]',
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tabular-nums px-1.5">
            {currentIndex + 1} / {total}
          </span>
          <button
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className={cn(
              'h-6 w-6 flex items-center justify-center rounded-md transition-colors',
              currentIndex === total - 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-500 hover:text-slate-900 hover:bg-black/[0.05]',
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete presentation"
        description="Delete this presentation permanently? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={isDeleting}
        onCancel={() => {
          if (!isDeleting) {
            setShowDeleteDialog(false)
          }
        }}
        onConfirm={() => {
          void handleDelete()
        }}
      />
    </div>
  )
}
