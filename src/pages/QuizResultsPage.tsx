import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import {
  CheckCircle2,
  XCircle,
  Trophy,
  Target,
  RotateCcw,
  Share2,
  Download,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { cn } from '../lib/utils'

export function QuizResultsPage() {
  const navigate = useNavigate()
  const { attemptId } = useParams()
  const [attempt, setAttempt] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null)

  useEffect(() => {
    if (!attemptId) return
    async function load() {
      try {
        const data = await api.quizzes.getAttempt(attemptId!)
        setAttempt(data)
      } catch {
        // If getAttempt fails, try fetching as quiz ID (for viewing latest results)
        try {
          const quizData = await api.quizzes.get(attemptId!)
          setAttempt(quizData)
        } catch {
          setAttempt(null)
        }
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [attemptId])

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    )
  }

  if (!attempt) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 text-center">
          <h2 className="text-2xl font-bold mb-2">Results Not Found</h2>
          <p className="text-muted-foreground mb-6">This quiz attempt may not exist or hasn't been completed yet.</p>
          <Button onClick={() => navigate('/quizzes')}>Back to Quizzes</Button>
        </div>
      </AppLayout>
    )
  }

  const score = attempt.score ?? attempt.last_score ?? 0
  const totalQuestions = attempt.total_questions ?? attempt.question_count ?? attempt.questions?.length ?? 0
  const correctCount = attempt.correct_count ?? Math.round((score / 100) * totalQuestions)
  const incorrectCount = totalQuestions - correctCount
  const timeTaken = attempt.time_taken ?? attempt.duration ?? ''
  const quizTitle = attempt.quiz_title ?? attempt.title ?? 'Quiz'
  const quizId = attempt.quiz_id ?? attempt.id
  const isPass = score >= 70

  // Questions with answers for detailed review
  const questions = attempt.review ?? attempt.questions ?? []

  const formatTime = (seconds: number | string) => {
    if (typeof seconds === 'string') return seconds
    const m = Math.floor(seconds / 60)
    return `${m}m`
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8">
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className={cn(
            'inline-flex items-center justify-center p-3 rounded-full mb-4',
            isPass ? 'bg-yellow-100' : 'bg-orange-100'
          )}>
            <Trophy className={cn('h-8 w-8', isPass ? 'text-yellow-600' : 'text-orange-600')} />
          </div>
          <h1 className="text-4xl font-bold mb-2">
            {isPass ? 'Great Job!' : 'Keep Practicing!'}
          </h1>
          <p className="text-muted-foreground">
            {isPass
              ? `You passed the ${quizTitle} quiz.`
              : `You scored ${score}% on the ${quizTitle} quiz. Try again!`}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <Card className="text-center py-6 border-2 border-primary/10 bg-primary/5">
            <div className="text-4xl font-bold text-primary mb-1">{score}%</div>
            <div className="text-sm font-medium text-muted-foreground">Total Score</div>
          </Card>
          <Card className="text-center py-6">
            <div className="text-4xl font-bold text-green-600 mb-1">{correctCount}/{totalQuestions}</div>
            <div className="text-sm font-medium text-muted-foreground">Correct Answers</div>
          </Card>
          <Card className="text-center py-6">
            <div className="text-4xl font-bold text-blue-600 mb-1">
              {timeTaken ? formatTime(timeTaken) : '-'}
            </div>
            <div className="text-sm font-medium text-muted-foreground">Time Taken</div>
          </Card>
          <Card className="text-center py-6">
            <div className="text-4xl font-bold text-purple-600 mb-1">
              {isPass ? '✓ Pass' : '✗ Fail'}
            </div>
            <div className="text-sm font-medium text-muted-foreground">Result</div>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-4 mb-16">
          <Button size="lg" onClick={() => navigate(`/quiz/take/${quizId}`)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Retake Quiz
          </Button>
          <Button variant="outline" size="lg">
            <Share2 className="mr-2 h-4 w-4" />
            Share Result
          </Button>
          <Button variant="outline" size="lg">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>

        {/* Detailed Review */}
        {questions.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Detailed Review</h2>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  {correctCount} Correct
                </Badge>
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  {incorrectCount} Incorrect
                </Badge>
              </div>
            </div>

            <div className="space-y-4">
              {questions.map((q: any, index: number) => {
                const qId = q.id || index
                const isCorrect = q.is_correct ?? (q.user_answer === q.correct_answer)
                return (
                  <Card
                    key={qId}
                    className={cn(
                      'overflow-hidden transition-all',
                      expandedQuestion === qId ? 'ring-1 ring-primary' : '',
                    )}
                  >
                    <div
                      className="p-6 cursor-pointer hover:bg-secondary/20 transition-colors flex items-start gap-4"
                      onClick={() => setExpandedQuestion(expandedQuestion === qId ? null : qId)}
                    >
                      <div className="mt-1">
                        {isCorrect ? (
                          <CheckCircle2 className="h-6 w-6 text-green-500" />
                        ) : (
                          <XCircle className="h-6 w-6 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h3 className="font-medium text-lg pr-8">
                            {q.question || q.text || `Question ${index + 1}`}
                          </h3>
                          {expandedQuestion === qId ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        {expandedQuestion !== qId && (
                          <p className={cn('text-sm mt-2', isCorrect ? 'text-green-600' : 'text-red-600')}>
                            Your answer: {q.user_answer || 'No answer'}
                          </p>
                        )}
                      </div>
                    </div>

                    {expandedQuestion === qId && (
                      <div className="px-6 pb-6 pt-0 pl-14 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                          <div className={cn(
                            'p-4 rounded-lg border',
                            isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
                          )}>
                            <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">Your Answer</div>
                            <div className="font-medium">{q.user_answer || 'No answer'}</div>
                          </div>
                          {!isCorrect && (
                            <div className="p-4 rounded-lg border bg-green-50 border-green-200">
                              <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70 text-green-800">
                                Correct Answer
                              </div>
                              <div className="font-medium text-green-900">{q.correct_answer}</div>
                            </div>
                          )}
                        </div>
                        {q.explanation && (
                          <div className="mt-4 p-4 bg-secondary/30 rounded-lg">
                            <div className="flex items-start gap-2">
                              <Target className="h-4 w-4 text-primary mt-1" />
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                <span className="font-semibold text-foreground">Explanation: </span>
                                {q.explanation}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>

            <div className="mt-12 bg-slate-900 rounded-xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-bold mb-2">Master your mistakes</h3>
                <p className="text-slate-300">
                  Generate a flashcard deck specifically for the questions you missed.
                </p>
              </div>
              <Button
                variant="secondary"
                size="lg"
                className="whitespace-nowrap"
                onClick={() => navigate(`/flashcards/create/${quizId}`)}
              >
                Create Flashcards
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
