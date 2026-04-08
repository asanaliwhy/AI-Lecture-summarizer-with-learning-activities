import React from 'react'
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Cpu,
  Globe,
  GraduationCap,
  Leaf,
  Lightbulb,
  Network,
  Recycle,
  ShieldCheck,
  Sprout,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Slide, SlideColumn, ThemeConfig } from '../../lib/presentationTypes'

export const PRESENTATION_CANVAS_WIDTH = 1366
export const PRESENTATION_CANVAS_HEIGHT = 768

interface SlideRendererProps {
  slide: Slide
  theme: ThemeConfig
  scale?: number
  isCard?: boolean
}

interface CardBullet {
  label: string
  description: string
}

interface NumberedBullet {
  number: number
  title: string
  description: string
}

interface FeatureTrioItem {
  icon: string
  title: string
  description: string
}

interface ComparisonTableData {
  headers: string[]
  rows: string[][]
}

interface SummaryItem {
  title: string
  description: string
  icon?: string
}

const summaryIconMap: Record<string, LucideIcon> = {
  globe: Globe,
  world: Globe,
  global: Globe,
  impact: BarChart3,
  chart: BarChart3,
  growth: BarChart3,
  platform: Cpu,
  system: Network,
  network: Network,
  technology: Cpu,
  ai: Cpu,
  code: BookOpen,
  education: GraduationCap,
  learning: GraduationCap,
  academic: BookOpen,
  book: BookOpen,
  community: Users,
  users: Users,
  workforce: Briefcase,
  work: Briefcase,
  skills: Briefcase,
  equity: ShieldCheck,
  access: ShieldCheck,
  accessibility: ShieldCheck,
  inclusion: ShieldCheck,
  sustainability: Leaf,
  environment: Leaf,
  nature: Sprout,
  recycle: Recycle,
  energy: Lightbulb,
  innovation: Lightbulb,
  insight: Lightbulb,
}

function toArray(value?: string[] | null): string[] {
  return Array.isArray(value) ? value : []
}

function toColumns(slide: Slide) {
  if (Array.isArray(slide.columns) && slide.columns.length > 0) {
    return slide.columns
  }
  if (slide.type === 'two_column') {
    return [
      {
        label: slide.leftLabel || 'Left',
        items: toArray(slide.leftColumn),
      },
      {
        label: slide.rightLabel || 'Right',
        items: toArray(slide.rightColumn),
      },
    ]
  }
  return []
}

