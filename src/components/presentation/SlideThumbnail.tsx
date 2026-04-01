import React from 'react'
import { cn } from '../../lib/utils'
import type { Slide, ThemeConfig } from '../../lib/presentationTypes'
import { PRESENTATION_CANVAS_HEIGHT, PRESENTATION_CANVAS_WIDTH, SlideRenderer } from './SlideRenderer'

interface SlideThumbnailProps {
  slide: Slide
  theme: ThemeConfig
  index: number
  isActive: boolean
  onClick: () => void
}

export function SlideThumbnail({
  slide,
  theme,
  index,
  isActive,
  onClick,
}: SlideThumbnailProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex-shrink-0 text-left rounded-lg overflow-hidden transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]',
        isActive
          ? 'ring-2 ring-[#3b82f6] shadow-lg'
          : 'ring-1 ring-white/[0.08] hover:ring-white/[0.2] hover:shadow-md',
      )}
      style={{ width: '168px', height: '95px' }}
    >
      <div className="w-full h-full relative overflow-hidden bg-white/5">
        <div
          className="pointer-events-none"
          style={{
            width: `${PRESENTATION_CANVAS_WIDTH}px`,
            height: `${PRESENTATION_CANVAS_HEIGHT}px`,
            transform: `scale(${168 / PRESENTATION_CANVAS_WIDTH})`,
            transformOrigin: 'top left',
          }}
        >
          <SlideRenderer slide={slide} theme={theme} scale={1} />
        </div>
        <div
          className={cn(
            'absolute bottom-1 left-1 min-w-[18px] h-[18px] flex items-center justify-center rounded text-[9px] font-bold px-1',
            isActive
              ? 'bg-[#3b82f6] text-white shadow-sm'
              : 'bg-[#111]/80 backdrop-blur-sm text-white/80',
          )}
        >
          {index + 1}
        </div>
      </div>
    </button>
  )
}
