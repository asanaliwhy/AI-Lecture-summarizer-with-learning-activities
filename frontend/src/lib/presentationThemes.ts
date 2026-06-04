import type { SlideTheme, ThemeConfig } from './presentationTypes'

export type ThemeCategory = 'Minimal' | 'Corporate' | 'Editorial' | 'Academic' | 'Cinematic' | 'Dark'

export interface ThemePreset extends ThemeConfig {
  id: SlideTheme
  category: ThemeCategory
  mood: string
  accentGradient: string
  borderSubtle: string
  panelGlass: string
  isDarkTheme: boolean
}

interface ThemeSpec {
  id: SlideTheme
  name: string
  category: ThemeCategory
  mood: string
  background: string
  backgroundAlt: string
  card: string
  surface: string
  surfaceStrong: string
  text: string
  subtext: string
  accent: string
  accentSoft: string
  border: string
}

const themeFonts: Record<ThemeCategory, { displayFont: string; bodyFont: string }> = {
  Minimal: {
    displayFont: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
    bodyFont: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  },
  Corporate: {
    displayFont: "'Space Grotesk', 'Segoe UI', sans-serif",
    bodyFont: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  },
  Editorial: {
    displayFont: "'Playfair Display', 'Times New Roman', serif",
    bodyFont: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  },
  Academic: {
    displayFont: "'DM Serif Display', 'Times New Roman', serif",
    bodyFont: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  },
  Cinematic: {
    displayFont: "'Syne', 'Space Grotesk', sans-serif",
    bodyFont: "'Space Grotesk', 'Segoe UI', sans-serif",
  },
  Dark: {
    displayFont: "'Space Grotesk', 'Segoe UI', sans-serif",
    bodyFont: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  },
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = String(hex || '').trim()
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) {
    return { r: 0, g: 0, b: 0 }
  }

  let raw = match[1]
  if (raw.length === 3) {
    raw = raw.split('').map((ch) => `${ch}${ch}`).join('')
  }

  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  }
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

function mixHex(a: string, b: string, amount: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  const ratio = clamp(amount, 0, 1)
  const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0')
  const r = x.r + (y.r - x.r) * ratio
  const g = x.g + (y.g - x.g) * ratio
  const bMix = x.b + (y.b - x.b) * ratio
  return `#${toHex(r)}${toHex(g)}${toHex(bMix)}`
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const srgb = [r, g, b].map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
}

function isDarkColor(hex: string): boolean {
  return relativeLuminance(hex) < 0.42
}

