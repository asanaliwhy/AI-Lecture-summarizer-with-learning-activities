export type SlideType =
  | 'title'
  | 'section'
  | 'content'
  | 'two_column'
  | 'quote'
  | 'stats'
  | 'prose'
  | 'summary'

export type SlideTheme = string

export type PresentationStatus = 'pending' | 'processing' | 'completed' | 'failed' | string

export interface SlideColumn {
  label: string
  items: string[]
}

export interface SlideStat {
  value: string
  label: string
  description?: string
}

export interface SlideTakeaway {
  title: string
  description: string
  icon?: string
}

export interface Slide {
  id: string
  index?: number
  type: SlideType
  title?: string
  subtitle?: string | null
  icon?: string | null
  bullets?: string[]
  imageUrl?: string | null
  imageAlt?: string | null
  imageQuery?: string | null
  imagePosition?: 'left' | 'right' | 'top' | null
  body?: string | null
  columns?: SlideColumn[]
  leftColumn?: string[]
  rightColumn?: string[]
  leftLabel?: string | null
  rightLabel?: string | null
  quote?: string | null
  quoteAuthor?: string | null
  stats?: SlideStat[]
  takeaways?: SlideTakeaway[]
  tableHeaders?: string[]
  tableRows?: string[][]
  sectionLabel?: string | null
  notes?: string | null
  speakerNotes?: string | null
  variant?: string | null
}

export interface Presentation {
  id: string
  contentId?: string | null
  title: string
  topic?: string | null
  description?: string
  language?: string
  theme?: SlideTheme
  slideCount: number
  slides: Slide[]
  status: PresentationStatus
  isFavorite?: boolean
  qualityFallback?: boolean
  createdAt?: string
  updatedAt?: string
  lastAccessedAt?: string | null
}

export interface GeneratePresentationConfig {
  content_id: string
  slide_count: number
  language: string
  text_style: 'formal' | 'academic' | 'conversational'
  theme: SlideTheme
  focus_areas: string[]
}

export interface ThemeConfig {
  name: string
  background: string
  backgroundGradient: string
  cardBackground: string
  cardGradient: string
  surface: string
  surfaceStrong: string
  text: string
  subtext: string
  accent: string
  accentSoft: string
  border: string
  sectionBackground: string
  overlay: string
  displayFont: string
  bodyFont: string
}

function normalizeTakeawaysFromBullets(bullets: string[]): SlideTakeaway[] {
  return bullets.map((bullet, index) => ({
    title: `Takeaway ${index + 1}`,
    description: bullet,
    icon: '',
  }))
}

function normalizeColumns(slide: Slide): SlideColumn[] | undefined {
  if (Array.isArray(slide.columns) && slide.columns.length > 0) {
    return slide.columns.map((column) => ({
      label: column.label,
      items: Array.isArray(column.items) ? column.items : [],
    }))
  }

  if ((slide.leftColumn?.length || slide.rightColumn?.length) && slide.type === 'two_column') {
    return [
      {
        label: slide.leftLabel || 'Left Column',
        items: slide.leftColumn || [],
      },
      {
        label: slide.rightLabel || 'Right Column',
        items: slide.rightColumn || [],
      },
    ]
  }

  return undefined
}

export function normalizePresentation(raw: Partial<Presentation> & { id: string }): Presentation {
  const slides = Array.isArray(raw.slides) ? raw.slides : []

  return {
    id: raw.id,
    contentId: raw.contentId ?? null,
    title: raw.title || 'Untitled Presentation',
    topic: raw.topic ?? null,
    description: raw.description,
    language: raw.language || 'en',
    theme: raw.theme || 'navy',
    slideCount: Number(raw.slideCount || slides.length || 0),
    status: raw.status || 'completed',
    isFavorite: Boolean(raw.isFavorite),
    qualityFallback: Boolean(raw.qualityFallback),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    lastAccessedAt: raw.lastAccessedAt ?? null,
    slides: slides.map((slide, index) => {
      const bullets = Array.isArray(slide.bullets) ? slide.bullets : []
      const takeaways = Array.isArray(slide.takeaways) && slide.takeaways.length > 0
        ? slide.takeaways.map((item) => ({
          title: item.title || '',
          description: item.description || '',
          icon: item.icon || '',
        }))
        : slide.type === 'summary' && bullets.length > 0
          ? normalizeTakeawaysFromBullets(bullets)
          : slide.takeaways

      return {
        ...slide,
        id: slide.id || `slide-${slide.index || index + 1}`,
        index: slide.index || index + 1,
        bullets,
        leftColumn: Array.isArray(slide.leftColumn) ? slide.leftColumn : [],
        rightColumn: Array.isArray(slide.rightColumn) ? slide.rightColumn : [],
        imagePosition: slide.imagePosition === 'left' || slide.imagePosition === 'top' ? slide.imagePosition : 'right',
        body: typeof slide.body === 'string' ? slide.body : null,
        columns: normalizeColumns(slide) || [],
        stats: Array.isArray(slide.stats) ? slide.stats : [],
        takeaways: Array.isArray(takeaways) ? takeaways : [],
        tableHeaders: Array.isArray(slide.tableHeaders) ? slide.tableHeaders.filter((h) => typeof h === 'string') : [],
        tableRows: Array.isArray(slide.tableRows)
          ? slide.tableRows
            .filter((row) => Array.isArray(row))
            .map((row) => row.filter((cell) => typeof cell === 'string'))
          : [],
        notes: slide.notes || slide.speakerNotes || null,
        speakerNotes: slide.speakerNotes || slide.notes || null,
        variant: typeof slide.variant === 'string'
          ? slide.variant
          : slide.type === 'summary'
            ? 'summary_icons'
            : null,
      }
    }),
  }
}
