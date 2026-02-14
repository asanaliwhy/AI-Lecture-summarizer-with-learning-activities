import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
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
  const [currentStep, setCurrentStep] = useState(0)
  const [stepName, setStepName] = useState('Analyzing content...')
  const [job, setJob] = useState<any>(null)
  const [error, setError] = useState('')
  const [isComplete, setIsComplete] = useState(false)

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
    onStatusUpdate: (payload) => {
      if (payload.job_id === jobId || !jobId) {
        const stepFromBackend = Number(payload.step || 1)
        setCurrentStep(Math.max(0, stepFromBackend - 1))
        setStepName(payload.step_name || '')
      }
    },
    onCompleted: (payload) => {
      if (payload.job_id === jobId || !jobId) {
        setIsComplete(true)
        // Navigate to the result
        setTimeout(() => {
          if (payload.result_type === 'summary') {
            navigate(`/summary/${payload.result_id}`)
          } else if (payload.result_type === 'quiz') {
            navigate(`/quiz/take/${payload.result_id}`)
          } else if (payload.result_type === 'flashcard') {
            navigate(`/flashcards/study/${payload.result_id}`)
          } else {
            navigate('/dashboard')
          }
        }, 1500)
      }
    },
    onError: (payload) => {
      if (payload.job_id === jobId || !jobId) {
        setError(payload.error_message || 'Processing failed')
      }
    },
  })

  // Poll job status as fallback if WebSocket isn't connected
  useEffect(() => {
    if (!jobId || isComplete || error) return
    const interval = setInterval(async () => {
      try {
        const data = await api.jobs.get(jobId)
        setJob(data)
        if (data.status === 'completed') {
          setIsComplete(true)
          clearInterval(interval)
          if (data.type === 'summary-generation') {
            navigate(`/summary/${data.reference_id}`)
          } else if (data.type === 'quiz-generation') {
            navigate(`/quiz/take/${data.reference_id}`)
          } else if (data.type === 'flashcard-generation') {
            navigate(`/flashcards/study/${data.reference_id}`)
          } else {
            navigate('/dashboard')
          }
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

          clearInterval(interval)
        }
      } catch { }
    }, 5000)
    return () => clearInterval(interval)
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
