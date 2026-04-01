import React from 'react'
import type { Slide, ThemeConfig } from '../../lib/presentationTypes'

export const PRESENTATION_CANVAS_WIDTH = 1366
export const PRESENTATION_CANVAS_HEIGHT = 768

interface SlideRendererProps {
  slide: Slide
  theme: ThemeConfig
  scale?: number
  isCard?: boolean
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

export function SlideRenderer({ slide, theme, scale = 1, isCard = false }: SlideRendererProps) {
  const s = (px: number) => px * scale
  const fs = (px: number) => `${px * scale}px`

  const columns = toColumns(slide)
  const bullets = toArray(slide.bullets)
  const stats = Array.isArray(slide.stats) ? slide.stats : []
  const summaryItems = Array.isArray(slide.takeaways) && slide.takeaways.length > 0
    ? slide.takeaways
    : bullets.map((bullet, index) => ({
      title: `Takeaway ${index + 1}`,
      description: bullet,
    }))

  const hasImage = Boolean(slide.imageUrl)
  const hasImageURL = typeof slide.imageUrl === 'string' && /^https?:\/\//i.test(slide.imageUrl)

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
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: s(8),
          background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentSoft})`,
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
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: theme.overlay,
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
        fontSize: fs(12),
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

  switch (slide.type) {
    case 'title': {
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

            {hasImage && renderImagePanel({ minHeight: s(618) }, true)}
          </div>
        </div>
      )
    }

    case 'section': {
      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: 'grid',
              gridTemplateColumns: hasImage ? '47% 53%' : '1fr',
              gap: s(24),
              alignItems: 'stretch',
            }}
          >
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

            {hasImage && renderImagePanel({ minHeight: s(618) }, true)}
          </div>
        </div>
      )
    }

    case 'content': {
      const titleText = String(slide.title || '')
      const subtitleText = String(slide.subtitle || '')
      const titleWordCount = titleText.trim() ? titleText.trim().split(/\s+/).length : 0
      const subtitleWordCount = subtitleText.trim() ? subtitleText.trim().split(/\s+/).length : 0
      const denseContent = bullets.length >= 6 || titleWordCount >= 8 || subtitleWordCount >= 16
      const ultraDenseContent = bullets.length >= 7 || titleWordCount >= 11 || subtitleWordCount >= 22
      const headingSize = ultraDenseContent ? 40 : denseContent ? 43 : 46
      const subtitleSize = ultraDenseContent ? 16 : denseContent ? 17 : 18
      const bulletFontSize = ultraDenseContent ? 14 : 15
      const bulletGap = ultraDenseContent ? 9 : 11
      const bulletPaddingY = ultraDenseContent ? 9 : denseContent ? 10 : 11
      const bulletPaddingX = ultraDenseContent ? 10 : 12
      const bulletChipSize = ultraDenseContent ? 28 : 30
      const panelPadding = ultraDenseContent
        ? `${s(22)}px ${s(22)}px ${s(20)}px`
        : denseContent
          ? `${s(24)}px ${s(24)}px ${s(22)}px`
          : `${s(28)}px ${s(28)}px`

      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              display: 'grid',
              gridTemplateColumns: hasImage ? '42% 58%' : '1fr',
              gap: s(22),
              alignItems: 'stretch',
              flex: 1,
            }}
          >
            <div
              style={{
                ...panelCard,
                padding: panelPadding,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: theme.displayFont,
                  fontSize: fs(headingSize),
                  lineHeight: 1.06,
                  letterSpacing: '-0.028em',
                }}
              >
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p
                  style={{
                    margin: `${s(12)}px 0 ${s(14)}px`,
                    color: theme.subtext,
                    fontSize: fs(subtitleSize),
                    lineHeight: 1.36,
                  }}
                >
                  {slide.subtitle}
                </p>
              )}

              <div style={{ display: 'grid', gap: s(bulletGap), marginTop: s(6) }}>
                {bullets.slice(0, 6).map((bullet, index) => (
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
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: fs(12),
                        fontWeight: 800,
                        lineHeight: 1,
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
                        transform: `translateY(${s(0.5)}px)`,
                        color: theme.surfaceStrong,
                        background: `linear-gradient(135deg, ${theme.accentSoft}, ${theme.accent})`,
                      }}
                    >
                      {index + 1}
                    </span>
                    <span style={{ fontSize: fs(bulletFontSize), lineHeight: 1.36 }}>{bullet}</span>
                  </div>
                ))}
              </div>
            </div>

            {hasImage && renderImagePanel({ minHeight: s(622) }, true)}
          </div>
        </div>
      )
    }

    case 'two_column': {
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
            }}
          >
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
                    fontSize: fs(44),
                    lineHeight: 1.06,
                    letterSpacing: '-0.026em',
                  }}
                >
                  {slide.title}
                </h2>
                {slide.subtitle && <p style={{ marginTop: s(8), color: theme.subtext, fontSize: fs(18) }}>{slide.subtitle}</p>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: s(14), flex: 1 }}>
                {columns.slice(0, 2).map((col, index) => (
                  <div
                    key={index}
                    style={{
                      ...panelCard,
                      padding: `${s(20)}px ${s(20)}px`,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {textOverline(col.label)}
                    <div style={{ marginTop: s(14), display: 'grid', gap: s(9) }}>
                      {col.items.slice(0, 6).map((item, itemIndex) => (
                        <div
                          key={itemIndex}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `${s(10)}px 1fr`,
                            gap: s(10),
                            fontSize: fs(14),
                            lineHeight: 1.4,
                            color: theme.text,
                          }}
                        >
                          <span
                            style={{
                              width: s(10),
                              height: s(10),
                              borderRadius: '50%',
                              marginTop: s(5),
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

            {hasImage && renderImagePanel({ minHeight: s(622) }, true)}
          </div>
        </div>
      )
    }

    case 'quote': {
      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: 'grid',
              gridTemplateColumns: hasImage ? '56% 44%' : '1fr',
              gap: s(20),
              alignItems: 'stretch',
            }}
          >
            <div
              style={{
                ...panelCard,
                padding: `${s(34)}px ${s(34)}px`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  marginTop: s(6),
                  fontFamily: theme.displayFont,
                  fontSize: fs(108),
                  lineHeight: 0.75,
                  color: theme.accentSoft,
                }}
              >
                “
              </div>
              <blockquote
                style={{
                  margin: `${s(8)}px 0 0`,
                  fontSize: fs(36),
                  lineHeight: 1.28,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                }}
              >
                {slide.quote}
              </blockquote>
              {slide.quoteAuthor && (
                <cite
                  style={{
                    marginTop: s(20),
                    color: theme.accent,
                    fontStyle: 'normal',
                    fontSize: fs(18),
                    fontWeight: 700,
                  }}
                >
                  — {slide.quoteAuthor}
                </cite>
              )}
            </div>

            {hasImage && renderImagePanel({ minHeight: s(622) }, true)}
          </div>
        </div>
      )
    }

    case 'stats': {
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
                    fontSize: fs(44),
                    lineHeight: 1.06,
                    letterSpacing: '-0.026em',
                  }}
                >
                  {slide.title}
                </h2>
                {slide.subtitle && <p style={{ marginTop: s(8), color: theme.subtext, fontSize: fs(18) }}>{slide.subtitle}</p>}
              </div>

              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: stats.length > 4 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
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
                        fontSize: fs(13),
                        color: theme.subtext,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        fontWeight: 700,
                      }}
                    >
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {hasImage && renderImagePanel({ minHeight: s(622) }, true)}
          </div>
        </div>
      )
    }

    case 'summary': {
      return (
        <div style={baseStyle}>
          {renderDecor()}

          <div
            style={{
              ...layoutPadding,
              zIndex: 2,
              flex: 1,
              display: 'grid',
              gridTemplateColumns: hasImage ? '42% 58%' : '38% 62%',
              gap: s(16),
              alignItems: 'stretch',
            }}
          >
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

              {hasImage && renderImagePanel({ minHeight: s(286), marginTop: s(14) }, true)}
            </div>

            <div style={{ minWidth: 0, display: 'grid', gap: s(10) }}>
              {summaryItems.slice(0, 6).map((item, index) => (
                <div
                  key={index}
                  style={{
                    ...panelCard,
                    padding: `${s(14)}px ${s(16)}px`,
                    borderLeft: `${s(4)}px solid ${theme.accent}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: fs(11),
                      fontWeight: 800,
                      letterSpacing: '0.11em',
                      textTransform: 'uppercase',
                      color: theme.accent,
                    }}
                  >
                    Point {index + 1}
                  </div>
                  <div
                    style={{
                      marginTop: s(6),
                      fontFamily: theme.displayFont,
                      fontSize: fs(20),
                      lineHeight: 1.16,
                      letterSpacing: '-0.018em',
                      color: theme.text,
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      marginTop: s(6),
                      color: theme.subtext,
                      fontSize: fs(14),
                      lineHeight: 1.34,
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
            <span style={{ color: theme.subtext, fontSize: fs(20) }}>Unsupported slide type</span>
          </div>
        </div>
      )
  }
}
