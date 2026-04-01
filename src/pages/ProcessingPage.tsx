import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type JobResponse } from '../lib/api'
import { useWebSocket } from '../lib/useWebSocket'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import {
  Loader2,
  CheckCircle2,
  Circle,
  XCircle,
  FileAudio,
  Clock,
} from 'lucide-react'
import { cn } from '../lib/utils'

export function ProcessingPage() {
  const navigate = useNavigate()
  const { jobId } = useParams()
  const POLL_MAX_FAILURES = 6
  const POLL_BASE_MS = 5000
  const POLL_MAX_MS = 30000
  const FINALIZING_STALE_MS = 60000
  const [currentStep, setCurrentStep] = useState(0)
  const [stepName, setStepName] = useState('Analyzing content...')
  type ProcessingWSStatusPayload = {
    job_id?: string
    step?: number
    step_name?: string
  }

  type ProcessingWSCompletedPayload = {
    job_id?: string
    result_type?: 'summary' | 'quiz' | 'flashcard' | 'presentation' | string
    result_id?: string
  }

  type ProcessingWSErrorPayload = {
    job_id?: string
    error_message?: string
  }

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null

  const toStatusPayload = (payload: unknown): ProcessingWSStatusPayload => {
    if (!isRecord(payload)) return {}
    return {
      job_id: typeof payload.job_id === 'string' ? payload.job_id : undefined,
      step: typeof payload.step === 'number' ? payload.step : undefined,
      step_name: typeof payload.step_name === 'string' ? payload.step_name : undefined,
    }
  }

  const toCompletedPayload = (payload: unknown): ProcessingWSCompletedPayload => {
    if (!isRecord(payload)) return {}
    return {
      job_id: typeof payload.job_id === 'string' ? payload.job_id : undefined,
      result_type: typeof payload.result_type === 'string' ? payload.result_type : undefined,
      result_id: typeof payload.result_id === 'string' ? payload.result_id : undefined,
    }
  }

  const toErrorPayload = (payload: unknown): ProcessingWSErrorPayload => {
    if (!isRecord(payload)) return {}
    return {
      job_id: typeof payload.job_id === 'string' ? payload.job_id : undefined,
      error_message: typeof payload.error_message === 'string' ? payload.error_message : undefined,
    }
  }

  const [job, setJob] = useState<JobResponse | null>(null)
  const [error, setError] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const [pollWarning, setPollWarning] = useState('')
  const finalizingSinceRef = useRef<number | null>(null)
  const currentStepRef = useRef(0)
  const stepNameRef = useRef('Analyzing content...')

  useEffect(() => {
    currentStepRef.current = currentStep
  }, [currentStep])

  useEffect(() => {
    stepNameRef.current = stepName
  }, [stepName])

  const getSteps = (jobType?: string) => {
    if (jobType === 'quiz-generation') {
      return [
        {
          title: 'Preparing Quiz',
          description: 'Loading summary context and configuration',
        },
        {
          title: 'Generating Questions',
          description: 'Creating questions based on your summary',
        },
        {
          title: 'Validating Quiz',
          description: 'Checking structure and answer quality',
        },
        {
          title: 'Finalizing',
          description: 'Saving quiz and preparing results',
        },
      ]
    }

    if (jobType === 'flashcard-generation') {
      return [
        {
          title: 'Preparing Flashcards',
          description: 'Loading summary context and configuration',
        },
        {
          title: 'Creating Flashcards',
          description: 'Generating cards from key concepts',
        },
        {
          title: 'Validating Deck',
          description: 'Checking card quality and balance',
        },
        {
          title: 'Finalizing',
          description: 'Saving deck and preparing study mode',
        },
      ]
    }

    if (jobType === 'presentation') {
      return [
        {
          title: 'Analyzing Content',
          description: 'Checking source content and presentation settings',
        },
        {
          title: 'Preparing Transcript',
          description: 'Loading transcript and extracting presentation-ready material',
        },
        {
          title: 'Designing Slides',
          description: 'Generating slide structure, titles, and speaker notes',
        },
        {
          title: 'Attaching Visuals',
          description: 'Fetching supporting images when available',
        },
        {
          title: 'Finalizing',
          description: 'Saving presentation and preparing the viewer',
        },
      ]
    }

    return [
      {
        title: 'Analyzing Content',
        description: 'Detecting source type and preparing extraction',
      },
      {
        title: 'Extracting Source Text',
        description: 'Extracting text from your document or transcript from media',
      },
      {
        title: 'Generating Summary',
        description: 'Identifying key concepts and structuring notes',
      },
      {
        title: 'Finalizing',
        description: 'Applying format and saving results',
      },
    ]
  }

  const steps = getSteps(job?.type)

  // Fetch initial job status
  useEffect(() => {
    if (!jobId) return
    api.jobs.get(jobId).then(setJob).catch(() => { })
  }, [jobId])

  // WebSocket for live updates
  useWebSocket({
    onStatusUpdate: (payload: unknown) => {
      const statusPayload = toStatusPayload(payload)
      if (statusPayload.job_id === jobId || !jobId) {
        const stepFromBackend = Number(statusPayload.step || 1)
        setCurrentStep(Math.max(0, stepFromBackend - 1))
        setStepName(statusPayload.step_name || '')

        const finalizingThreshold = job?.type === 'presentation' ? 5 : 4
        if (stepFromBackend >= finalizingThreshold) {
          if (finalizingSinceRef.current === null) {
            finalizingSinceRef.current = Date.now()
          }
        } else {
          finalizingSinceRef.current = null
        }
      }
    },
    onCompleted: (payload: unknown) => {
      const completedPayload = toCompletedPayload(payload)
        if (completedPayload.job_id === jobId || !jobId) {
          finalizingSinceRef.current = null
          setIsComplete(true)
        if (completedPayload.result_type === 'summary' && completedPayload.result_id) {
          navigate(`/summary/${completedPayload.result_id}`, { replace: true })
        } else if (completedPayload.result_type === 'quiz' && completedPayload.result_id) {
          navigate(`/quiz/take/${completedPayload.result_id}`, { replace: true })
        } else if (completedPayload.result_type === 'flashcard' && completedPayload.result_id) {
          navigate(`/flashcards/study/${completedPayload.result_id}`, { replace: true })
        } else if (completedPayload.result_type === 'presentation' && completedPayload.result_id) {
          navigate(`/presentations/${completedPayload.result_id}`, { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      }
    },
    onError: (payload: unknown) => {
      const errorPayload = toErrorPayload(payload)
      if (errorPayload.job_id === jobId || !jobId) {
        finalizingSinceRef.current = null
        setError(errorPayload.error_message || 'Processing failed')
      }
    },
  })

  // Poll job status as fallback if WebSocket isn't connected
  useEffect(() => {
    if (!jobId || isComplete || error) return

    let cancelled = false
    let timeoutId: number | undefined
    let consecutiveFailures = 0

    const scheduleNext = (delay: number) => {
      if (cancelled) return
      timeoutId = window.setTimeout(runPoll, delay)
    }

    const runPoll = async () => {
      if (cancelled) return

      try {
        const data = await api.jobs.get(jobId)

        consecutiveFailures = 0
        setPollWarning('')
        setJob(data)

        const stepNameLower = String(stepNameRef.current || '').toLowerCase()
        const isFinalizingSignal = currentStepRef.current >= 3 || stepNameLower.includes('final')
        if (isFinalizingSignal) {
          if (finalizingSinceRef.current === null) {
            finalizingSinceRef.current = Date.now()
          }
        } else {
          finalizingSinceRef.current = null
        }

        if (data.status === 'completed') {
          finalizingSinceRef.current = null
          setIsComplete(true)
          if (data.type === 'summary-generation') {
            navigate(`/summary/${data.reference_id}`, { replace: true })
          } else if (data.type === 'quiz-generation') {
            navigate(`/quiz/take/${data.reference_id}`, { replace: true })
          } else if (data.type === 'flashcard-generation') {
            navigate(`/flashcards/study/${data.reference_id}`, { replace: true })
          } else if (data.type === 'presentation') {
            navigate(`/presentations/${data.reference_id}`, { replace: true })
          } else {
            navigate('/dashboard', { replace: true })
          }
          return // Stop polling
        } else if (data.status === 'failed') {
          setError(data.error_message || 'Processing failed')

          const msg = String(data.error_message || '').toLowerCase()
          if (msg.includes('analyz')) {
            setCurrentStep(0)
          } else if (msg.includes('transcript')) {
            setCurrentStep(1)
          } else if (msg.includes('gemini') || msg.includes('summary')) {
            setCurrentStep(2)
          } else {
            setCurrentStep(2)
          }

          return
        }

        if (data.status === 'processing' && data.reference_id && finalizingSinceRef.current !== null && Date.now() - finalizingSinceRef.current >= FINALIZING_STALE_MS) {
          try {
            if (data.type === 'summary-generation') {
              const summary = await api.summaries?.get?.(data.reference_id)
              const hasReadyContent = Boolean(
                summary &&
                (summary.content_raw || summary.cornell_summary || summary.content || summary.body),
              )

              if (hasReadyContent) {
                setIsComplete(true)
                navigate(`/summary/${data.reference_id}`, { replace: true })
                return
              }
            }

            if (data.type === 'presentation') {
              const presentation = await api.presentations.get(data.reference_id)
              if (presentation && presentation.slides.length > 0) {
                setIsComplete(true)
                navigate(`/presentations/${data.reference_id}`, { replace: true })
                return
              }
            }
          } catch {
            // keep polling when the result is not ready yet
          }
        }

        scheduleNext(POLL_BASE_MS)
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            setError('Session expired. Redirecting to login...')
            navigate('/login', { replace: true })
            return
          }

          if (err.status === 403) {
            setError('You do not have access to this job.')
            navigate('/dashboard', { replace: true })
            return
          }

          if (err.status === 404) {
            setError('Job not found.')
            navigate('/dashboard', { replace: true })
            return
          }
        }

        consecutiveFailures += 1

        const message = err instanceof Error ? err.message : 'Unknown polling error'
        console.error(
          `[ProcessingPage] job polling failed (${consecutiveFailures}/${POLL_MAX_FAILURES}) for ${jobId}:`,
          message,
        )

        const backoffMs = Math.min(POLL_BASE_MS * Math.pow(2, consecutiveFailures - 1), POLL_MAX_MS)
        setPollWarning(`Live updates are unstable. Retrying in ${Math.round(backoffMs / 1000)}s...`)

        if (consecutiveFailures >= POLL_MAX_FAILURES) {
          navigate('/summaries')
          return
        }

        scheduleNext(backoffMs)
      }
    }

    runPoll()

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [jobId, isComplete, error, navigate])

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto py-12">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-bold mb-2">
            {isComplete ? 'Processing Complete!' : error ? 'Processing Failed' : 'Processing Your Content'}
          </h1>
          <p className="text-muted-foreground">
            {isComplete
              ? 'Redirecting to your results...'
              : error
                ? error
                : 'Please wait while we generate your study materials.'}
          </p>
          {!error && pollWarning && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {pollWarning}
            </p>
          )}
        </div>

        <Card className="mb-8">
          <CardContent className="p-8">
            {/* File Info */}
            <div className="flex items-center gap-4 mb-8 p-4 bg-secondary/30 rounded-lg border border-secondary">
              <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                <FileAudio className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-medium">
                  {job?.type?.replace('-', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Content Processing'}
                </h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Job {jobId?.slice(0, 8)}
                  </span>
                </div>
              </div>
            </div>

            {/* Stepper */}
            <div className="space-y-6 relative">
              <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-secondary -z-10" />
              {steps.map((step, index) => {
                const isCompleted = isComplete || index < currentStep
                const isCurrent = !isComplete && !error && index === currentStep
                const isPending = !isComplete && index > currentStep
                const isFailed = error && index === currentStep
                return (
                  <div key={index} className="flex gap-4 items-start bg-card z-10">
                    <div className="flex-shrink-0 mt-0.5">
                      {isCompleted ? (
                        <CheckCircle2 className="h-10 w-10 text-green-500 bg-card" />
                      ) : isFailed ? (
                        <XCircle className="h-10 w-10 text-destructive bg-card" />
                      ) : isCurrent ? (
                        <Loader2 className="h-10 w-10 text-primary animate-spin bg-card" />
                      ) : (
                        <Circle className="h-10 w-10 text-muted-foreground/30 bg-card" />
                      )}
                    </div>
                    <div className={cn('pt-1 transition-opacity duration-500', isPending ? 'opacity-40' : 'opacity-100')}>
                      <h3 className={cn('font-medium text-base', isCurrent && 'text-primary', isFailed && 'text-destructive')}>
                        {step.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {isCurrent && stepName ? stepName : step.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          {error ? (
            <div className="space-x-4">
              <Button onClick={() => navigate('/create')}>Try Again</Button>
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                Go to Dashboard
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (jobId) api.jobs.cancel(jobId).catch(() => { })
                navigate('/create')
              }}
            >
              Cancel Processing
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
