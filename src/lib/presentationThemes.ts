import type { SlideTheme, ThemeConfig } from './presentationTypes'

export type ThemeCategory = 'Minimal' | 'Corporate' | 'Editorial' | 'Academic' | 'Cinematic' | 'Dark'

export interface ThemePreset extends ThemeConfig {
  id: SlideTheme
  category: ThemeCategory
  mood: string
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
    displayFont: "'Georgia', 'Times New Roman', serif",
    bodyFont: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  },
  Corporate: {
    displayFont: "'Trebuchet MS', 'Segoe UI', sans-serif",
    bodyFont: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  },
  Editorial: {
    displayFont: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    bodyFont: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  },
  Academic: {
    displayFont: "'Cambria', 'Times New Roman', serif",
    bodyFont: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  },
  Cinematic: {
    displayFont: "'Trebuchet MS', 'Segoe UI', sans-serif",
    bodyFont: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  },
  Dark: {
    displayFont: "'Trebuchet MS', 'Segoe UI', sans-serif",
    bodyFont: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  },
}

function toThemePreset(spec: ThemeSpec): ThemePreset {
  const fonts = themeFonts[spec.category]
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    mood: spec.mood,
    background: spec.background,
    backgroundGradient: `radial-gradient(circle at 18% 12%, ${spec.backgroundAlt} 0%, ${spec.background} 52%, ${spec.surfaceStrong} 100%)`,
    cardBackground: spec.card,
    cardGradient: `linear-gradient(145deg, ${spec.card} 0%, ${spec.surface} 100%)`,
    surface: spec.surface,
    surfaceStrong: spec.surfaceStrong,
    text: spec.text,
    subtext: spec.subtext,
    accent: spec.accent,
    accentSoft: spec.accentSoft,
    border: spec.border,
    sectionBackground: spec.surface,
    overlay: `linear-gradient(120deg, ${spec.surfaceStrong}33, ${spec.surfaceStrong}cc)`,
    displayFont: fonts.displayFont,
    bodyFont: fonts.bodyFont,
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

export const THEME_PRESETS: ThemePreset[] = THEME_SPECS.map(toThemePreset)

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
