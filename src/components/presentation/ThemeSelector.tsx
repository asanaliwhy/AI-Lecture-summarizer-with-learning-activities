import React, { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { SlideTheme } from '../../lib/presentationTypes'
import { THEME_CATEGORIES, THEME_PRESETS, type ThemeCategory } from '../../lib/presentationThemes'

interface ThemeSelectorProps {
  activeTheme: SlideTheme
  onThemeChange: (theme: SlideTheme) => void
}

type ThemeFilter = ThemeCategory | 'All'

export function ThemeSelector({ activeTheme, onThemeChange }: ThemeSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<ThemeFilter>('All')

  const filters: ThemeFilter[] = useMemo(() => ['All', ...THEME_CATEGORIES], [])

  const filteredThemes = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    return THEME_PRESETS.filter((theme) => {
      const matchesFilter = activeFilter === 'All' || theme.category === activeFilter
      if (!matchesFilter) return false
      if (!normalized) return true

      return (
        theme.name.toLowerCase().includes(normalized)
        || theme.category.toLowerCase().includes(normalized)
        || theme.mood.toLowerCase().includes(normalized)
      )
    })
  }, [activeFilter, searchQuery])

  return (
    <div className="w-[460px] max-w-[calc(100vw-2rem)]">
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search themes"
          className="h-9 w-full rounded-lg border border-black/[0.08] bg-white pl-8 pr-3 text-[12px] text-slate-700 outline-none transition-colors focus:border-blue-400"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
              activeFilter === filter
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1">
        {filteredThemes.map((theme) => {
          const isActive = activeTheme === theme.id
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onThemeChange(theme.id)}
              className={cn(
                'rounded-xl border p-2 text-left transition-all',
                isActive
                  ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/70'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <div
                className="mb-2 h-12 w-full rounded-md border border-black/5"
                style={{ background: theme.backgroundGradient }}
              />

              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-slate-800">{theme.name}</p>
                  <p className="truncate text-[10px] text-slate-500">{theme.category} - {theme.mood}</p>
                </div>
                {isActive && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.accent }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.accentSoft }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.surface }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.text }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
