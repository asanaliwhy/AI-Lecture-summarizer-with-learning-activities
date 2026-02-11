import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Progress } from '../components/ui/Progress'
import { Card } from '../components/ui/Card'
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Flag,
  HelpCircle,
  X,
  PauseCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '../lib/utils'

export function QuizTakePage() {
  const navigate = useNavigate()
  const { quizId } = useParams()
  const [quiz, setQuiz] = useState<any>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [showHint, setShowHint] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timer, setTimer] = useState(0)

  // Fetch quiz and start attempt
  useEffect(() => {
    if (!quizId) return
    async function init() {
      try {
        const quizData = await api.quizzes.get(quizId!)
        setQuiz(quizData)
        const { attempt } = await api.quizzes.startAttempt(quizId!)
        setAttemptId(attempt.id)
      } catch {
        setQuiz(null)
      } finally {
        setIsLoading(false)
      }
    }
    init()
  }, [quizId])

  // Timer
  useEffect(() => {
    if (isLoading || !quiz) return
    const interval = setInterval(() => setTimer(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [isLoading, quiz])

  const questions = quiz?.questions || []
  const totalQuestions = questions.length || 1
  const progress = ((currentQuestion + 1) / totalQuestions) * 100
  const currentQ = questions[currentQuestion]

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const saveAnswer = useCallback(async (questionIdx: number, answerIdx: number) => {
    const newAnswers = { ...answers, [questionIdx]: answerIdx }
    setAnswers(newAnswers)
    if (attemptId) {
      api.quizzes.saveProgress(attemptId, {
        question_index: questionIdx,
        answer_index: answerIdx,
      }).catch(() => { })
    }
  }, [answers, attemptId])

  const handleSelectAnswer = (index: number) => {
    setSelectedAnswer(index)
    saveAnswer(currentQuestion, index)
  }

  const handleNext = async () => {
    if (currentQuestion < totalQuestions - 1) {
      setCurrentQuestion(prev => prev + 1)
      setSelectedAnswer(answers[currentQuestion + 1] ?? null)
      setShowHint(false)
    } else {
      // Submit quiz
      if (!attemptId) return
      setIsSubmitting(true)
      try {
        const result = await api.quizzes.submitAttempt(attemptId)
        navigate(`/quiz/results/${result.attempt?.id || attemptId}`)
      } catch {
        navigate('/dashboard')
      }
    }
  }

  const handlePrev = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1)
      setSelectedAnswer(answers[currentQuestion - 1] ?? null)
      setShowHint(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!quiz || questions.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-6">
        <h2 className="text-2xl font-bold mb-2">Quiz Not Found</h2>
        <p className="text-muted-foreground mb-6">This quiz may still be generating or doesn't exist.</p>
        <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal Header */}
      <header className="h-16 border-b flex items-center justify-between px-6 bg-card sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <X className="h-5 w-5 text-muted-foreground" />
          </Button>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{quiz.title || 'Quiz'}</span>
            <span className="text-xs text-muted-foreground">
              Question {currentQuestion + 1} of {totalQuestions}
            </span>
          </div>
        </div>

        <div className="flex-1 max-w-md mx-8 hidden md:block">
          <Progress value={progress} className="h-2" />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-mono bg-secondary/50 px-3 py-1.5 rounded-md">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{formatTime(timer)}</span>
          </div>
          <Button variant="ghost" size="sm" className="hidden sm:flex">
            <PauseCircle className="h-4 w-4 mr-2" />
            Pause
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full">
        <Card className="w-full shadow-lg border-0 md:border">
          <div className="p-8 md:p-12 space-y-8">
            {/* Question */}
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">
                  {currentQ?.type === 'true_false' ? 'True / False' : 'Multiple Choice'}
                </span>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-yellow-600">
                  <Flag className="h-4 w-4 mr-2" />
                  Flag
                </Button>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold leading-tight text-foreground">
                {currentQ?.question || currentQ?.text || 'Loading...'}
              </h2>
            </div>

            {/* Answers */}
            <div className="grid grid-cols-1 gap-4">
              {(currentQ?.options || currentQ?.answers || []).map((answer: string, index: number) => (
                <button
                  key={index}
                  onClick={() => handleSelectAnswer(index)}
                  className={cn(
                    'flex items-center p-4 md:p-5 rounded-xl border-2 text-left transition-all hover:bg-secondary/30',
                    selectedAnswer === index
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-muted bg-card',
                  )}
                >
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full border-2 flex items-center justify-center mr-4 font-semibold text-sm transition-colors',
                      selectedAnswer === index
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground text-muted-foreground',
                    )}
                  >
                    {String.fromCharCode(65 + index)}
                  </div>
                  <span className="text-lg font-medium">{answer}</span>
                </button>
              ))}
            </div>

            {/* Hint Section */}
            {showHint && currentQ?.hint && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-3">
                  <HelpCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-900 text-sm">Hint</h4>
                    <p className="text-blue-800 text-sm mt-1">{currentQ.hint}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="bg-muted/30 p-6 border-t flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handlePrev}
              disabled={currentQuestion === 0}
              className="text-muted-foreground"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            <div className="flex items-center gap-4">
              {!showHint && currentQ?.hint && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHint(true)}
                  className="text-muted-foreground"
                >
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Show Hint
                </Button>
              )}
              <Button
                onClick={handleNext}
                disabled={selectedAnswer === null || isSubmitting}
                size="lg"
                className="px-8"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {currentQuestion === totalQuestions - 1 ? 'Finish Quiz' : 'Next Question'}
                {!isSubmitting && <ChevronRight className="h-4 w-4 ml-2" />}
              </Button>
            </div>
          </div>
        </Card>
      </main>

      {/* Mobile Progress */}
      <div className="md:hidden h-1 bg-secondary">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}
