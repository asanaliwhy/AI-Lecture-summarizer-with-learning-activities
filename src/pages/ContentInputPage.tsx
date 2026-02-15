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
import defaultVideoThumbnail from '../assets/default-video-thumbnail.svg'
export function ContentInputPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024
  const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.mp3', '.wav', '.mp4'])
  const ACCEPT_ATTR = '.pdf,.docx,.txt,.mp3,.wav,.mp4'

  const [sourceType, setSourceType] = useState('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [isValid, setIsValid] = useState(false)
  type VideoMetadata = {
    thumbnail_url?: string
    title?: string
    channel_name?: string
  }
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null)
  const [contentId, setContentId] = useState<string | null>(null)
  const [summaryLength, setSummaryLength] = useState([50])
  const [outputFormat, setOutputFormat] = useState('cornell')
  const [targetAudience, setTargetAudience] = useState('academic')
  const [language, setLanguage] = useState('en')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  const getFileExtension = (filename: string) => {
    const index = filename.lastIndexOf('.')
    return index >= 0 ? filename.slice(index).toLowerCase() : ''
  }

  const validateSelectedFile = (file: File): string | null => {
    const ext = getFileExtension(file.name)
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      return 'Unsupported file type. Allowed: PDF, DOCX, TXT, MP3, WAV, MP4.'
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return 'File is too large. Maximum allowed size is 100MB.'
    }

    return null
  }

  const handleSelectedFile = (file: File | null) => {
    if (!file) return

    const fileError = validateSelectedFile(file)
    if (fileError) {
      setUploadedFile(null)
      setValidationError(fileError)
      toast.error(fileError)
      return
    }

    setUploadedFile(file)
    setValidationError('')
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
    if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(url)) {
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
      const message = err instanceof Error ? err.message : 'Invalid URL'
      setValidationError(message)
      toast.error(message || 'Could not validate video')
      setIsValid(false)
    } finally {
      setIsValidating(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    handleSelectedFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    setSourceType('file')
    const file = e.dataTransfer.files?.[0] || null
    handleSelectedFile(file)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragActive) setIsDragActive(true)
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
        summaryLength[0] <= 25
          ? 'concise'
          : summaryLength[0] <= 50
            ? 'standard'
            : summaryLength[0] <= 75
              ? 'detailed'
              : 'comprehensive'

      if (sourceType === 'file' && uploadedFile) {
        const uploaded = await api.content.upload(uploadedFile)
        const result = await api.summaries.generate({
          content_id: uploaded.content_id,
          length: lengthSetting,
          format: outputFormat,
          focus_areas: [],
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
          focus_areas: [],
          target_audience: targetAudience,
          language,
        })
        toast.success('Summary generation started!')
        navigate(`/processing/${result.job_id}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed'
      setValidationError(message)
      toast.error(message || 'Failed to start generation')
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
                  onValueChange={setSourceType}
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
                    </div>

                    {isValid && (
                      <div className="mt-4 rounded-lg border bg-muted/30 p-4 animate-in fade-in slide-in-from-top-2">
                        <div
                          className="w-full aspect-video bg-slate-200 rounded-md bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${videoMeta?.thumbnail_url || defaultVideoThumbnail})`,
                          }}
                        ></div>
                        <div className="mt-3 min-w-0">
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
                        'border-2 border-dashed rounded-xl p-8 md:p-10 text-center transition-all cursor-pointer',
                        isDragActive && 'border-primary bg-primary/10',
                        uploadedFile
                          ? 'border-emerald-300 bg-emerald-50/30 dark:bg-emerald-500/5'
                          : 'border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30',
                      )}
                      onClick={() => fileInputRef.current?.click()}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          fileInputRef.current?.click()
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label="Upload file"
                    >
                      <div
                        className={cn(
                          'mx-auto h-14 w-14 rounded-full flex items-center justify-center mb-4',
                          uploadedFile
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'bg-secondary text-muted-foreground',
                        )}
                      >
                        <UploadCloud
                          className={cn(
                            'h-6 w-6',
                            uploadedFile ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground',
                          )}
                        />
                      </div>
                      <h3 className="text-lg font-medium mb-1">
                        {uploadedFile
                          ? 'File ready to generate'
                          : 'Click to upload or drag and drop'}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        PDF, DOCX, TXT, MP3, WAV, or MP4 (max 100MB)
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          fileInputRef.current?.click()
                        }}
                      >
                        {uploadedFile ? 'Replace File' : 'Select File'}
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPT_ATTR}
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      {uploadedFile && (
                        <div className="mt-4 mx-auto max-w-md rounded-lg border bg-background/70 px-4 py-3 text-left">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready
                              </p>
                            </div>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-1" />
                          </div>
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
                disabled={
                  isGenerating ||
                  (sourceType === 'youtube' ? !isValid : !uploadedFile)
                }
              >
                Generate Summary
              </Button>
            </div>
          </div>

          {/* Right Column - Configuration (45%) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-6">
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
                        {summaryLength[0] <= 25
                          ? 'Concise'
                          : summaryLength[0] <= 50
                            ? 'Standard'
                            : summaryLength[0] <= 75
                              ? 'Detailed'
                              : 'Comprehensive'}
                      </span>
                    </div>
                    <Slider
                      defaultValue={[50]}
                      min={25}
                      max={100}
                      step={25}
                      value={summaryLength}
                      onValueChange={setSummaryLength}
                      rangeClassName={summaryLength[0] === 25 ? 'min-w-[8px]' : undefined}
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
                  <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label="Output format">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={outputFormat === 'cornell'}
                      className={cn(
                        'w-full text-left flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
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
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={outputFormat === 'bullets'}
                      className={cn(
                        'w-full text-left flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
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
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={outputFormat === 'paragraph'}
                      className={cn(
                        'w-full text-left flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
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
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={outputFormat === 'smart'}
                      className={cn(
                        'w-full text-left flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                        outputFormat === 'smart'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:bg-secondary/50',
                      )}
                      onClick={() => setOutputFormat('smart')}
                    >
                      <div className="h-8 w-8 rounded bg-background border flex items-center justify-center text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Smart Summary</p>
                        <p className="text-xs text-muted-foreground">
                          AI-optimized summary with key insights and comparison tables
                        </p>
                      </div>
                      {outputFormat === 'smart' && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </button>
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
                          <option value="en">English</option>
                          <option value="kk">Kazakh</option>
                          <option value="ru">Russian</option>
                          <option value="fr">French</option>
                          <option value="es">Spanish</option>
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
                  disabled={
                    isGenerating ||
                    (sourceType === 'youtube' ? !isValid : !uploadedFile)
                  }
                >
                  Generate Summary
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Estimated processing time: ~2 minutes
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
