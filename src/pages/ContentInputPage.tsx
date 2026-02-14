import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs'
import { Slider } from '../components/ui/Slider'
import { Label } from '../components/ui/Label'
import { Badge } from '../components/ui/Badge'
import {
  UploadCloud,
  Youtube,
  FileText,
  CheckCircle2,
  Settings2,
  ChevronDown,
  ChevronUp,
  List,
  AlignLeft,
  Type,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useToast } from '../components/ui/Toast'

interface YouTubeMeta {
  title?: string
  channel_name?: string
  thumbnail_url?: string
}

type SummaryPreset = 'quick' | 'exam' | 'deep'

const YOUTUBE_URL_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/
const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt', 'mp3', 'wav', 'mp4']

export function ContentInputPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [sourceType, setSourceType] = useState('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [isValid, setIsValid] = useState(false)
  const [videoMeta, setVideoMeta] = useState<YouTubeMeta | null>(null)
  const [contentId, setContentId] = useState<string | null>(null)
  const [summaryLength, setSummaryLength] = useState([50])
  const [outputFormat, setOutputFormat] = useState('cornell')
  const [targetAudience, setTargetAudience] = useState('academic')
  const [language, setLanguage] = useState('en')
  const [focusAreas, setFocusAreas] = useState<string[]>([
    'key concepts',
    'definitions & terms',
    'examples & case studies',
    'dates & figures',
  ])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [fileError, setFileError] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<SummaryPreset>('exam')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  const sourceReady = sourceType === 'youtube' ? isValid : !!uploadedFile
  const canGenerate = !isGenerating && sourceReady

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileExtension = (filename: string) => {
    const parts = filename.toLowerCase().split('.')
    return parts.length > 1 ? parts[parts.length - 1] : ''
  }

  const validateSelectedFile = (file: File) => {
    const ext = getFileExtension(file.name)

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type (.${ext || 'unknown'}). Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return `File is too large. Maximum size is ${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB.`
    }

    return ''
  }

  const handlePresetSelect = (preset: SummaryPreset) => {
    setSelectedPreset(preset)

    if (preset === 'quick') {
      setSummaryLength([25])
      setOutputFormat('bullets')
      setFocusAreas(['key concepts', 'definitions & terms'])
      setTargetAudience('simplified')
      return
    }

    if (preset === 'deep') {
      setSummaryLength([100])
      setOutputFormat('cornell')
      setFocusAreas([
        'key concepts',
        'definitions & terms',
        'examples & case studies',
        'dates & figures',
      ])
      setTargetAudience('academic')
      return
    }

    setSummaryLength([50])
    setOutputFormat('cornell')
    setFocusAreas([
      'key concepts',
      'definitions & terms',
      'examples & case studies',
      'dates & figures',
    ])
    setTargetAudience('academic')
  }

  const toggleFocusArea = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area)
        ? prev.filter((a) => a !== area)
        : [...prev, area],
    )
  }

  const handleValidate = async () => {
    const url = youtubeUrl.trim()
    if (url !== youtubeUrl) {
      setYoutubeUrl(url)
    }

    if (!url) {
      setValidationError('Please enter a YouTube URL')
      return
    }
    if (!YOUTUBE_URL_REGEX.test(url)) {
      setValidationError('Please enter a valid YouTube URL')
      return
    }
    setIsValidating(true)
    setValidationError('')
    try {
      const data = await api.content.validateYouTube(url)
      setIsValid(true)
      setVideoMeta(data.metadata)
      setContentId(data.content_id)
      toast.success('Video validated successfully!')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not validate video'
      setValidationError(message)
      toast.error(message)
      setIsValid(false)
    } finally {
      setIsValidating(false)
    }
  }

  const handleFileSelect = (file: File | null) => {
    if (!file) return

    const error = validateSelectedFile(file)
    if (error) {
      setUploadedFile(null)
      setFileError(error)
      toast.error(error)
      return
    }

    setFileError('')
    setUploadedFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files?.[0] || null)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    handleFileSelect(e.dataTransfer.files?.[0] || null)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const lengthSetting =
        summaryLength[0] < 25
          ? 'concise'
          : summaryLength[0] < 50
            ? 'standard'
            : summaryLength[0] < 75
              ? 'detailed'
              : 'comprehensive'

      if (sourceType === 'file' && uploadedFile) {
        const uploaded = await api.content.upload(uploadedFile)
        const result = await api.summaries.generate({
          content_id: uploaded.content_id,
          length: lengthSetting,
          format: outputFormat,
          focus_areas: focusAreas,
          target_audience: targetAudience,
          language,
        })
        toast.success('File uploaded. Summary generation started!')
        navigate(`/processing/${result.job_id}`)
      } else {
        if (!contentId) {
          throw new Error('Please validate the video first')
        }
        const result = await api.summaries.generate({
          content_id: contentId,
          length: lengthSetting,
          format: outputFormat,
          focus_areas: focusAreas,
          target_audience: targetAudience,
          language,
        })
        toast.success('Summary generation started!')
        navigate(`/processing/${result.job_id}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start generation'
      setValidationError(message)
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }
  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Create New Content
          </h1>
          <p className="text-muted-foreground">
            Import a lecture or document to generate summaries, quizzes, and
            flashcards.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { label: '1. Source', done: sourceReady || !!youtubeUrl || !!uploadedFile },
            { label: '2. Configure', done: !!outputFormat && focusAreas.length > 0 },
            { label: '3. Generate', done: false },
          ].map((step) => (
            <div
              key={step.label}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                step.done
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-background text-muted-foreground',
              )}
            >
              {step.label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column - Source Input (55%) */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="border-2 border-transparent shadow-md">
              <CardHeader>
                <CardTitle>Input Source</CardTitle>
                <CardDescription>
                  Choose how you want to provide content.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  defaultValue="youtube"
                  onValueChange={(value) => {
                    setSourceType(value)
                    setValidationError('')
                    setFileError('')
                  }}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger
                      value="youtube"
                      className="flex items-center gap-2"
                    >
                      <Youtube className="h-4 w-4" />
                      YouTube Link
                    </TabsTrigger>
                    <TabsTrigger
                      value="file"
                      className="flex items-center gap-2"
                    >
                      <UploadCloud className="h-4 w-4" />
                      File Upload
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="youtube" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="youtube-url">YouTube URL</Label>
                      <div className="flex gap-2">
                        <Input
                          id="youtube-url"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={youtubeUrl}
                          onChange={(e) => {
                            setYoutubeUrl(e.target.value)
                            setIsValid(false)
                            setValidationError('')
                          }}
                          className="flex-1"
                        />
                        <Button
                          onClick={handleValidate}
                          disabled={!youtubeUrl || isValidating}
                        >
                          {isValidating ? 'Checking...' : 'Validate'}
                        </Button>
                      </div>
                      {validationError && (
                        <p className="text-sm text-red-500 mt-2 animate-in fade-in slide-in-from-top-1">
                          {validationError}
                        </p>
                      )}
                      {!validationError && youtubeUrl.trim() && !YOUTUBE_URL_REGEX.test(youtubeUrl.trim()) && (
                        <p className="text-xs text-amber-600 mt-2">URL should be a valid YouTube link.</p>
                      )}
                      {!validationError && isValid && (
                        <p className="text-xs text-green-600 mt-2">Source validated and ready to generate.</p>
                      )}
                    </div>

                    {isValid && (
                      <div className="mt-4 rounded-lg border bg-muted/30 p-4 flex gap-4 animate-in fade-in slide-in-from-top-2">
                        <div
                          className="h-20 w-32 bg-slate-200 rounded-md flex-shrink-0 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${videoMeta?.thumbnail_url || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&q=80'})`,
                          }}
                        ></div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold truncate">
                            {videoMeta?.title || 'Unknown Video'}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {videoMeta?.channel_name || 'YouTube'}
                          </p>
                          <div className="flex items-center gap-1 text-green-600 text-xs font-medium mt-2">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Valid source detected</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="file" className="space-y-4">
                    <div
                      className={cn(
                        'border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer',
                        isDragActive
                          ? 'border-primary bg-primary/5'
                          : 'border-muted-foreground/25 hover:bg-muted/30',
                      )}
                      onClick={() => fileInputRef.current?.click()}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          fileInputRef.current?.click()
                        }
                      }}
                    >
                      <div className="mx-auto h-12 w-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                        <UploadCloud className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-medium mb-1">
                        Click to upload or drag and drop
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        MP3, WAV, MP4, PDF, DOCX, TXT (max 100MB)
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center mb-4">
                        {ALLOWED_EXTENSIONS.map((ext) => (
                          <Badge key={ext} variant="secondary" className="text-[11px] uppercase">.{ext}</Badge>
                        ))}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        Select File
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt,.mp3,.wav,.mp4"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      {fileError && (
                        <p className="text-xs text-destructive mt-3">{fileError}</p>
                      )}
                      {uploadedFile && (
                        <div className="mt-4 rounded-md border bg-background p-3 flex items-center justify-between gap-3 text-left">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center text-muted-foreground">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {getFileExtension(uploadedFile.name).toUpperCase()} • {formatFileSize(uploadedFile.size)}
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200">Ready</Badge>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Mobile-only generate button (visible on small screens) */}
            <div className="lg:hidden">
              <Button
                size="lg"
                className="w-full"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {isGenerating ? 'Generating...' : 'Generate Summary'}
              </Button>
            </div>
          </div>

          {/* Right Column - Configuration (45%) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base uppercase tracking-wider text-muted-foreground font-semibold">
                    Presets
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'quick' as SummaryPreset, title: 'Quick Review' },
                    { id: 'exam' as SummaryPreset, title: 'Exam Prep' },
                    { id: 'deep' as SummaryPreset, title: 'Deep Study' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset.id)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium text-left transition-colors',
                        selectedPreset === preset.id
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'hover:bg-secondary/40',
                      )}
                    >
                      {preset.title}
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Summary Settings */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base uppercase tracking-wider text-muted-foreground font-semibold">
                    Summary Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label>Length & Detail</Label>
                      <span className="text-xs font-medium text-muted-foreground">
                        {summaryLength[0] < 25
                          ? 'Concise'
                          : summaryLength[0] < 50
                            ? 'Standard'
                            : summaryLength[0] < 75
                              ? 'Detailed'
                              : 'Comprehensive'}
                      </span>
                    </div>
                    <Slider
                      defaultValue={[50]}
                      max={100}
                      step={25}
                      value={summaryLength}
                      onValueChange={setSummaryLength}
                      className="py-4"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground px-1">
                      <span>Short</span>
                      <span>Medium</span>
                      <span>Long</span>
                      <span>Deep Dive</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Output Format */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base uppercase tracking-wider text-muted-foreground font-semibold">
                    Output Format
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3">
                    <div
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                        outputFormat === 'cornell'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:bg-secondary/50',
                      )}
                      onClick={() => setOutputFormat('cornell')}
                    >
                      <div className="h-8 w-8 rounded bg-background border flex items-center justify-center text-primary">
                        <AlignLeft className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Cornell Method</p>
                        <p className="text-xs text-muted-foreground">
                          Cues on left, notes on right, summary at bottom
                        </p>
                      </div>
                      {outputFormat === 'cornell' && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>

                    <div
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                        outputFormat === 'bullets'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:bg-secondary/50',
                      )}
                      onClick={() => setOutputFormat('bullets')}
                    >
                      <div className="h-8 w-8 rounded bg-background border flex items-center justify-center text-primary">
                        <List className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          Structured Bullets
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Hierarchical bullet points with clear headings
                        </p>
                      </div>
                      {outputFormat === 'bullets' && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>

                    <div
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                        outputFormat === 'paragraph'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:bg-secondary/50',
                      )}
                      onClick={() => setOutputFormat('paragraph')}
                    >
                      <div className="h-8 w-8 rounded bg-background border flex items-center justify-center text-primary">
                        <Type className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Paragraph Text</p>
                        <p className="text-xs text-muted-foreground">
                          Flowing prose suitable for reading articles
                        </p>
                      </div>
                      {outputFormat === 'paragraph' && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Focus Areas */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base uppercase tracking-wider text-muted-foreground font-semibold">
                    Focus Areas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      'Key Concepts',
                      'Definitions & Terms',
                      'Examples & Case Studies',
                      'Dates & Figures',
                    ].map((item) => (
                      <div key={item} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={item}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          checked={focusAreas.includes(item.toLowerCase())}
                          onChange={() => toggleFocusArea(item.toLowerCase())}
                        />
                        <label
                          htmlFor={item}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {item}
                        </label>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Advanced Options Accordion */}
              <div className="border rounded-lg bg-card">
                <button
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="flex w-full items-center justify-between p-4 text-sm font-medium hover:bg-secondary/50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    <span>Advanced Options</span>
                  </div>
                  {advancedOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {advancedOpen && (
                  <div className="p-4 pt-0 border-t mt-2 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-1 gap-4 pt-4">
                      <div className="space-y-2">
                        <Label>Target Audience / Tone</Label>
                        <select
                          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={targetAudience}
                          onChange={(e) => setTargetAudience(e.target.value)}
                        >
                          <option value="academic">Academic (Standard)</option>
                          <option value="simplified">Simplified (ELI5)</option>
                          <option value="professional">Professional</option>
                          <option value="creative">Creative</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Language</Label>
                        <select
                          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                        >
                          <option value="en">English (US)</option>
                          <option value="es">Spanish</option>
                          <option value="fr">French</option>
                          <option value="de">German</option>
                          <option value="zh">Chinese (Simplified)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop Generate Button */}
              <div className="hidden lg:block pt-4">
                <Button
                  size="lg"
                  className="w-full text-base h-12 shadow-lg hover:shadow-xl transition-all"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                >
                  {isGenerating ? 'Generating...' : 'Generate Summary'}
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Estimated processing time: ~2 minutes
                </p>
              </div>

              <div className="hidden lg:block fixed bottom-5 right-6 z-40">
                <Button
                  size="lg"
                  className="h-12 px-6 shadow-xl"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                >
                  {isGenerating ? 'Generating...' : 'Generate Summary'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
