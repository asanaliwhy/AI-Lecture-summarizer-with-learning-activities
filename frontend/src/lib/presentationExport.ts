import type { Presentation } from './presentationTypes'

const DEFAULT_SLIDE_WIDTH = 1366
const DEFAULT_SLIDE_HEIGHT = 768

export type PresentationExportFormat = 'pdf' | 'pptx'

interface PresentationExportOptions {
  presentation: Presentation
  slideElements: HTMLElement[]
  slideWidth?: number
  slideHeight?: number
}

function sanitizeFileName(value: string, fallback = 'presentation') {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

async function waitForImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))
  if (images.length === 0) return

  const loadPromises = images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const done = () => resolve()
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })
  })

  await Promise.race([
    Promise.all(loadPromises).then(() => undefined),
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ])
}

async function waitForFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
  if (fonts?.ready) await fonts.ready.catch(() => undefined)
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function restoreStyle(el: HTMLElement, saved: string) {
  if (saved) el.setAttribute('style', saved)
  else el.removeAttribute('style')
}

/**
 * Capture slides by temporarily positioning them `fixed` off-screen at the
 * exact export resolution. This escapes ALL ancestor overflow / sizing
 * constraints while preserving every inline style, loaded image, and font.
 */
async function captureSlideImages(
  slideElements: HTMLElement[],
  slideWidth = DEFAULT_SLIDE_WIDTH,
  slideHeight = DEFAULT_SLIDE_HEIGHT,
): Promise<string[]> {
  const html2canvasModule = await import('html2canvas')
  const html2canvas = html2canvasModule.default

  await waitForFonts()

  const images: string[] = []

  for (const slideElement of slideElements) {
    await waitForImages(slideElement)

    // ── Save original inline styles on this element and its parent ──
    const savedStyle = slideElement.getAttribute('style') || ''
    const parent = slideElement.parentElement
    const savedParentStyle = parent ? parent.getAttribute('style') || '' : ''

    // ── Pull the element out of flow via `position: fixed` ──
    // This escapes every ancestor's overflow clipping, max-width, and
    // aspect-ratio constraint. The element keeps its children, inline
    // styles, loaded images, and access to document fonts.
    if (parent) {
      parent.style.position = 'fixed'
      parent.style.left = '-20000px'
      parent.style.top = '0'
      parent.style.width = `${slideWidth}px`
      parent.style.height = `${slideHeight}px`
      parent.style.maxWidth = 'none'
      parent.style.aspectRatio = 'unset'
      parent.style.overflow = 'hidden'
      parent.style.borderRadius = '0'
      parent.style.boxShadow = 'none'
      parent.style.zIndex = '-1'
      parent.style.pointerEvents = 'none'
    }

    slideElement.style.width = `${slideWidth}px`
    slideElement.style.height = `${slideHeight}px`
    slideElement.style.minHeight = `${slideHeight}px`
    slideElement.style.maxWidth = 'none'
    slideElement.style.overflow = 'hidden'
    slideElement.style.transform = 'none'
    slideElement.style.aspectRatio = 'unset'

    // Let the browser lay out at the new dimensions
    await nextFrame()
    await nextFrame()
    await sleep(60)

    try {
      const canvas = await html2canvas(slideElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 20000,
        logging: false,
        backgroundColor: null,
        width: slideWidth,
        height: slideHeight,
        windowWidth: slideWidth + 100,
        windowHeight: slideHeight + 100,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
      })
      images.push(canvas.toDataURL('image/png', 1))
    } catch {
      const fb = document.createElement('canvas')
      fb.width = slideWidth * 2
      fb.height = slideHeight * 2
      const ctx = fb.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#1a1a2e'
        ctx.fillRect(0, 0, fb.width, fb.height)
        ctx.fillStyle = '#fff'
        ctx.font = '48px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Slide could not be captured', fb.width / 2, fb.height / 2)
      }
      images.push(fb.toDataURL('image/png', 1))
    }

    // ── Restore original styles ──
    if (parent) restoreStyle(parent, savedParentStyle)
    restoreStyle(slideElement, savedStyle)
    await nextFrame()
  }

  return images
}

export async function exportPresentationPdf(options: PresentationExportOptions) {
  const {
    presentation, slideElements,
    slideWidth = DEFAULT_SLIDE_WIDTH,
    slideHeight = DEFAULT_SLIDE_HEIGHT,
  } = options

  if (!slideElements.length) throw new Error('No slides available for export')

  const { jsPDF } = await import('jspdf')
  const images = await captureSlideImages(slideElements, slideWidth, slideHeight)

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [slideWidth, slideHeight],
    compress: true,
  })

  images.forEach((img, i) => {
    if (i > 0) doc.addPage([slideWidth, slideHeight], 'landscape')
    doc.addImage(img, 'PNG', 0, 0, slideWidth, slideHeight, undefined, 'FAST')
  })

  doc.save(`${sanitizeFileName(presentation.title)}.pdf`)
}

export async function exportPresentationPptx(options: PresentationExportOptions) {
  const {
    presentation, slideElements,
    slideWidth = DEFAULT_SLIDE_WIDTH,
    slideHeight = DEFAULT_SLIDE_HEIGHT,
  } = options

  if (!slideElements.length) throw new Error('No slides available for export')

  const images = await captureSlideImages(slideElements, slideWidth, slideHeight)
  const pptxModule = await import('pptxgenjs')
  const PptxGenJS = pptxModule.default

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Lectura'
  pptx.subject = presentation.title
  pptx.title = presentation.title
  pptx.company = 'Lectura'

  const W = 13.333
  const H = 7.5

  images.forEach((img) => {
    const slide = pptx.addSlide()
    slide.addImage({ data: img, x: 0, y: 0, w: W, h: H })
  })

  await pptx.writeFile({ fileName: `${sanitizeFileName(presentation.title)}.pptx` })
}