function toThemePreset(spec: ThemeSpec): ThemePreset {
  const fonts = themeFonts[spec.category]
  const isDarkTheme = spec.category === 'Dark' || isDarkColor(spec.surfaceStrong)
  const accentBright = mixHex(spec.accent, '#ffffff', isDarkTheme ? 0.08 : 0.22)
  const accentDeep = mixHex(spec.accent, spec.surfaceStrong, isDarkTheme ? 0.26 : 0.16)
  const backgroundCore = mixHex(spec.background, spec.backgroundAlt, isDarkTheme ? 0.3 : 0.62)
  const backgroundTail = mixHex(spec.surfaceStrong, spec.background, isDarkTheme ? 0.45 : 0.18)

  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    mood: spec.mood,
    background: spec.background,
    backgroundGradient: [
      `radial-gradient(120% 100% at 14% 8%, ${rgba(accentBright, isDarkTheme ? 0.22 : 0.15)} 0%, transparent 58%)`,
      `radial-gradient(110% 90% at 92% 10%, ${rgba(spec.accentSoft, isDarkTheme ? 0.2 : 0.12)} 0%, transparent 62%)`,
      `linear-gradient(160deg, ${spec.backgroundAlt} 0%, ${backgroundCore} 46%, ${backgroundTail} 100%)`,
    ].join(', '),
    cardBackground: spec.card,
    cardGradient: `linear-gradient(160deg, ${rgba(spec.card, isDarkTheme ? 0.92 : 0.88)} 0%, ${rgba(spec.surface, isDarkTheme ? 0.85 : 0.78)} 100%)`,
    surface: spec.surface,
    surfaceStrong: spec.surfaceStrong,
    text: spec.text,
    subtext: spec.subtext,
    accent: spec.accent,
    accentSoft: spec.accentSoft,
    border: spec.border,
    sectionBackground: spec.surface,
    overlay: `linear-gradient(135deg, ${rgba(accentDeep, isDarkTheme ? 0.34 : 0.2)}, ${rgba(spec.surfaceStrong, isDarkTheme ? 0.72 : 0.42)})`,
    accentGradient: `linear-gradient(135deg, ${accentBright} 0%, ${spec.accent} 46%, ${accentDeep} 100%)`,
    borderSubtle: isDarkTheme ? rgba(spec.border, 0.56) : rgba(spec.border, 0.44),
    panelGlass: isDarkTheme ? rgba(spec.surfaceStrong, 0.58) : rgba('#ffffff', 0.58),
    isDarkTheme,
    displayFont: fonts.displayFont,
    bodyFont: fonts.bodyFont,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 100) / 100
  const light = clamp(l, 0, 100) / 100

  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) {
    r = c; g = x; b = 0
  } else if (hue < 120) {
    r = x; g = c; b = 0
  } else if (hue < 180) {
    r = 0; g = c; b = x
  } else if (hue < 240) {
    r = 0; g = x; b = c
  } else if (hue < 300) {
    r = x; g = 0; b = c
  } else {
    r = c; g = 0; b = x
  }

  const toHex = (channel: number) => {
    const value = Math.round((channel + m) * 255)
    return value.toString(16).padStart(2, '0')
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function slugifyThemeId(name: string): SlideTheme {
  const base = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return (base || `theme-${hashString(name) % 10000}`) as SlideTheme
}

function generatedThemeCategory(name: string, index: number): ThemeCategory {
  const lower = name.toLowerCase()

  const darkKeywords = [
    'dark', 'night', 'onyx', 'coal', 'shadow', 'orbit', 'indigo', 'electric', 'alien', 'cigar',
    'marine', 'mystique', 'borealis', 'aurora', 'velvet', 'nebula', 'lunaria', 'blues', 'petrol', 'wine',
  ]
  if (darkKeywords.some((keyword) => lower.includes(keyword))) {
    return 'Dark'
  }

  const corporateKeywords = ['consultant', 'founder', 'dialogue', 'wireframe', 'commons', 'basic']
  if (corporateKeywords.some((keyword) => lower.includes(keyword))) {
    return 'Corporate'
  }

  const editorialKeywords = ['peach', 'flamingo', 'malibu', 'bubble', 'sanguine', 'cornflower', 'lavender']
  if (editorialKeywords.some((keyword) => lower.includes(keyword))) {
    return 'Editorial'
  }

  const academicKeywords = ['kraft', 'linen', 'terracotta', 'piano', 'iris', 'gold leaf', 'daktilo']
  if (academicKeywords.some((keyword) => lower.includes(keyword))) {
    return 'Academic'
  }

  const cinematicKeywords = ['atacama', 'canaveral', 'rush', 'gleam', 'aurum']
  if (cinematicKeywords.some((keyword) => lower.includes(keyword))) {
    return 'Cinematic'
  }

  const rotation: ThemeCategory[] = ['Minimal', 'Editorial', 'Corporate', 'Academic', 'Cinematic']
  return rotation[index % rotation.length]
}

function generatedThemeSpec(name: string, index: number): ThemeSpec {
  const category = generatedThemeCategory(name, index)
  const hash = hashString(`${name}-${category}`)
  const hue = hash % 360

  const dark = category === 'Dark'
  const cinematic = category === 'Cinematic'

  const satBump = cinematic ? 8 : 0

  return {
    id: slugifyThemeId(name),
    name,
    category,
    mood: `${name} preset`,
    background: dark ? hslToHex(hue, 34 + satBump, 9) : hslToHex(hue, 22 + satBump, 94),
    backgroundAlt: dark ? hslToHex(hue + 20, 42 + satBump, 18) : hslToHex(hue + 14, 30 + satBump, 98),
    card: dark ? hslToHex(hue + 8, 30 + satBump, 15) : hslToHex(hue + 2, 24 + satBump, 97),
    surface: dark ? hslToHex(hue + 10, 32 + satBump, 19) : hslToHex(hue + 4, 18 + satBump, 90),
    surfaceStrong: dark ? hslToHex(hue + 14, 32 + satBump, 12) : hslToHex(hue + 6, 16 + satBump, 84),
    text: dark ? hslToHex(hue + 8, 24, 94) : hslToHex(hue + 8, 24, 16),
    subtext: dark ? hslToHex(hue + 8, 18, 78) : hslToHex(hue + 8, 16, 34),
    accent: dark ? hslToHex(hue + 48, 82, 60) : hslToHex(hue + 40, 62, 40),
    accentSoft: dark ? hslToHex(hue + 48, 72, 76) : hslToHex(hue + 40, 58, 64),
    border: dark ? hslToHex(hue + 8, 20, 30) : hslToHex(hue + 8, 18, 78),
  }
}

const THEME_SPECS: ThemeSpec[] = [
  { id: 'navy', name: 'Navy', category: 'Corporate', mood: 'Polished blue deck', background: '#0d1b2a', backgroundAlt: '#273b63', card: '#1e2b42', surface: '#243349', surfaceStrong: '#1b2639', text: '#f3f6fb', subtext: '#bac6da', accent: '#4ea8ff', accentSoft: '#97cfff', border: '#3e5273' },
  { id: 'slate-board', name: 'Slate Board', category: 'Corporate', mood: 'Executive neutral', background: '#1a242f', backgroundAlt: '#314050', card: '#25313e', surface: '#2f3d4c', surfaceStrong: '#1f2a36', text: '#edf2f7', subtext: '#b8c4cf', accent: '#66b0ff', accentSoft: '#9fd0ff', border: '#425363' },
  { id: 'steel-metro', name: 'Steel Metro', category: 'Corporate', mood: 'Urban modern', background: '#18222b', backgroundAlt: '#2d3f50', card: '#22303c', surface: '#2a3a47', surfaceStrong: '#17212a', text: '#edf3f8', subtext: '#b4c1cc', accent: '#2cc6a0', accentSoft: '#86e3cb', border: '#3d4f5d' },
  { id: 'cobalt-grid', name: 'Cobalt Grid', category: 'Corporate', mood: 'Analyst briefing', background: '#111b39', backgroundAlt: '#20356c', card: '#1a2a57', surface: '#23346a', surfaceStrong: '#101f43', text: '#f2f6ff', subtext: '#bdc8e6', accent: '#6f9bff', accentSoft: '#9fb9ff', border: '#3a4d7f' },
  { id: 'ash-report', name: 'Ash Report', category: 'Corporate', mood: 'Consulting deck', background: '#20252a', backgroundAlt: '#39444f', card: '#2b3138', surface: '#343c46', surfaceStrong: '#1f242b', text: '#f4f6f8', subtext: '#c1c8d1', accent: '#8ac3ff', accentSoft: '#b6dcff', border: '#495463' },
  { id: 'minimal', name: 'Minimal', category: 'Minimal', mood: 'Clean and open', background: '#eceff1', backgroundAlt: '#f7f9fb', card: '#f5f7f8', surface: '#dfe6ea', surfaceStrong: '#d1dade', text: '#1d262c', subtext: '#4f5e68', accent: '#1f6e64', accentSoft: '#5aa89d', border: '#c5d0d6' },
  { id: 'pearl-paper', name: 'Pearl Paper', category: 'Minimal', mood: 'Quiet premium', background: '#f3f2ee', backgroundAlt: '#fffdf7', card: '#faf8f1', surface: '#e8e3d8', surfaceStrong: '#ddd6c9', text: '#272421', subtext: '#635c53', accent: '#3d7c8f', accentSoft: '#8dc1cc', border: '#d4ccbf' },
  { id: 'alpine-mint', name: 'Alpine Mint', category: 'Minimal', mood: 'Fresh modern', background: '#edf3f1', backgroundAlt: '#f8fffb', card: '#f4faf7', surface: '#dce9e3', surfaceStrong: '#cfddd6', text: '#1f2b26', subtext: '#4f645b', accent: '#2f8f78', accentSoft: '#79c7b4', border: '#c4d7cf' },
  { id: 'soft-stone', name: 'Soft Stone', category: 'Minimal', mood: 'Calm neutral', background: '#ececea', backgroundAlt: '#f7f7f5', card: '#f5f5f2', surface: '#dfdfda', surfaceStrong: '#d0d0ca', text: '#262624', subtext: '#60605b', accent: '#6a8899', accentSoft: '#a0bdcb', border: '#c7c7c0' },
  { id: 'linen-air', name: 'Linen Air', category: 'Minimal', mood: 'Soft editorial', background: '#f0efec', backgroundAlt: '#fdfcf8', card: '#f7f5f1', surface: '#e3dfd5', surfaceStrong: '#d6d0c4', text: '#2a261f', subtext: '#6a6357', accent: '#8f6f4f', accentSoft: '#c4a584', border: '#cdc4b6' },
  { id: 'academic', name: 'Academic', category: 'Academic', mood: 'Research narrative', background: '#f5efe4', backgroundAlt: '#faf4eb', card: '#fdf9f3', surface: '#efe4d3', surfaceStrong: '#dfcfb6', text: '#2d2317', subtext: '#6b5a47', accent: '#9a5b16', accentSoft: '#c69358', border: '#d8c7ad' },
  { id: 'library-sepia', name: 'Library Sepia', category: 'Academic', mood: 'Bookish warm', background: '#efe6d8', backgroundAlt: '#f8f0e2', card: '#f7efe2', surface: '#e5d6c2', surfaceStrong: '#d7c3a8', text: '#312419', subtext: '#705b46', accent: '#8d4f2b', accentSoft: '#c48b64', border: '#cfbaa0' },
  { id: 'parchment-notes', name: 'Parchment Notes', category: 'Academic', mood: 'Classic classroom', background: '#f3ebdf', backgroundAlt: '#fcf6eb', card: '#f9f2e7', surface: '#e9ddcd', surfaceStrong: '#dccbb6', text: '#33271b', subtext: '#706151', accent: '#7d5f3f', accentSoft: '#b89c78', border: '#d3c2ad' },
  { id: 'atlas-lecture', name: 'Atlas Lecture', category: 'Academic', mood: 'Geography study', background: '#e8eee9', backgroundAlt: '#f3faf5', card: '#f0f6f1', surface: '#d8e4dc', surfaceStrong: '#c7d5cc', text: '#1e2c24', subtext: '#54685d', accent: '#3d7560', accentSoft: '#81b79f', border: '#bfcfc5' },
  { id: 'oak-seminar', name: 'Oak Seminar', category: 'Academic', mood: 'Formal seminar', background: '#ebe4d8', backgroundAlt: '#f5efe5', card: '#f4eee3', surface: '#dfd3c1', surfaceStrong: '#cebea7', text: '#2f2418', subtext: '#665545', accent: '#7a5230', accentSoft: '#b88763', border: '#c7b59d' },
  { id: 'editorial-ink', name: 'Editorial Ink', category: 'Editorial', mood: 'Magazine contrast', background: '#f1f2f4', backgroundAlt: '#ffffff', card: '#fafbfd', surface: '#e2e6eb', surfaceStrong: '#d3dae2', text: '#121720', subtext: '#4e5b6d', accent: '#0066cc', accentSoft: '#63a1ea', border: '#c4ceda' },
  { id: 'terracotta-journal', name: 'Terracotta Journal', category: 'Editorial', mood: 'Warm storytelling', background: '#f2e6df', backgroundAlt: '#faefe9', card: '#f9efe8', surface: '#e5d1c7', surfaceStrong: '#d5bdaf', text: '#2f2019', subtext: '#6c5449', accent: '#ad5b37', accentSoft: '#d39a7c', border: '#ccb3a4' },
  { id: 'modern-magazine', name: 'Modern Magazine', category: 'Editorial', mood: 'Fashion clean', background: '#eeeff4', backgroundAlt: '#fafbff', card: '#f6f7fc', surface: '#dde0eb', surfaceStrong: '#cfd4e0', text: '#171c28', subtext: '#525f72', accent: '#6f3cff', accentSoft: '#b29aff', border: '#bdc6d8' },
  { id: 'monochrome-press', name: 'Monochrome Press', category: 'Editorial', mood: 'Black and white', background: '#e8e8e8', backgroundAlt: '#f7f7f7', card: '#f1f1f1', surface: '#d8d8d8', surfaceStrong: '#c6c6c6', text: '#1b1b1b', subtext: '#4f4f4f', accent: '#353535', accentSoft: '#8c8c8c', border: '#bcbcbc' },
  { id: 'citrus-column', name: 'Citrus Column', category: 'Editorial', mood: 'Bright lifestyle', background: '#f4f1e7', backgroundAlt: '#fefbe8', card: '#fbf7e8', surface: '#e8dfc0', surfaceStrong: '#d7ccac', text: '#2b2617', subtext: '#69613f', accent: '#8f7a1f', accentSoft: '#c6ae4b', border: '#cbc29d' },
  { id: 'dark', name: 'Dark', category: 'Dark', mood: 'Night mode default', background: '#0b0f14', backgroundAlt: '#1a2738', card: '#151e2b', surface: '#1a2636', surfaceStrong: '#111a26', text: '#edf3fb', subtext: '#b2bfd2', accent: '#f28ab2', accentSoft: '#f7b4ce', border: '#2f3f55' },
  { id: 'obsidian-neon', name: 'Obsidian Neon', category: 'Dark', mood: 'Tech launch', background: '#080b13', backgroundAlt: '#1a2140', card: '#12172b', surface: '#1b2040', surfaceStrong: '#0f1230', text: '#edf0ff', subtext: '#aab3d6', accent: '#4df2e8', accentSoft: '#94fff6', border: '#303a68' },
  { id: 'velvet-night', name: 'Velvet Night', category: 'Dark', mood: 'Luxury dark', background: '#110c16', backgroundAlt: '#2c1f3e', card: '#1c1425', surface: '#2a1d39', surfaceStrong: '#180f24', text: '#f4effa', subtext: '#c4b6d6', accent: '#c085ff', accentSoft: '#ddb9ff', border: '#44315b' },
  { id: 'carbon-luxe', name: 'Carbon Luxe', category: 'Dark', mood: 'Executive dark', background: '#0f1011', backgroundAlt: '#26292c', card: '#1a1c1e', surface: '#25292d', surfaceStrong: '#131517', text: '#f0f2f4', subtext: '#b8bec5', accent: '#8cc7ff', accentSoft: '#bedfff', border: '#3a4148' },
  { id: 'aurora-synth', name: 'Aurora Synth', category: 'Dark', mood: 'Futuristic gradient', background: '#101023', backgroundAlt: '#233255', card: '#1b1d35', surface: '#25355a', surfaceStrong: '#131527', text: '#eef2ff', subtext: '#b6c2e9', accent: '#6effbf', accentSoft: '#b6ffe0', border: '#394a78' },
  { id: 'cinematic-noir', name: 'Cinematic Noir', category: 'Cinematic', mood: 'Trailer mood', background: '#131313', backgroundAlt: '#323232', card: '#1f1f1f', surface: '#2a2a2a', surfaceStrong: '#161616', text: '#f6f2ec', subtext: '#c9c1b6', accent: '#f3b23d', accentSoft: '#f8d38a', border: '#46403a' },
  { id: 'sunset-drama', name: 'Sunset Drama', category: 'Cinematic', mood: 'Warm blockbuster', background: '#2a1b1d', backgroundAlt: '#5a2e2b', card: '#3a2326', surface: '#4a2f35', surfaceStrong: '#2a1a1d', text: '#fff1ea', subtext: '#e6c2b3', accent: '#ff8b4a', accentSoft: '#ffc29a', border: '#70464b' },
  { id: 'emerald-stage', name: 'Emerald Stage', category: 'Cinematic', mood: 'Nature epic', background: '#122219', backgroundAlt: '#214735', card: '#1a3024', surface: '#244736', surfaceStrong: '#102217', text: '#edf9f2', subtext: '#b4d3c0', accent: '#5fd09d', accentSoft: '#9be6c1', border: '#345f48' },
  { id: 'electric-pop', name: 'Electric Pop', category: 'Cinematic', mood: 'High energy', background: '#1b1532', backgroundAlt: '#3f2b74', card: '#2a1f4b', surface: '#382b66', surfaceStrong: '#1e1739', text: '#f7f3ff', subtext: '#c9bde9', accent: '#f65cff', accentSoft: '#ff9cf7', border: '#56438a' },
  { id: 'rose-studio', name: 'Rose Studio', category: 'Cinematic', mood: 'Creative showcase', background: '#241a24', backgroundAlt: '#4d2f50', card: '#322333', surface: '#472f49', surfaceStrong: '#241725', text: '#fff1fa', subtext: '#dfbfd6', accent: '#ff72b4', accentSoft: '#ffb2d8', border: '#66486a' },
]

const REQUESTED_THEME_NAMES = [
  'Nebulae', 'Creme', 'Lux', 'Consultant', 'Marine', 'Elysia', 'Prism', 'Lunaria', 'Night Sky', 'Commons',
  'Bonan Hale', 'Gamma', 'Gamma Dark', 'Dialogue', 'Founder', 'Lavender', 'Indigo', 'Howlite', 'Onyx', 'Atmosphere',
  'Blueberry', 'Kraft', 'Mystique', 'Petrol', 'Blues', 'Peach', 'Incandescent', 'Oatmeal', 'Sanguine', 'Sage',
  'Verdigris', 'Ash', 'Coal', 'Flamingo', 'Canaveral', 'Oasis', 'Fluo', 'Finesse', 'Electric', 'Zephyr',
  'Chimney Smoke', 'Chimney Dust', 'Icebreaker', 'Blue Steel', 'Daydream', 'Orbit', 'Dune', 'Mocha', 'Serene', 'Cornflower',
  'Vanilla', 'Alien', 'Breeze', 'Aurora', 'Velvet Tides', 'Tranquil', 'Borealis', 'Terracotta', 'Bubble Gum', 'Snowball',
  'Pistachio', 'Piano', 'Atacama', 'Wireframe', 'Aurum', 'Bee Happy', 'Chocolate', 'Cigar', 'Cornfield', 'Daktilo',
  'Dawn', 'Editoria', 'Flax', 'Gleam', 'Gold Leaf', 'Iris', 'Keepsake', 'Leimoon', 'Linen', 'Malibu',
  'Moss & Mist', 'Plant Shop', 'Rush', 'Shadow', 'Slate', 'Sprout', 'Wine', 'Basic Light', 'Basic Dark',
] as const

const existingNameSet = new Set(THEME_SPECS.map((theme) => theme.name.toLowerCase()))
const existingIdSet = new Set(THEME_SPECS.map((theme) => theme.id))

const GENERATED_THEME_SPECS: ThemeSpec[] = REQUESTED_THEME_NAMES
  .filter((name) => !existingNameSet.has(name.toLowerCase()))
  .map((name, index) => generatedThemeSpec(name, index))
  .map((spec) => {
    let id = spec.id
    let i = 2
    while (existingIdSet.has(id)) {
      id = `${spec.id}-${i}` as SlideTheme
      i += 1
    }
    existingIdSet.add(id)
    return { ...spec, id }
  })

const ALL_THEME_SPECS: ThemeSpec[] = [...THEME_SPECS, ...GENERATED_THEME_SPECS]

export const THEME_PRESETS: ThemePreset[] = ALL_THEME_SPECS.map(toThemePreset)

export const PRESENTATION_THEMES: Record<SlideTheme, ThemeConfig> = Object.fromEntries(
  THEME_PRESETS.map((preset) => [preset.id, preset as ThemeConfig]),
)

export const THEME_ORDER: SlideTheme[] = THEME_PRESETS.map((preset) => preset.id)

export const THEME_CATEGORIES: ThemeCategory[] = ['Minimal', 'Corporate', 'Editorial', 'Academic', 'Cinematic', 'Dark']

export const DEFAULT_PRESENTATION_THEME_ID: SlideTheme = 'navy'

export function isThemeId(themeId: string | null | undefined): themeId is SlideTheme {
  if (!themeId) {
    return false
  }
  return themeId in PRESENTATION_THEMES
}

export function getThemeById(themeId: string | null | undefined): ThemeConfig {
  if (themeId && isThemeId(themeId)) {
    return PRESENTATION_THEMES[themeId]
  }
  return PRESENTATION_THEMES[DEFAULT_PRESENTATION_THEME_ID]
}

export function getThemePresetById(themeId: string | null | undefined): ThemePreset {
  const resolvedId = isThemeId(themeId) ? themeId : DEFAULT_PRESENTATION_THEME_ID
  return THEME_PRESETS.find((preset) => preset.id === resolvedId) || THEME_PRESETS[0]
}
