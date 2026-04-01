import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Presentation, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/Card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { api } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import { cn } from '../lib/utils'
import type { GeneratePresentationConfig, SlideTheme } from '../lib/presentationTypes'
import defaultVideoThumbnail from '../assets/default-video-thumbnail.svg'

type VideoMetadata = {
  thumbnail_url?: string
  title?: string
  channel_name?: string
}

const SLIDE_COUNT_OPTIONS = [
  {
    value: 7,
    label: 'Short',
    description: '1-8 slides',
  },
  {
    value: 12,
    label: 'Medium',
    description: '9-14 slides',
  },
  {
    value: 16,
    label: 'Large',
    description: '15+ slides',
  },
] as const

const TEXT_STYLE_OPTIONS = [
  { value: 'formal', label: 'Formal', description: 'Professional, polished structure' },
  { value: 'academic', label: 'Academic', description: 'Concept-driven, rigorous framing' },
  { value: 'conversational', label: 'Conversational', description: 'Plain language, audience-friendly' },
] as const

const THEME_OPTIONS: Array<{ value: SlideTheme; label: string; dotClass: string }> = [
  { value: 'navy', label: 'Navy', dotClass: 'bg-blue-700' },
  { value: 'minimal', label: 'Minimal', dotClass: 'bg-slate-300 border border-slate-400' },
  { value: 'academic', label: 'Academic', dotClass: 'bg-amber-700' },
  { value: 'dark', label: 'Dark', dotClass: 'bg-zinc-900 border border-zinc-700' },
]

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'kk', label: 'Kazakh' },
  { value: 'ru', label: 'Russian' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
]