function parseCardBullet(value: string): CardBullet | null {
  const text = String(value || '').trim()
  if (!text) return null

  const canonical = text.match(/^CARD:\s*([\s\S]+?)\s*\|\|\s*([\s\S]+)$/i)
  if (canonical) {
    const label = canonical[1].trim()
    const description = canonical[2].trim()
    if (!label || !description) return null
    return { label, description }
  }

  if (!/^CARD\b/i.test(text) || !text.includes('||')) return null
  const body = text.replace(/^CARD\b\s*/i, '').replace(/^[:#-]\s*/, '').trim()
  const parts = body
    .split('||')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) return null

  const shifted = /^\d+$/.test(parts[0]) && parts.length >= 3 ? parts.slice(1) : parts
  const label = shifted[0]
    .replace(/^(?:CARD\s*)?\d+\s*[:#-]?\s*/i, '')
    .trim()
  const description = shifted.slice(1).join(' ')
    .replace(/^description\s*:\s*/i, '')
    .trim()
  if (!label || !description) return null

  return { label, description }
}

function parseTagsBullet(value: string): string[] {
  const text = String(value || '').trim()
  const match = text.match(/^TAGS:\s*(.+)$/i)
  if (!match) return []

  return match[1]
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function parseNumberedBullet(value: string): NumberedBullet | null {
  const text = String(value || '').trim()
  if (!text) return null
  const match = text.match(/^NUM:\s*(\d{1,2})\s*\|\|\s*([\s\S]+?)\s*\|\|\s*([\s\S]+)$/i)
  if (!match) return null

  const number = Number(match[1])
  const title = match[2].trim()
  const description = match[3].trim()
  if (!Number.isFinite(number) || number <= 0 || !title || !description) return null

  return { number, title, description }
}

function parseTimelineBullet(value: string): NumberedBullet | null {
  const text = String(value || '').trim()
  if (!text) return null

  const match = text.match(/^(?:TIMELINE|MILESTONE):\s*(?:(\d{1,2})\s*\|\|\s*)?([\s\S]+?)\s*\|\|\s*([\s\S]+)$/i)
  if (!match) return null

  const number = Number(match[1] || 0)
  const title = match[2].trim()
  const description = match[3].trim()
  if (!title || !description) return null

  return {
    number: Number.isFinite(number) && number > 0 ? number : 0,
    title,
    description,
  }
}

function parseFlowArrowBullet(value: string): NumberedBullet | null {
  const text = String(value || '').trim()
  if (!text) return null

  const match = text.match(/^(?:FLOW|ARROW|STEP_FLOW):\s*(?:(\d{1,2})\s*\|\|\s*)?([\s\S]+?)\s*\|\|\s*([\s\S]+)$/i)
  if (!match) return null

  const number = Number(match[1] || 0)
  const title = match[2].trim()
  const description = match[3].trim()
  if (!title || !description) return null

  return {
    number: Number.isFinite(number) && number > 0 ? number : 0,
    title,
    description,
  }
}

function parseFeatureTrioBullet(value: string): FeatureTrioItem | null {
  const text = String(value || '').trim()
  if (!text) return null

  const featureMatch = text.match(/^FEATURE:\s*([\s\S]+?)\s*\|\|\s*([\s\S]+?)\s*\|\|\s*([\s\S]+)$/i)
  if (featureMatch) {
    const icon = featureMatch[1].trim()
    let title = featureMatch[2].trim()
    let description = featureMatch[3].trim()

    if (/^NUM:\s*\d{1,2}\b/i.test(title)) {
      const parts = description
        .split('||')
        .map((part) => part.trim())
        .filter(Boolean)

      if (parts.length >= 3) {
        title = `${parts[0]} ${parts[1]}`.trim()
        description = parts.slice(2).join(' ').trim()
      } else if (parts.length === 2) {
        title = parts[0]
        description = parts[1]
      }
    }

    title = stripNumericPrefix(title)
      .replace(/^NUM:\s*\d{1,2}\s*/i, '')
      .replace(/\s*\|\|\s*/g, ' ')
      .trim()
    description = stripNumericPrefix(description)
      .replace(/^NUM:\s*\d{1,2}\s*/i, '')
      .replace(/\s*\|\|\s*/g, ' ')
      .trim()

    if (title && description) {
      return {
        icon: icon || inferSummaryIconToken('', title, description),
        title,
        description,
      }
    }
  }

  const card = parseCardBullet(text)
  if (card) {
    return {
      icon: inferSummaryIconToken('', card.label, card.description),
      title: card.label,
      description: card.description,
    }
  }

  return null
}

function parseComparisonHeaderBullet(value: string): string[] | null {
  const text = String(value || '').trim()
  const match = text.match(/^(?:HEADER|TABLE_HEADER):\s*(.+)$/i)
  if (!match) return null

  const cells = match[1]
    .split('||')
    .map((cell) => cell.trim())
    .filter(Boolean)

  return cells.length >= 2 ? cells.slice(0, 3) : null
}

function parseComparisonRowBullet(value: string): string[] | null {
  const text = String(value || '').trim()
  const match = text.match(/^(?:ROW|TABLE_ROW):\s*(.+)$/i)
  if (!match) return null

  const cells = match[1]
    .split('||')
    .map((cell) => cell.trim())
    .filter(Boolean)

  return cells.length >= 2 ? cells.slice(0, 3) : null
}

function buildComparisonTableData(slide: Slide, bullets: string[], columns: SlideColumn[]): ComparisonTableData | null {
  const directHeaders = Array.isArray(slide.tableHeaders)
    ? slide.tableHeaders.map((cell) => String(cell || '').trim()).filter(Boolean)
    : []

  const directRows = Array.isArray(slide.tableRows)
    ? slide.tableRows
      .filter((row) => Array.isArray(row))
      .map((row) => row.map((cell) => String(cell || '').trim()).filter(Boolean))
      .filter((row) => row.length >= 2)
    : []

  let headers = directHeaders.slice(0, 3)
  let rows = directRows.slice(0, 4)

  if (rows.length === 0) {
    for (const bullet of bullets) {
      const parsedHeader = parseComparisonHeaderBullet(bullet)
      if (parsedHeader && headers.length === 0) {
        headers = parsedHeader
        continue
      }

      const parsedRow = parseComparisonRowBullet(bullet)
      if (parsedRow) rows.push(parsedRow)
    }
  }

  if (rows.length === 0 && columns.length >= 2) {
    const leftItems = Array.isArray(columns[0].items) ? columns[0].items : []
    const rightItems = Array.isArray(columns[1].items) ? columns[1].items : []
    const maxRows = Math.min(4, Math.max(leftItems.length, rightItems.length))
    if (maxRows > 0) {
      headers = headers.length > 0 ? headers : [columns[0].label || 'Left', columns[1].label || 'Right']
      rows = Array.from({ length: maxRows }).map((_, idx) => [leftItems[idx] || '', rightItems[idx] || ''])
    }
  }

  if (rows.length === 0) return null

  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 2)
  if (headers.length === 0) {
    headers = columnCount === 3
      ? ['Category', 'Strengths', 'Gaps']
      : ['Option', 'Details']
  }

  if (headers.length < columnCount) {
    for (let i = headers.length; i < columnCount; i++) {
      headers.push(`Column ${i + 1}`)
    }
  }
  headers = headers.slice(0, columnCount)

  rows = rows
    .map((row) => {
      const normalized = row.slice(0, columnCount)
      while (normalized.length < columnCount) normalized.push('')
      return normalized
    })
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .slice(0, 4)

  if (rows.length === 0) return null

  return { headers, rows }
}

function guessNumberedBulletsFromLongText(values: string[]): NumberedBullet[] {
  if (values.length < 3 || values.length > 5) return []
  const allLong = values.every((value) => value.trim().split(/\s+/).length >= 6)
  if (!allLong) return []

  return values.map((value, index) => {
    const normalized = stripNumericPrefix(value)
    const words = normalized.split(/\s+/).filter(Boolean)
    const title = words.slice(0, 5).join(' ')
    const description = words.slice(5).join(' ') || normalized
    return {
      number: index + 1,
      title,
      description,
    }
  })
}

function getImagePosition(slide: Slide, allowTop = false): 'left' | 'right' | 'top' {
  if (slide.imagePosition === 'left') return 'left'
  if (slide.imagePosition === 'top' && allowTop) return 'top'
  return 'right'
}

function stripNumericPrefix(value: string): string {
  return String(value || '')
    .replace(/^(?:CARD:|NUM:|TIMELINE:|FLOW:|FEATURE:|MILESTONE:|HEADER:|ROW:)?\s*(?:\d+\.?)?\s*\|\|?\s*/i, '')
    .replace(/^(?:\s*(?:key\s*)?(?:point|takeaway|insight|step|item)\s*\d+\s*[:.)-]?\s*)/i, '')
    .replace(/^(?:\s*(?:\(?\d{1,2}\)?|[ivxlcdm]{1,5})\s*(?:[).:-]|-\s)\s*|\s*[-*•]+\s*)/i, '')
    .trim()
}

function isStubSummaryTitle(value: string): boolean {
  return /^(?:takeaway|point|key\s*point|item|insight)\s*\d+$/i.test(String(value || '').trim())
}

function inferSummaryIconToken(icon: string | undefined, title: string, description: string): string {
  const explicit = String(icon || '').trim()
  if (explicit) return explicit

  const text = `${title} ${description}`.toLowerCase()
  if (/(global|world|international|planet)/.test(text)) return 'globe'
  if (/(impact|result|outcome|growth|metric|performance)/.test(text)) return 'impact'
  if (/(platform|software|open-source|opensource|tool|system|infrastructure)/.test(text)) return 'platform'
  if (/(network|connection|ecosystem|integration)/.test(text)) return 'network'
  if (/(education|learning|student|teacher|course|study)/.test(text)) return 'education'
  if (/(community|people|team|user|audience|stakeholder)/.test(text)) return 'community'
  if (/(workforce|career|employment|skill|development)/.test(text)) return 'workforce'
  if (/(equity|access|accessibility|inclusion|fair|justice|safety|trust|security)/.test(text)) return 'equity'
  if (/(environment|nature|forest|green|climate|sustainability|water)/.test(text)) return 'environment'
  if (/(recycle|waste|reuse|circular)/.test(text)) return 'recycle'
  if (/(innovation|idea|insight|strategy|solution|future)/.test(text)) return 'innovation'
  return 'insight'
}

function isEmojiLike(value: string): boolean {
  const text = String(value || '').trim()
  return /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(text)
}

function summaryIconComponent(token: string): LucideIcon {
  const normalized = String(token || '').trim().toLowerCase()
  if (normalized in summaryIconMap) return summaryIconMap[normalized]
  return summaryIconMap[inferSummaryIconToken('', normalized, '')] || Lightbulb
}

function normalizeSummaryItems(slide: Slide, bullets: string[]): SummaryItem[] {
  if (Array.isArray(slide.takeaways) && slide.takeaways.length > 0) {
    return slide.takeaways
      .map((item): SummaryItem | null => {
        const cleanTitle = stripNumericPrefix(item.title || '').trim()
        const cleanDescription = stripNumericPrefix(item.description || '').trim()

        if (!cleanTitle && !cleanDescription) return null
        if (!cleanDescription) {
          return {
            title: '',
            description: cleanTitle,
            icon: inferSummaryIconToken(item.icon, cleanTitle, ''),
          }
        }

        const shouldDropTitle = isStubSummaryTitle(cleanTitle) || cleanTitle.toLowerCase() === cleanDescription.toLowerCase()
        return {
          title: shouldDropTitle ? '' : cleanTitle,
          description: cleanDescription,
          icon: inferSummaryIconToken(item.icon, cleanTitle, cleanDescription),
        }
      })
      .filter((item): item is SummaryItem => Boolean(item && item.description))
  }

  return bullets
    .map((bullet) => stripNumericPrefix(bullet))
    .filter(Boolean)
    .filter((b) => !isStubSummaryTitle(b))
    .map((raw) => {
      const colonIdx = raw.indexOf(':')
      if (colonIdx > 0 && colonIdx < 30) {
        const title = raw.slice(0, colonIdx).trim()
        const description = raw.slice(colonIdx + 1).trim()
        if (title && description) return { title, description, icon: inferSummaryIconToken('', title, description) }
      }
      return { title: '', description: raw, icon: inferSummaryIconToken('', '', raw) }
    })
}

function statsGridColumns(count: number): string {
  if (count <= 1) return '1fr'
  if (count === 2) return 'repeat(2, 1fr)'
  if (count === 3) return 'repeat(3, 1fr)'
  if (count === 4) return 'repeat(2, 1fr)'
  return 'repeat(3, 1fr)'
}

function summaryIconTone(token: string, theme: ThemeConfig): { background: string; border: string } {
  const normalized = inferSummaryIconToken(token, '', '')
  if (normalized === 'environment' || normalized === 'recycle') {
    return { background: `${theme.accentSoft}2a`, border: `${theme.accent}50` }
  }
  if (normalized === 'platform' || normalized === 'network' || normalized === 'education') {
    return { background: `${theme.surfaceStrong}66`, border: `${theme.border}` }
  }
  return { background: `${theme.accent}1f`, border: `${theme.accent}4a` }
}

export function SlideRenderer({ slide, theme, scale = 1, isCard = false }: SlideRendererProps) {
  const s = (px: number) => px * scale
  const fs = (px: number) => `${px * scale}px`

  const columns = toColumns(slide)
  const bullets = toArray(slide.bullets)
  const stats = Array.isArray(slide.stats) ? slide.stats : []
  const summaryItems = normalizeSummaryItems(slide, bullets)

  const hasImage = Boolean(slide.imageUrl)
  const hasImageURL = typeof slide.imageUrl === 'string' && /^https?:\/\//i.test(slide.imageUrl)
  const renderSummaryIcon = (item: SummaryItem) => {
    const token = inferSummaryIconToken(item.icon, item.title, item.description)
    const tone = summaryIconTone(token, theme)

    if (isEmojiLike(token)) {
      return (
        <div
          style={{
            width: s(48),
            height: s(48),
            borderRadius: s(14),
            border: `1px solid ${tone.border}`,
            background: tone.background,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fs(24),
          }}
        >
          {token}
        </div>
      )
    }

    const Icon = summaryIconComponent(token)
    return (
      <div
        style={{
          width: s(48),
          height: s(48),
          borderRadius: s(14),
          border: `1px solid ${tone.border}`,
          background: tone.background,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.accent,
        }}
      >
        <Icon size={s(24)} strokeWidth={2.2} />
      </div>
    )
  }

  const renderFeatureIcon = (token: string, title: string, description: string) => {
    const normalized = inferSummaryIconToken(token, title, description)
    const tone = summaryIconTone(normalized, theme)

    if (isEmojiLike(normalized)) {
      return (
        <div
          style={{
            width: s(128),
            height: s(128),
            borderRadius: '50%',
            border: `1px solid ${tone.border}`,
            background: tone.background,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fs(54),
          }}
        >
          {normalized}
        </div>
      )
    }

    const Icon = summaryIconComponent(normalized)
    return (
      <div
        style={{
          width: s(128),
          height: s(128),
          borderRadius: '50%',
          border: `1px solid ${tone.border}`,
          background: tone.background,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.accent,
        }}
      >
        <Icon size={s(60)} strokeWidth={2} />
      </div>
    )
  }

  const renderComparisonTable = (data: ComparisonTableData) => {
    const rowMinHeight = isCard
      ? undefined
      : s(Math.max(44, Math.min(92, Math.floor(420 / Math.max(1, data.rows.length)))))

    return (
      <div
        style={{
          ...panelCard,
          padding: `${s(8)}px ${s(10)}px ${s(10)}px`,
          overflow: 'hidden',
          height: isCard ? undefined : '100%',
        }}
      >
        <div
          style={{
            borderRadius: s(18),
            overflow: 'hidden',
            height: isCard ? undefined : '100%',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              tableLayout: 'fixed',
              color: theme.text,
            }}
          >
            <thead>
              <tr>
                {data.headers.map((header, index) => (
                  <th
                    key={`${header}-${index}`}
                    style={{
                      textAlign: 'left',
                      padding: `${s(11)}px ${s(12)}px`,
                      fontFamily: theme.displayFont,
                      fontSize: fs(30),
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                      borderBottom: `1px solid ${theme.border}`,
                      borderRight: index < data.headers.length - 1 ? `1px solid ${theme.border}` : undefined,
                      background: `${theme.surface}c0`,
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, colIndex) => (
                    <td
                      key={`cell-${rowIndex}-${colIndex}`}
                      style={{
                        verticalAlign: 'top',
                        minHeight: rowMinHeight,
                        padding: `${s(12)}px ${s(12)}px`,
                        fontSize: fs(24),
                        lineHeight: 1.45,
                        color: theme.subtext,
                        borderBottom: rowIndex < data.rows.length - 1 ? `1px solid ${theme.border}` : undefined,
                        borderRight: colIndex < data.headers.length - 1 ? `1px solid ${theme.border}` : undefined,
                        background: rowIndex % 2 === 0 ? `${theme.surface}7d` : `${theme.surfaceStrong}4a`,
                        borderBottomLeftRadius: rowIndex === data.rows.length-1 && colIndex === 0 ? s(18) : undefined,
                        borderBottomRightRadius: rowIndex === data.rows.length-1 && colIndex === data.headers.length-1 ? s(18) : undefined,
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const layoutPadding = isCard
    ? { padding: `${s(34)}px ${s(40)}px` }
    : { padding: `${s(44)}px ${s(52)}px` }

  const baseStyle: React.CSSProperties = {
    width: '100%',
    minHeight: isCard ? undefined : '100%',
    height: isCard ? 'auto' : '100%',
    background: theme.backgroundGradient,
    color: theme.text,
    fontFamily: theme.bodyFont,
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    WebkitFontSmoothing: 'antialiased',
  }

  const panelCard: React.CSSProperties = {
    borderRadius: s(24),
    border: `1px solid ${theme.border}`,
    background: theme.cardGradient,
    boxShadow: `0 ${s(12)}px ${s(34)}px rgba(7, 11, 19, 0.16)`,
    overflow: 'hidden',
    minWidth: 0,
  }

  const renderDecor = () => (
    <>
      <div
        style={{
          position: 'absolute',
          top: s(-160),
          right: s(-90),
          width: s(360),
          height: s(360),
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.accent}2b 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: s(-200),
          bottom: s(-230),
          width: s(520),
          height: s(520),
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.accentSoft}20 0%, transparent 72%)`,
          pointerEvents: 'none',
        }}
      />
    </>
  )

  const renderImagePanel = (options: React.CSSProperties = {}, showIndexBadge = false) => {
    if (!hasImage) return null

    return (
      <div
        style={{
          ...panelCard,
          position: 'relative',
          background: theme.surfaceStrong,
          ...options,
        }}
      >
        {hasImageURL ? (
          <>
            <img
              src={slide.imageUrl || ''}
              alt={slide.imageAlt || slide.title || 'Slide image'}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                imageRendering: 'auto',
              }}
            />
          </>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              background: `linear-gradient(135deg, ${theme.surfaceStrong}, ${theme.surface})`,
              color: theme.accentSoft,
              fontSize: fs(92),
            }}
          >
            {slide.imageUrl}
          </div>
        )}

        {showIndexBadge && (
          <div
            style={{
              position: 'absolute',
              right: s(18),
              top: s(18),
              width: s(42),
              height: s(42),
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${theme.accentSoft}, ${theme.accent})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.surfaceStrong,
              fontSize: fs(15),
              fontWeight: 800,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
              transform: `translateY(${s(0.5)}px)`,
            }}
          >
            {slide.index || 1}
          </div>
        )}
      </div>
    )
  }

  const textOverline = (label: string) => (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: s(10),
        borderRadius: s(999),
        border: `1px solid ${theme.border}`,
        background: `${theme.surface}d6`,
        padding: `${s(8)}px ${s(14)}px`,
        color: theme.accent,
        fontSize: fs(18),
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: s(6),
          height: s(6),
          borderRadius: '50%',
          background: theme.accent,
        }}
      />
      {label}
    </div>
  )

  const resolvedSlideType: Slide['type'] =
    slide.type === 'title' ||
    slide.type === 'section' ||
    slide.type === 'content' ||
    slide.type === 'two_column' ||
    slide.type === 'stats' ||
    slide.type === 'prose' ||
    slide.type === 'summary'
      ? slide.type
      : 'content'

  switch (resolvedSlideType) {
    case 'title': {
      const imagePosition = getImagePosition(slide)
      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: 'grid',
              gridTemplateColumns: hasImage ? '49% 51%' : '1fr',
              gap: s(24),
              alignItems: 'stretch',
            }}
          >
            {hasImage && imagePosition === 'left' && renderImagePanel({ minHeight: s(618) })}

            <div
              style={{
                ...panelCard,
                padding: `${s(34)}px ${s(34)}px`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              {slide.sectionLabel ? textOverline(slide.sectionLabel) : null}
              <h1
                style={{
                  margin: `${s(20)}px 0 0`,
                  fontFamily: theme.displayFont,
                  fontSize: fs(hasImage ? 60 : 70),
                  lineHeight: 1.02,
                  letterSpacing: '-0.032em',
                  color: theme.text,
                }}
              >
                {slide.title}
              </h1>
              {slide.subtitle && (
                <p
                  style={{
                    margin: `${s(22)}px 0 0`,
                    color: theme.subtext,
                    fontSize: fs(19),
                    lineHeight: 1.42,
                    maxWidth: s(600),
                  }}
                >
                  {slide.subtitle}
                </p>
              )}
            </div>

            {hasImage && imagePosition !== 'left' && renderImagePanel({ minHeight: s(618) })}
          </div>
        </div>
      )
    }

    case 'section': {
      const imagePosition = getImagePosition(slide, true)
      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: 'grid',
              gridTemplateColumns: hasImage && imagePosition !== 'top' ? '47% 53%' : '1fr',
              gridTemplateRows: hasImage && imagePosition === 'top' ? 'auto 1fr' : undefined,
              gap: s(24),
              alignItems: 'stretch',
            }}
          >
            {hasImage && imagePosition === 'top' && (
              <div style={{ gridColumn: '1 / -1' }}>
                {renderImagePanel({ height: s(260) })}
              </div>
            )}

            {hasImage && imagePosition === 'left' && renderImagePanel({ minHeight: s(618) })}

            <div
              style={{
                ...panelCard,
                padding: `${s(34)}px ${s(34)}px`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                flex: 1,
                gridColumn: hasImage && imagePosition === 'top' ? '1 / -1' : undefined,
              }}
            >
              {slide.sectionLabel ? textOverline(slide.sectionLabel) : null}
              <h2
                style={{
                  margin: `${s(22)}px 0 0`,
                  fontFamily: theme.displayFont,
                  fontSize: fs(56),
                  lineHeight: 1.03,
                  letterSpacing: '-0.032em',
                }}
              >
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p
                  style={{
                    marginTop: s(20),
                    color: theme.subtext,
                    fontSize: fs(20),
                    lineHeight: 1.42,
                  }}
                >
                  {slide.subtitle}
                </p>
              )}
            </div>

            {hasImage && imagePosition === 'right' && renderImagePanel({ minHeight: s(618) })}
          </div>
        </div>
      )
    }

    case 'content': {
      const imagePosition = getImagePosition(slide)
      const parsedNumberedBullets = bullets
        .map(parseNumberedBullet)
        .filter((item): item is NumberedBullet => item !== null)
        .sort((a, b) => a.number - b.number)
      const parsedTimelineBullets = bullets
        .map(parseTimelineBullet)
        .filter((item): item is NumberedBullet => item !== null)
      const parsedFlowArrowBullets = bullets
        .map(parseFlowArrowBullet)
        .filter((item): item is NumberedBullet => item !== null)
      const cardBullets = bullets.map(parseCardBullet).filter((item): item is CardBullet => item !== null).slice(0, 3)
      const tags = bullets.flatMap(parseTagsBullet)
      const nonStructuredBullets = bullets.filter((bullet) => {
        const trimmed = bullet.trim()
        return !parseCardBullet(trimmed) && !parseNumberedBullet(trimmed) && !parseTimelineBullet(trimmed) && !parseFlowArrowBullet(trimmed) && !/^TAGS:\s*/i.test(trimmed)
      })
      const inferredNumberedBullets = parsedNumberedBullets.length === 0
        ? guessNumberedBulletsFromLongText(nonStructuredBullets)
        : []
      const numberedBullets = (parsedNumberedBullets.length > 0 ? parsedNumberedBullets : inferredNumberedBullets).slice(0, 5)
      const useNumberedStack = numberedBullets.length >= 3
      const useCardGrid = !useNumberedStack && cardBullets.length >= 2
      const nonCardBullets = useCardGrid || useNumberedStack 
        ? nonStructuredBullets 
        : bullets
            .filter(b => !/^TAGS:\s*/i.test(b))
            .map(b => b.replace(/^(?:CARD:\s*|NUM:\s*\d*(?:\.?)?\|\|?|TIMELINE:\s*\d*(?:\.?)?\|\|?|FLOW:\s*\d*(?:\.?)?\|\|?|FEATURE|MILESTONE|ROW|HEADER):\s*/i, ''))
      const variant = String(slide.variant || '').toLowerCase()
      const timelineBullets = parsedTimelineBullets.length > 0
        ? (parsedTimelineBullets.every((item) => item.number > 0)
          ? [...parsedTimelineBullets].sort((a, b) => a.number - b.number)
          : parsedTimelineBullets)
        : []
      const fallbackTimelineBullets = variant === 'timeline' && timelineBullets.length === 0
        ? (numberedBullets.length > 0
          ? numberedBullets
          : nonStructuredBullets
            .map((raw, index) => {
              const cleaned = stripNumericPrefix(raw)
              const words = cleaned.split(/\s+/).filter(Boolean)
              if (words.length < 4) return null
              const title = words.slice(0, Math.min(4, words.length)).join(' ')
              const description = words.slice(4).join(' ') || cleaned
              if (!title || !description) return null
              return { number: index + 1, title, description }
            })
            .filter((item): item is NumberedBullet => item !== null))
        : []
      const timelineItems = (timelineBullets.length > 0 ? timelineBullets : fallbackTimelineBullets)
        .slice(0, 5)
        .map((item, index) => ({
          ...item,
          number: item.number > 0 ? item.number : index + 1,
        }))
      const flowArrowBullets = parsedFlowArrowBullets.length > 0
        ? (parsedFlowArrowBullets.every((item) => item.number > 0)
          ? [...parsedFlowArrowBullets].sort((a, b) => a.number - b.number)
          : parsedFlowArrowBullets)
        : []
      const fallbackFlowArrowBullets = variant === 'flow_arrows' && flowArrowBullets.length === 0
        ? (numberedBullets.length > 0
          ? numberedBullets
          : nonStructuredBullets
            .map((raw, index) => {
              const cleaned = stripNumericPrefix(raw)
              const words = cleaned.split(/\s+/).filter(Boolean)
              if (words.length < 4) return null
              const title = words.slice(0, Math.min(4, words.length)).join(' ')
              const description = words.slice(4).join(' ') || cleaned
              if (!title || !description) return null
              return { number: index + 1, title, description }
            })
            .filter((item): item is NumberedBullet => item !== null))
        : []
      const flowArrowItems = (flowArrowBullets.length > 0 ? flowArrowBullets : fallbackFlowArrowBullets)
        .slice(0, 4)
        .map((item, index) => ({
          ...item,
          number: item.number > 0 ? item.number : index + 1,
        }))
      const featureTrioItems = bullets
        .map(parseFeatureTrioBullet)
        .filter((item): item is FeatureTrioItem => item !== null)
        .slice(0, 3)
      const comparisonTable = buildComparisonTableData(slide, bullets, columns)

      if (variant === 'comparison_table' && comparisonTable) {
        return (
          <div style={baseStyle}>
            {renderDecor()}

            <div
              style={{
                ...layoutPadding,
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: s(16),
                flex: 1,
                minHeight: 0,
              }}
            >
              <div
                style={{
                  ...panelCard,
                  padding: `${s(20)}px ${s(24)}px`,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(56),
                    lineHeight: 1.05,
                    letterSpacing: '-0.026em',
                    fontWeight: 700,
                  }}
                >
                  {slide.title}
                </h2>
                {slide.subtitle && (
                  <p style={{ marginTop: s(10), color: theme.subtext, fontSize: fs(19), lineHeight: 1.42 }}>
                    {slide.subtitle}
                  </p>
                )}
              </div>

              <div style={{ flex: 1, minHeight: 0 }}>
                {renderComparisonTable(comparisonTable)}
              </div>
            </div>
          </div>
        )
      }

      if ((variant === 'timeline' || timelineBullets.length >= 3) && timelineItems.length >= 3) {
        return (
          <div style={baseStyle}>
            {renderDecor()}

            <div
              style={{
                ...layoutPadding,
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: fs(56),
                  lineHeight: 1.04,
                  letterSpacing: '-0.03em',
                  fontWeight: 700,
                }}
              >
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p
                  style={{
                    marginTop: s(12),
                    color: theme.subtext,
                    fontSize: fs(19),
                    lineHeight: 1.4,
                  }}
                >
                  {slide.subtitle}
                </p>
              )}

              <div
                style={{
                  marginTop: slide.subtitle ? s(62) : s(82),
                  minHeight: 0,
                  position: 'relative',
                  padding: `${s(6)}px 0 ${s(6)}px`,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: s(4),
                    bottom: s(4),
                    width: s(2),
                    transform: 'translateX(-50%)',
                    background: `linear-gradient(180deg, ${theme.border}, ${theme.accent}8a, ${theme.border})`,
                    opacity: 0.9,
                  }}
                />

                <div
                  style={{
                    position: 'relative',
                    height: 'auto',
                    display: 'grid',
                    gap: s(2),
                    gridTemplateRows: `repeat(${timelineItems.length}, minmax(${s(66)}px, auto))`,
                  }}
                >
                  {timelineItems.map((item, index) => {
                    const isLeft = index % 2 === 0

                    return (
                      <div
                        key={`${item.number}-${item.title}-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto 1fr',
                          alignItems: 'center',
                          columnGap: s(14),
                          minHeight: s(66),
                        }}
                      >
                        {isLeft ? (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr auto',
                              alignItems: 'center',
                              gap: s(14),
                              minWidth: 0,
                            }}
                          >
                            <div style={{ minWidth: 0, textAlign: 'right' }}>
                              <div
                                style={{
                                  fontFamily: theme.displayFont,
                                  fontSize: fs(32),
                                  lineHeight: 1.12,
                                  letterSpacing: '-0.02em',
                                  fontWeight: 650,
                                  color: theme.text,
                                }}
                              >
                                {item.title}
                              </div>
                              <p
                                style={{
                                  margin: `${s(8)}px 0 0`,
                                  fontSize: fs(19),
                                  lineHeight: 1.38,
                                  color: theme.subtext,
                                }}
                              >
                                {item.description}
                              </p>
                            </div>
                            <span
                              style={{
                                width: s(58),
                                height: s(2),
                                background: `${theme.border}`,
                                opacity: 0.9,
                              }}
                            />
                          </div>
                        ) : <div />}

                        <div style={{ width: s(68), display: 'flex', justifyContent: 'center', zIndex: 1 }}>
                          <div
                            style={{
                              minWidth: s(42),
                              height: s(42),
                              borderRadius: s(8),
                              background: `${theme.surfaceStrong}f0`,
                              border: `1px solid ${theme.border}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: theme.displayFont,
                              fontSize: fs(25),
                              lineHeight: 1,
                              fontWeight: 700,
                              color: theme.text,
                              padding: `0 ${s(8)}px`,
                            }}
                          >
                            {item.number}
                          </div>
                        </div>

                        {!isLeft ? (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'auto 1fr',
                              alignItems: 'center',
                              gap: s(14),
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                width: s(58),
                                height: s(2),
                                background: `${theme.border}`,
                                opacity: 0.9,
                              }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontFamily: theme.displayFont,
                                  fontSize: fs(32),
                                  lineHeight: 1.12,
                                  letterSpacing: '-0.02em',
                                  fontWeight: 650,
                                  color: theme.text,
                                }}
                              >
                                {item.title}
                              </div>
                              <p
                                style={{
                                  margin: `${s(8)}px 0 0`,
                                  fontSize: fs(19),
                                  lineHeight: 1.38,
                                  color: theme.subtext,
                                }}
                              >
                                {item.description}
                              </p>
                            </div>
                          </div>
                        ) : <div />}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      }

      if ((variant === 'flow_arrows' || flowArrowBullets.length >= 3) && flowArrowItems.length >= 3) {
        const arrowCount = Math.min(3, flowArrowItems.length)
        const arrows = flowArrowItems.slice(0, arrowCount)
        const flowStartOffset = slide.subtitle ? s(170) : s(174)

        return (
          <div style={baseStyle}>
            {renderDecor()}

            <div
              style={{
                ...layoutPadding,
                zIndex: 2,  
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: fs(56),
                  lineHeight: 1.04,
                  letterSpacing: '-0.03em',
                  fontWeight: 700,
                }}
              >
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p
                  style={{
                    marginTop: s(12),
                    color: theme.subtext,
                    fontSize: fs(19),
                    lineHeight: 1.4,
                  }}
                >
                  {slide.subtitle}
                </p>
              )}

              <div
                style={{
                  marginTop: flowStartOffset,
                  display: 'grid',
                  gap: s(20),
                  alignContent: 'start',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${arrowCount}, minmax(0, 1fr))`,
                    gap: s(12),
                  }}
                >
                  {arrows.map((item, index) => (
                    <div
                      key={`flow-arrow-${item.number}-${index}`}
                      style={{
                        height: s(72),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        clipPath: 'polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%, 6% 50%)',
                        background: index % 2 === 0 ? `${theme.surfaceStrong}dd` : `${theme.surface}dd`,
                        boxShadow: `inset 0 0 0 1px ${theme.border}`,
                        color: theme.text,
                        fontFamily: theme.displayFont,
                        fontSize: fs(44),
                        fontWeight: 700,
                        lineHeight: 1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {item.number}
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${arrowCount}, minmax(0, 1fr))`,
                    gap: s(16),
                    alignItems: 'start',
                  }}
                >
                  {arrows.map((item, index) => (
                    <div key={`flow-text-${item.number}-${index}`} style={{ minWidth: 0, padding: `0 ${s(4)}px` }}>
                      <div
                        style={{
                          fontFamily: theme.displayFont,
                          fontSize: fs(40),
                          lineHeight: 1.12,
                          letterSpacing: '-0.018em',
                          fontWeight: 650,
                          color: theme.text,
                        }}
                      >
                        {item.title}
                      </div>
                      <p
                        style={{
                          margin: `${s(10)}px 0 0`,
                          color: theme.subtext,
                          fontSize: fs(18),
                          lineHeight: 1.45,
                        }}
                      >
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      }

      if (variant === 'feature_trio' && featureTrioItems.length >= 3) {
        const trioStartOffset = slide.subtitle ? s(192) : s(214)

        return (
          <div style={baseStyle}>
            {renderDecor()}

            <div
              style={{
                ...layoutPadding,
                zIndex: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: s(22),
                flex: 1,
                minHeight: 0,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(56),
                    lineHeight: 1.05,
                    letterSpacing: '-0.03em',
                    fontWeight: 700,
                  }}
                >
                  {slide.title}
                </h2>
                {slide.subtitle && (
                  <p style={{ marginTop: s(12), color: theme.subtext, fontSize: fs(18), lineHeight: 1.4 }}>
                    {slide.subtitle}
                  </p>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: s(16),
                  marginTop: trioStartOffset,
                  flex: 1,
                  minHeight: 0,
                }}
              >
                {featureTrioItems.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: s(12) }}>
                      {renderFeatureIcon(item.icon, item.title, item.description)}
                    </div>
                    <div
                      style={{
                        fontFamily: theme.displayFont,
                        fontSize: fs(36),
                        lineHeight: 1.15,
                        letterSpacing: '-0.018em',
                        fontWeight: 650,
                        textAlign: 'center',
                      }}
                    >
                      {item.title}
                    </div>
                    <p
                      style={{
                        margin: `${s(8)}px 0 0`,
                        color: theme.subtext,
                        fontSize: fs(18),
                        lineHeight: 1.5,
                        textAlign: 'center',
                      }}
                    >
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      }



      const titleText = String(slide.title || '')
      const subtitleText = String(slide.subtitle || '')
      const titleWordCount = titleText.trim() ? titleText.trim().split(/\s+/).length : 0
      const subtitleWordCount = subtitleText.trim() ? subtitleText.trim().split(/\s+/).length : 0
      const numDescriptionWords = numberedBullets.reduce(
        (sum, item) => sum + item.description.split(/\s+/).length, 0
      )
      const denseContent = nonCardBullets.length >= 5 || numberedBullets.length >= 4 || numDescriptionWords >= 45 || titleWordCount >= 8 || subtitleWordCount >= 16
      const ultraDenseContent = nonCardBullets.length >= 6 || numberedBullets.length >= 5 || numDescriptionWords >= 65 || titleWordCount >= 11 || subtitleWordCount >= 22
      const headingSize = ultraDenseContent ? 40 : denseContent ? 48 : 52
      const subtitleSize = ultraDenseContent ? 16 : denseContent ? 17 : 18
      const bulletFontSize = 13
      const bulletGap = ultraDenseContent ? 8 : 11
      const bulletPaddingY = ultraDenseContent ? 8 : denseContent ? 10 : 11
      const bulletPaddingX = ultraDenseContent ? 10 : 12
      const bulletChipSize = ultraDenseContent ? 28 : 30
      const panelPadding = ultraDenseContent
        ? `${s(16)}px ${s(20)}px ${s(14)}px`
        : denseContent
          ? `${s(22)}px ${s(24)}px ${s(20)}px`
          : `${s(28)}px ${s(28)}px`
      const numTitleSize = ultraDenseContent ? 21 : denseContent ? 22 : 24
      const numDescSize = ultraDenseContent ? 16 : denseContent ? 17 : 18
      const numPaddingY = ultraDenseContent ? 8 : denseContent ? 11 : 14
      const numPaddingX = ultraDenseContent ? 12 : denseContent ? 14 : 16
      const cardTitleSize = ultraDenseContent ? 18 : denseContent ? 20 : 22
      const cardDescSize = ultraDenseContent ? 15 : denseContent ? 16 : 18
      const cardPadding = ultraDenseContent ? 8 : denseContent ? 10 : 12
      const contentTopGap = slide.subtitle
        ? ultraDenseContent
          ? s(12)
          : s(18)
        : ultraDenseContent
          ? s(16)
          : s(24)

      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              display: 'grid',
                gridTemplateColumns: hasImage
                  ? imagePosition === 'left'
                    ? (useCardGrid ? '44% 56%' : '46% 54%')
                    : (useCardGrid ? '54% 46%' : '50% 50%')
                  : '1fr',
              gap: s(22),
              alignItems: 'stretch',
              flex: 1,
              minHeight: 0,
            }}
          >
            {hasImage && imagePosition === 'left' && renderImagePanel({ minHeight: s(622) })}

            <div
              style={{
                ...panelCard,
                padding: panelPadding,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                minHeight: 0,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: fs(headingSize),
                  fontWeight: 700,
                  lineHeight: 1.06,
                  letterSpacing: '-0.028em',
                }}
              >
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p
                  style={{
                    margin: `${ultraDenseContent ? s(6) : s(12)}px 0 ${ultraDenseContent ? s(10) : s(14)}px`,
                    color: theme.subtext,
                    fontSize: fs(subtitleSize),
                    lineHeight: 1.36,
                  }}
                >
                  {slide.subtitle}
                </p>
              )}

              {useNumberedStack ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: ultraDenseContent ? s(22) : s(14), marginTop: contentTopGap, flex: 1, minHeight: 0 }}>
                  {numberedBullets.map((item) => (
                    <div
                      key={`${item.number}-${item.title}`}
                      style={{
                        borderRadius: s(14),
                        border: `1px solid ${theme.border}`,
                        background: `${theme.surface}d9`,
                        padding: `${s(numPaddingY)}px ${s(numPaddingX)}px`,
                        display: 'grid',
                        gridTemplateColumns: `${s(62)}px 1fr`,
                        gap: s(12),
                        alignItems: 'start',
                        minHeight: s(72),
                        flex: '0 1 auto',
                      }}
                    >
                      <div
                        style={{
                          width: s(54),
                          height: s(54),
                          borderRadius: s(14),
                          display: 'block',
                          background: `linear-gradient(135deg, ${theme.accentSoft}, ${theme.accent})`,
                          color: theme.surfaceStrong,
                          fontFamily: theme.displayFont,
                          fontSize: fs(31),
                          fontWeight: 700,
                          position: 'relative',
                        }}
                      >
                        <span style={{ 
                          position: 'absolute', 
                          top: '50%', 
                          left: '50%', 
                          transform: 'translate(-50%, -50%)',
                          lineHeight: 1
                        }}>
                          {item.number}
                        </span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: theme.displayFont,
                            fontSize: fs(numTitleSize),
                            fontWeight: 600,
                            lineHeight: 1.22,
                            color: theme.text,
                          }}
                        >
                          {item.title}
                        </div>
                        <div
                          style={{
                            marginTop: s(5),
                            fontSize: fs(numDescSize),
                            fontWeight: 400,
                            lineHeight: ultraDenseContent ? 1.35 : 1.4,
                            color: theme.subtext,
                          }}
                        >
                          {item.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : useCardGrid ? (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gridAutoRows: '1fr',
                      gap: s(10),
                      marginTop: contentTopGap,
                      flex: 1,
                      alignContent: 'stretch',
                    }}
                  >
                    {cardBullets.map((card, index) => (
                      <div
                        key={index}
                        style={{
                          borderRadius: s(14),
                          border: `1px solid ${theme.border}`,
                          background: `${theme.surface}cf`,
                          padding: `${s(cardPadding)}px ${s(cardPadding)}px`,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          height: '100%',
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: theme.displayFont,
                            fontSize: fs(cardTitleSize),
                            fontWeight: 600,
                            lineHeight: 1.15,
                            letterSpacing: '-0.015em',
                            color: theme.text,
                          }}
                        >
                          {card.label}
                        </div>
                        <div
                          style={{
                            marginTop: s(6),
                            fontSize: fs(cardDescSize),
                            fontWeight: 400,
                            lineHeight: ultraDenseContent ? 1.4 : 1.5,
                            color: theme.subtext,
                          }}
                        >
                          {card.description}
                        </div>
                      </div>
                    ))}
                  </div>

                  {tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: s(6), marginTop: s(10) }}>
                      {tags.map((tag, index) => (
                        <span
                          key={`${tag}-${index}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            borderRadius: s(999),
                            border: `1px solid ${theme.border}`,
                            background: `${theme.surface}cc`,
                            padding: `${s(4)}px ${s(9)}px`,
                            fontSize: fs(11),
                            color: theme.subtext,
                            letterSpacing: '0.03em',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'grid', gap: s(bulletGap), marginTop: contentTopGap, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {nonCardBullets.slice(0, 6).map((bullet, index) => (
                    <div
                      key={index}
                      style={{
                        borderRadius: s(14),
                        border: `1px solid ${theme.border}`,
                        background: `${theme.surface}cf`,
                        padding: `${s(bulletPaddingY)}px ${s(bulletPaddingX)}px`,
                        display: 'grid',
                        gridTemplateColumns: `${s(bulletChipSize)}px 1fr`,
                        gap: s(10),
                        alignItems: 'start',
                      }}
                    >
                      <span
                        style={{
                          width: s(bulletChipSize),
                          height: s(bulletChipSize),
                          borderRadius: '50%',
                          display: 'inline-block',
                          color: theme.surfaceStrong,
                          background: `linear-gradient(135deg, ${theme.accentSoft}, ${theme.accent})`,
                          position: 'relative',
                        }}
                      >
                        <span style={{ 
                          position: 'absolute', 
                          top: '50%', 
                          left: '50%', 
                          transform: 'translate(-50%, -50%)',
                          fontSize: fs(12),
                          fontWeight: 800,
                          lineHeight: 1,
                          fontVariantNumeric: 'tabular-nums',
                          fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
                        }}>
                          {index + 1}
                        </span>
                      </span>
                      <span style={{ fontSize: fs(bulletFontSize), lineHeight: 1.36 }}>{stripNumericPrefix(bullet)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {hasImage && imagePosition !== 'left' && renderImagePanel({ minHeight: s(622) })}
          </div>
        </div>
      )
    }

    case 'two_column': {
      const imagePosition = getImagePosition(slide)

      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: 'grid',
              gridTemplateColumns: hasImage ? '60% 40%' : '1fr',
              gap: s(20),
              alignItems: 'stretch',
              minHeight: 0,
            }}
          >
            {hasImage && imagePosition === 'left' && renderImagePanel({ minHeight: s(622) })}

            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
              <div
                style={{
                  ...panelCard,
                  padding: `${s(20)}px ${s(24)}px`,
                  marginBottom: s(14),
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(50),
                    fontWeight: 700,
                    lineHeight: 1.06,
                    letterSpacing: '-0.026em',
                  }}
                >
                  {slide.title}
                </h2>
                {slide.subtitle && <p style={{ marginTop: s(8), color: theme.subtext, fontSize: fs(19) }}>{slide.subtitle}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: s(14), flex: 1, minHeight: 0 }}>
                {columns.slice(0, 2).map((col, index) => (
                  <div
                    key={index}
                    style={{
                      ...panelCard,
                      padding: `${s(20)}px ${s(20)}px`,
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                    }}
                  >
                    {textOverline(col.label)}
                    <div
                      style={{
                        marginTop: s(20),
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: s(9),
                        justifyContent: 'flex-start',
                        minHeight: 0,
                        overflow: 'hidden',
                      }}
                    >
                      {col.items.slice(0, 4).map((item, itemIndex) => (
                        <div
                          key={itemIndex}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `${s(10)}px 1fr`,
                            gap: s(10),
                            fontSize: fs(18),
                            fontWeight: 400,
                            lineHeight: 1.6,
                            color: theme.text,
                          }}
                        >
                          <span
                            style={{
                              width: s(12),
                              height: s(12),
                              borderRadius: '50%',
                              marginTop: s(4),
                              background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentSoft})`,
                            }}
                          />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {hasImage && imagePosition !== 'left' && renderImagePanel({ minHeight: s(622) })}
          </div>
        </div>
      )
    }



    case 'stats': {
      const imagePosition = getImagePosition(slide)
      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: 'grid',
              gridTemplateColumns: hasImage ? '62% 38%' : '1fr',
              gap: s(18),
              alignItems: 'stretch',
            }}
          >
            {hasImage && imagePosition === 'left' && renderImagePanel({ minHeight: s(622) })}

            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div
                style={{
                  ...panelCard,
                  padding: `${s(20)}px ${s(24)}px`,
                  marginBottom: s(14),
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(50),
                    fontWeight: 700,
                    lineHeight: 1.06,
                    letterSpacing: '-0.026em',
                  }}
                >
                  {slide.title}
                </h2>
                {slide.subtitle && <p style={{ marginTop: s(8), color: theme.subtext, fontSize: fs(19) }}>{slide.subtitle}</p>}
              </div>

              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: statsGridColumns(Math.min(stats.length, 6)),
                  gridAutoRows: '1fr',
                  gap: s(12),
                }}
              >
                {stats.slice(0, 6).map((stat, index) => (
                  <div
                    key={index}
                    style={{
                      ...panelCard,
                      padding: `${s(16)}px ${s(14)}px`,
                      textAlign: 'center',
                      display: 'grid',
                      alignContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: theme.displayFont,
                        fontSize: fs(52),
                        color: theme.accent,
                        lineHeight: 1,
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {stat.value}
                    </div>
                    <div
                      style={{
                        marginTop: s(8),
                        fontSize: fs(20),
                        color: theme.subtext,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontWeight: 600,
                      }}
                    >
                      {stat.label}
                    </div>
                    {stat.description && (
                      <div
                        style={{
                          marginTop: s(6),
                          fontSize: fs(19),
                          color: theme.subtext,
                          lineHeight: 1.4,
                          fontWeight: 400,
                        }}
                      >
                        {stat.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {hasImage && imagePosition !== 'left' && renderImagePanel({ minHeight: s(622) })}
          </div>
        </div>
      )
    }

    case 'prose': {
      const imagePosition = getImagePosition(slide, true)
      const proseSource = String(slide.body || '').trim() || bullets.join('. ')
      let paragraphs = proseSource
        .split(/\n+/)
        .map((part) => part.trim())
        .filter(Boolean)

      if (paragraphs.length <= 1) {
        const sentences = proseSource
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => sentence.trim())
          .filter(Boolean)
        if (sentences.length > 1) {
          paragraphs = []
          for (let i = 0; i < sentences.length; i += 2) {
            paragraphs.push(sentences.slice(i, i + 2).join(' '))
          }
        }
      }

      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: 'grid',
              gridTemplateColumns: hasImage && imagePosition !== 'top' ? '48% 52%' : '1fr',
              gridTemplateRows: hasImage && imagePosition === 'top' ? 'auto 1fr' : undefined,
              gap: s(20),
              alignItems: 'stretch',
            }}
          >
            {hasImage && imagePosition === 'top' && (
              <div style={{ gridColumn: '1 / -1' }}>
                {renderImagePanel({ height: s(260) })}
              </div>
            )}

            {hasImage && imagePosition === 'left' && renderImagePanel({ minHeight: s(622) })}

            <div
              style={{
                ...panelCard,
                padding: `${s(30)}px ${s(30)}px`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                flex: 1,
                minWidth: 0,
                gridColumn: hasImage && imagePosition === 'top' ? '1 / -1' : undefined,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: fs(50),
                  fontWeight: 700,
                  lineHeight: 1.05,
                  letterSpacing: '-0.026em',
                }}
              >
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p style={{ marginTop: s(10), color: theme.subtext, fontSize: fs(19), lineHeight: 1.4 }}>
                  {slide.subtitle}
                </p>
              )}

              <div style={{ marginTop: s(14), display: 'grid', gap: s(10) }}>
                {paragraphs.slice(0, 3).map((paragraph, index) => (
                  <p
                    key={index}
                    style={{
                      margin: 0,
                      color: theme.text,
                      fontSize: fs(17),
                      lineHeight: 1.5,
                      fontWeight: 400,
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>

            {hasImage && imagePosition === 'right' && renderImagePanel({ minHeight: s(622) })}
          </div>
        </div>
      )
    }

    case 'summary': {
      const summaryVariant = slide.variant === 'summary_icons' ? 'summary_icons' : 'default'

      if (summaryVariant === 'summary_icons' && !hasImage) {
        return (
          <div style={baseStyle}>
            {renderDecor()}

            <div
              style={{
                ...layoutPadding,
                zIndex: 2,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: s(24),
              }}
            >
              <div
                style={{
                  paddingBottom: s(4),
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(52),
                    lineHeight: 1.04,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {slide.title || 'Key Takeaways'}
                </h2>
                {slide.subtitle && (
                  <p
                    style={{
                      margin: `${s(12)}px 0 0`,
                      color: theme.subtext,
                      fontSize: fs(19),
                      lineHeight: 1.42,
                      maxWidth: '88%',
                    }}
                  >
                    {slide.subtitle}
                  </p>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'grid',
                  marginTop: s(20),
                  paddingTop: s(8),
                  gridTemplateColumns: summaryItems.length >= 4 ? '1fr 1fr' : '1fr',
                  gridAutoRows: '1fr',
                  gap: s(24),
                }}
              >
                {summaryItems.slice(0, 4).map((item, index) => (
                  <div
                    key={index}
                    style={{
                      ...panelCard,
                      minHeight: 0,
                      height: '100%',
                      boxSizing: 'border-box',
                      padding: `${s(18)}px ${s(20)}px`,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-start',
                    }}
                  >
                    {renderSummaryIcon(item)}
                    <div
                      style={{
                        marginTop: s(16),
                        fontFamily: theme.displayFont,
                        fontSize: fs(28),
                        lineHeight: 1.18,
                        letterSpacing: '-0.018em',
                        color: theme.text,
                      }}
                    >
                      {item.title || item.description}
                    </div>
                    {item.title && item.description && (
                      <div
                        style={{
                          marginTop: s(10),
                          color: theme.subtext,
                          fontSize: fs(18),
                          lineHeight: 1.5,
                          maxWidth: '95%',
                        }}
                      >
                        {item.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      }

      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: hasImage ? 'grid' : 'flex',
              flexDirection: hasImage ? undefined : 'column',
              gridTemplateColumns: hasImage ? '42% 58%' : undefined,
              gap: s(16),
              alignItems: 'stretch',
              minHeight: 0,
            }}
          >
            {hasImage && (
              <div
                style={{
                  ...panelCard,
                  padding: `${s(28)}px ${s(28)}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minWidth: 0,
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: `${s(8)}px 0 0`,
                      fontFamily: theme.displayFont,
                      fontSize: fs(52),
                      lineHeight: 1.03,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {slide.title || 'Key Takeaways'}
                  </h2>
                </div>

                {renderImagePanel({ minHeight: s(286), marginTop: s(14) })}
              </div>
            )}

            {!hasImage && (
              <div
                style={{
                  ...panelCard,
                  padding: `${s(22)}px ${s(24)}px`,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily: theme.displayFont,
                    fontSize: fs(44),
                    lineHeight: 1.04,
                    letterSpacing: '-0.028em',
                  }}
                >
                  {slide.title || 'Key Takeaways'}
                </h2>
                {slide.subtitle && (
                  <p style={{ marginTop: s(8), color: theme.subtext, fontSize: fs(19) }}>
                    {slide.subtitle}
                  </p>
                )}
              </div>
            )}

            <div
              style={{
                minWidth: 0,
                minHeight: 0,
                flex: 1,
                display: 'grid',
                gap: s(10),
                gridTemplateColumns: hasImage ? '1fr' : summaryItems.length >= 4 ? '1fr 1fr' : '1fr',
                gridAutoRows: '1fr',
              }}
            >
              {summaryItems.slice(0, 6).map((item, index) => (
                <div
                  key={index}
                  style={{
                    ...panelCard,
                    padding: `${s(16)}px ${s(18)}px`,
                    borderLeft: `${s(5)}px solid ${theme.accent}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    minHeight: 0,
                  }}
                >
                  {item.title && (
                    <div
                      style={{
                        fontFamily: theme.displayFont,
                        fontSize: fs(20),
                        lineHeight: 1.16,
                        letterSpacing: '-0.018em',
                        color: theme.text,
                      }}
                    >
                      {item.title}
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: item.title ? s(6) : 0,
                      color: theme.subtext,
                      fontSize: fs(20),
                      lineHeight: 1.5,
                    }}
                  >
                    {item.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    default:
      return (
        <div style={baseStyle}>
          {renderDecor()}
          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: 'grid',
              placeItems: 'center',
              ...panelCard,
            }}
          >
            <span style={{ color: theme.subtext, fontSize: fs(20) }}>Content unavailable for this slide.</span>
          </div>
        </div>
      )
  }
}
