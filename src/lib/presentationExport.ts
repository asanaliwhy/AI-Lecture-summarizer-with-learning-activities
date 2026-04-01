import type { Presentation } from './presentationTypes'

const DEFAULT_SLIDE_WIDTH = 1366
const DEFAULT_SLIDE_HEIGHT = 768
const EXPORT_FRAME_SCALE = 0.92

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
  if (images.length === 0) {
    return
  }

  const loadPromises = images.map((image) => {
    if (image.complete && image.naturalWidth > 0) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      const done = () => resolve()
      image.addEventListener('load', done, { once: true })
      image.addEventListener('error', done, { once: true })
    })
  })

  await Promise.race([
    Promise.all(loadPromises).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

async function waitForFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
  if (fonts?.ready) {
    await fonts.ready.catch(() => undefined)
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function captureSlideImages(
  slideElements: HTMLElement[],
  slideWidth = DEFAULT_SLIDE_WIDTH,
  slideHeight = DEFAULT_SLIDE_HEIGHT,
): Promise<string[]> {
  const html2canvasModule = await import('html2canvas')
  const html2canvas = html2canvasModule.default

  const exportStage = document.createElement('div')
  exportStage.style.position = 'fixed'
  exportStage.style.left = '-20000px'
  exportStage.style.top = '0'
  exportStage.style.width = `${slideWidth}px`
  exportStage.style.height = `${slideHeight}px`
  exportStage.style.overflow = 'hidden'
  exportStage.style.pointerEvents = 'none'
  exportStage.style.zIndex = '-1'
  document.body.appendChild(exportStage)

  const images: string[] = []

  try {
    for (const slideElement of slideElements) {
      const captureRoot = document.createElement('div')
      captureRoot.style.width = `${slideWidth}px`
      captureRoot.style.height = `${slideHeight}px`
      captureRoot.style.overflow = 'hidden'
      captureRoot.style.margin = '0'
      captureRoot.style.padding = '0'
      captureRoot.style.background = 'transparent'

      const clone = slideElement.cloneNode(true) as HTMLElement
      clone.style.width = `${slideWidth}px`
      clone.style.height = `${slideHeight}px`
      clone.style.maxWidth = 'none'
      clone.style.minWidth = '0'
      clone.style.margin = '0'
      clone.style.padding = '0'
      clone.style.transform = 'none'
      clone.style.aspectRatio = `${slideWidth} / ${slideHeight}`

      captureRoot.appendChild(clone)
      exportStage.appendChild(captureRoot)

      await waitForFonts()
      await waitForImages(captureRoot)
      await nextFrame()
      await nextFrame()

      const canvas = await html2canvas(captureRoot, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 20000,
        logging: false,
        backgroundColor: null,
        width: slideWidth,
        height: slideHeight,
        windowWidth: slideWidth,
        windowHeight: slideHeight,
        scrollX: 0,
        scrollY: 0,
      })

      images.push(canvas.toDataURL('image/png', 1))
      exportStage.removeChild(captureRoot)
    }
  } finally {
    document.body.removeChild(exportStage)
  }

  return images
}

export async function exportPresentationPdf(options: PresentationExportOptions) {
  const {
    presentation,
    slideElements,
    slideWidth = DEFAULT_SLIDE_WIDTH,
    slideHeight = DEFAULT_SLIDE_HEIGHT,
  } = options

  if (!slideElements.length) {
    throw new Error('No slides available for export')
  }

  const { jsPDF } = await import('jspdf')
  const images = await captureSlideImages(slideElements, slideWidth, slideHeight)

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [slideWidth, slideHeight],
    compress: true,
  })

  const framedWidth = slideWidth * EXPORT_FRAME_SCALE
  const framedHeight = slideHeight * EXPORT_FRAME_SCALE
  const frameX = (slideWidth - framedWidth) / 2
  const frameY = (slideHeight - framedHeight) / 2

  images.forEach((image, index) => {
    if (index > 0) {
      doc.addPage([slideWidth, slideHeight], 'landscape')
    }
    doc.addImage(image, 'PNG', frameX, frameY, framedWidth, framedHeight, undefined, 'FAST')
  })

  doc.save(`${sanitizeFileName(presentation.title)}.pdf`)
}

export async function exportPresentationPptx(options: PresentationExportOptions) {
  const {
    presentation,
    slideElements,
  } = options

  if (!slideElements.length) {
    throw new Error('No slides available for export')
  }

  const images = await captureSlideImages(slideElements, DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT)
  const pptxModule = await import('pptxgenjs')
  const PptxGenJS = pptxModule.default

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'Lectura'
  pptx.subject = presentation.title
  pptx.title = presentation.title
  pptx.company = 'Lectura'

  const wideSlideWidth = 13.333
  const wideSlideHeight = 7.5
  const framedWidth = wideSlideWidth * EXPORT_FRAME_SCALE
  const framedHeight = wideSlideHeight * EXPORT_FRAME_SCALE
  const frameX = (wideSlideWidth - framedWidth) / 2
  const frameY = (wideSlideHeight - framedHeight) / 2

  images.forEach((image) => {
    const slide = pptx.addSlide()
    slide.addImage({
      data: image,
      x: frameX,
      y: frameY,
      w: framedWidth,
      h: framedHeight,
    })
  })

  await pptx.writeFile({ fileName: `${sanitizeFileName(presentation.title)}.pptx` })
}