export function PresentationConfigPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const validationRequestIdRef = useRef(0)
  const generationRequestIdRef = useRef(0)

  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [isValid, setIsValid] = useState(false)
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null)
  const [contentId, setContentId] = useState<string | null>(null)
  const [validationError, setValidationError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const [slideCount, setSlideCount] = useState<number>(7)
  const [textStyle, setTextStyle] = useState<GeneratePresentationConfig['text_style']>('formal')
  const [language, setLanguage] = useState('en')
  const [theme, setTheme] = useState<SlideTheme>('navy')
  const [focusAreasInput, setFocusAreasInput] = useState('')

  const handleValidate = async () => {
    const requestId = ++validationRequestIdRef.current
    const url = youtubeUrl.trim()
    if (url !== youtubeUrl) {
      setYoutubeUrl(url)
    }

    if (!url) {
      setValidationError('Please enter a YouTube URL')
      return
    }
    if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(url)) {
      setValidationError('Please enter a valid YouTube URL')
      return
    }

    setIsValidating(true)
    setValidationError('')

    try {
      const data = await api.content.validateYouTube(url)
      if (requestId !== validationRequestIdRef.current) return

      setIsValid(true)
      setVideoMeta(data.metadata)
      setContentId(data.content_id)
      toast.success('Video validated successfully!')
    } catch (err: unknown) {
      if (requestId !== validationRequestIdRef.current) return

      const message = err instanceof Error ? err.message : 'Invalid YouTube URL'
      setValidationError(message)
      setIsValid(false)
      setVideoMeta(null)
      setContentId(null)
      toast.error(message)
    } finally {
      if (requestId === validationRequestIdRef.current) {
        setIsValidating(false)
      }
    }
  }

  const handleGenerate = async () => {
    const requestId = ++generationRequestIdRef.current
    if (!contentId) {
      setValidationError('Please validate the video first')
      return
    }

    setIsGenerating(true)
    setValidationError('')

    try {
      const focusAreas = focusAreasInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

      const result = await api.presentations.create({
        content_id: contentId,
        slide_count: slideCount,
        language,
        text_style: textStyle,
        theme,
        focus_areas: focusAreas,
      })

      if (requestId !== generationRequestIdRef.current) return

      toast.success('Presentation generation started!')
      navigate(`/processing/${result.job_id}`)
    } catch (err: unknown) {
      if (requestId !== generationRequestIdRef.current) return

      const message = err instanceof Error ? err.message : 'Failed to start generation'
      setValidationError(message)
      toast.error(message)
    } finally {
      if (requestId === generationRequestIdRef.current) {
        setIsGenerating(false)
      }
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Create New Presentation</h1>
          <p className="text-muted-foreground">
            Turn a validated YouTube lecture into a structured slide deck with configurable tone, theme, and depth.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-6">
            <Card className="border-2 border-transparent shadow-md">
              <CardHeader>
                <CardTitle>Input Source</CardTitle>
                <CardDescription>Paste a YouTube URL and validate it before generating slides.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="presentation-youtube-url">YouTube URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="presentation-youtube-url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => {
                        setYoutubeUrl(e.target.value)
                        setIsValid(false)
                        setVideoMeta(null)
                        setContentId(null)
                      }}
                      className="flex-1"
                    />
                    <Button onClick={handleValidate} disabled={!youtubeUrl || isValidating}>
                      {isValidating ? 'Checking...' : 'Validate'}
                    </Button>
                  </div>
                  {validationError && (
                    <p className="text-sm text-red-500 mt-2 animate-in fade-in slide-in-from-top-1 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {validationError}
                    </p>
                  )}
                </div>

                {isValid && (
                  <div className="mt-4 rounded-lg border bg-muted/30 p-4 animate-in fade-in slide-in-from-top-2">
                    <div
                      className="w-full aspect-video bg-slate-200 rounded-md bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${videoMeta?.thumbnail_url || defaultVideoThumbnail})`,
                      }}
                    />
                    <div className="mt-3 min-w-0">
                      <h4 className="font-semibold truncate">{videoMeta?.title || 'Unknown Video'}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{videoMeta?.channel_name || 'YouTube'}</p>
                      <div className="flex items-center gap-1 text-green-600 text-xs font-medium mt-2">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Validated and ready for presentation generation</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="lg:hidden">
              <Button
                size="lg"
                className="w-full"
                onClick={handleGenerate}
                disabled={isGenerating || !isValid}
              >
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Presentation
              </Button>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base uppercase tracking-wider text-muted-foreground font-semibold">
                  Presentation Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Slide Count</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {SLIDE_COUNT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSlideCount(option.value)}
                        className={cn(
                          'rounded-xl border p-3 text-left transition-all',
                          slideCount === option.value
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'hover:bg-secondary/50',
                        )}
                      >
                        <p className="font-medium text-sm">{option.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <Label>Text Style</Label>
                  <div className="grid grid-cols-1 gap-3">
                    {TEXT_STYLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTextStyle(option.value)}
                        className={cn(
                          'w-full text-left rounded-xl border p-3 transition-all',
                          textStyle === option.value
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'hover:bg-secondary/50',
                        )}
                      >
                        <p className="font-medium text-sm">{option.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <Label>Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <Label>Theme</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {THEME_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border p-3 text-left transition-all',
                          theme === option.value
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'hover:bg-secondary/50',
                        )}
                      >
                        <span className={cn('h-3 w-3 rounded-full shrink-0', option.dotClass)} />
                        <span className="font-medium text-sm">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="presentation-focus-areas">Focus Areas</Label>
                    <Badge variant="secondary" className="text-[11px]">Optional</Badge>
                  </div>
                  <Input
                    id="presentation-focus-areas"
                    placeholder="e.g. neural networks, training data, model evaluation"
                    value={focusAreasInput}
                    onChange={(e) => setFocusAreasInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Separate focus areas with commas.</p>
                </div>
              </CardContent>
            </Card>

            <div className="hidden lg:block pt-4">
              <Button
                size="lg"
                className="w-full text-base h-12 shadow-lg hover:shadow-xl transition-all"
                onClick={handleGenerate}
                disabled={isGenerating || !isValid}
              >
                {isGenerating ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Presentation className="mr-2 h-5 w-5" />
                )}
                Generate Presentation
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-3">
                Estimated processing time: ~1-2 minutes
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
