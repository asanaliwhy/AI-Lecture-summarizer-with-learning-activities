import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { useToast } from '../components/ui/Toast'
import {
  CheckCircle2,
  XCircle,
  Trophy,
  Target,
  RotateCcw,
  Download,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { cn } from '../lib/utils'

export function QuizResultsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { attemptId } = useParams()
  const [attempt, setAttempt] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null)

  const safeParseJSON = (value: any) => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  const toNumber = (value: any): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value)
    }
    return null
  }

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

  const attemptMeta = attempt?.attempt || attempt
  const quizMeta = attempt?.quiz || attempt
  const reviewQuestionsRaw = attempt?.questions || attempt?.review || quizMeta?.questions || []
  const reviewQuestionsParsed = safeParseJSON(reviewQuestionsRaw)
  const reviewQuestions = Array.isArray(reviewQuestionsParsed) ? reviewQuestionsParsed : []

  const rawAttemptAnswers = safeParseJSON(
    attemptMeta?.answers ??
    attemptMeta?.answers_json ??
    attempt?.answers ??
    attempt?.answers_json,
  )

  const answerMap = new Map<number, number>()
  if (Array.isArray(rawAttemptAnswers)) {
    rawAttemptAnswers.forEach((entry: any) => {
      const qIdx = toNumber(entry?.question_index ?? entry?.questionIndex)
      const aIdx = toNumber(entry?.answer_index ?? entry?.answerIndex ?? entry?.selected_index)
      if (qIdx !== null && aIdx !== null) {
        answerMap.set(qIdx, aIdx)
      }
    })
  } else if (rawAttemptAnswers && typeof rawAttemptAnswers === 'object') {
    Object.entries(rawAttemptAnswers).forEach(([questionIndex, answerIndex]) => {
      const qIdx = toNumber(questionIndex)
      const aIdx = toNumber(answerIndex)
      if (qIdx !== null && aIdx !== null) {
        answerMap.set(qIdx, aIdx)
      }
    })
  }

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

  const score = attemptMeta?.score_percent ?? attemptMeta?.score ?? quizMeta?.last_score ?? 0
  const totalQuestions = quizMeta?.question_count ?? attemptMeta?.total_questions ?? reviewQuestions.length ?? 0
  const correctCount = attemptMeta?.correct_count ?? Math.round((score / 100) * totalQuestions)
  const incorrectCount = totalQuestions - correctCount
  const timeTaken = attemptMeta?.time_taken_seconds ?? attemptMeta?.time_taken ?? attemptMeta?.duration ?? ''
  const quizTitle = quizMeta?.title ?? attemptMeta?.quiz_title ?? 'Quiz'
  const quizId = attemptMeta?.quiz_id ?? quizMeta?.id ?? null
  const summaryId = quizMeta?.summary_id ?? attemptMeta?.summary_id ?? null
  const isPass = score >= 70

  // Questions with answers for detailed review
  const questions = reviewQuestions

  const formatTime = (seconds: number | string) => {
    if (typeof seconds === 'string') return seconds
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s === 0 ? `${m}m` : `${m}m ${s}s`
  }

  const sanitizeFileName = (value: string) => {
    return value
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'quiz-results'
  }

  const handleDownloadPdf = async () => {
    if (isExportingPdf) return

    try {
      setIsExportingPdf(true)
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 42
      const contentWidth = pageWidth - margin * 2
      let y = margin

      const ensureSpace = (heightNeeded: number) => {
        if (y + heightNeeded > pageHeight - margin) {
          doc.addPage()
          y = margin
        }
      }

      const writeWrapped = (text: string, size = 11, bold = false, gap = 6) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setFontSize(size)
        const lines = doc.splitTextToSize(text, contentWidth) as string[]
        lines.forEach((line) => {
          ensureSpace(size + 6)
          doc.text(line, margin, y)
          y += size + 4
        })
        y += gap
      }

      const fileTitle = sanitizeFileName(`${quizTitle} quiz results`)

      writeWrapped(`${quizTitle} — Quiz Results`, 18, true, 4)
      writeWrapped(`Score: ${score}% (${correctCount}/${totalQuestions})`, 12, true, 2)
      writeWrapped(`Result: ${isPass ? 'Pass' : 'Fail'}   Time: ${timeTaken ? formatTime(timeTaken) : '-'}`, 11, false, 10)

      if (questions.length > 0) {
        writeWrapped('Detailed Review', 14, true, 6)
      }

      questions.forEach((q: any, index: number) => {
        const options = Array.isArray(q.options)
          ? q.options
          : Array.isArray(q.answers)
            ? q.answers
            : []

        const selectedIdx = toNumber(
          q.user_answer_index ??
          q.answer_index ??
          q.selected_index ??
          q.user_answer ??
          answerMap.get(index),
        )

        const correctIdx = toNumber(q.correct_index ?? q.correctIndex)

        const selectedLabel =
          selectedIdx !== null && options[selectedIdx] !== undefined
            ? options[selectedIdx]
            : null
        const correctLabel =
          correctIdx !== null && options[correctIdx] !== undefined
            ? options[correctIdx]
            : q.correct_answer ?? q.correctAnswer

        const fallbackUserAnswer =
          (typeof q.user_answer === 'string' && q.user_answer) ||
          (typeof q.userAnswer === 'string' && q.userAnswer) ||
          ''

        const fallbackCorrectAnswer =
          (typeof q.correct_answer === 'string' && q.correct_answer) ||
          (typeof q.correctAnswer === 'string' && q.correctAnswer) ||
          ''

        const userAnswerText = selectedLabel || fallbackUserAnswer || 'No answer'
        const correctAnswerText = correctLabel || fallbackCorrectAnswer || 'N/A'

        const explicitIsCorrect =
          typeof q.is_correct === 'boolean'
            ? q.is_correct
            : typeof q.isCorrect === 'boolean'
              ? q.isCorrect
              : null

        const isCorrectAnswer =
          explicitIsCorrect ??
          (selectedIdx !== null && correctIdx !== null
            ? selectedIdx === correctIdx
            : userAnswerText !== 'No answer' && correctAnswerText !== 'N/A' && userAnswerText === correctAnswerText)

        writeWrapped(`${index + 1}. ${q.question || q.text || `Question ${index + 1}`}`, 12, true, 2)
        writeWrapped(`Your answer: ${userAnswerText}`, 11, false, 2)
        writeWrapped(`Correct answer: ${correctAnswerText}`, 11, false, 2)
        writeWrapped(`Result: ${isCorrectAnswer ? 'Correct' : 'Incorrect'}`, 11, false, 4)

        if (q.explanation) {
          writeWrapped(`Explanation: ${q.explanation}`, 10, false, 8)
        } else {
          y += 6
        }
      })

      doc.save(`${fileTitle}.pdf`)
      toast.success('PDF downloaded')
    } catch {
      toast.error('Failed to download PDF')
    } finally {
      setIsExportingPdf(false)
    }
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
          <Button size="lg" onClick={() => quizId && navigate(`/quiz/take/${quizId}`)} disabled={!quizId}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Retake Quiz
          </Button>
          <Button variant="outline" size="lg" onClick={handleDownloadPdf} disabled={isExportingPdf}>
            {isExportingPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isExportingPdf ? 'Preparing PDF...' : 'Download PDF'}
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
                const options = Array.isArray(q.options)
                  ? q.options
                  : Array.isArray(q.answers)
                    ? q.answers
                    : []

                const selectedIdx = toNumber(
                  q.user_answer_index ??
                  q.answer_index ??
                  q.selected_index ??
                  q.user_answer ??
                  answerMap.get(index),
                )

                const correctIdx = toNumber(q.correct_index ?? q.correctIndex)

                const selectedLabel =
                  selectedIdx !== null && options[selectedIdx] !== undefined
                    ? options[selectedIdx]
                    : null
                const correctLabel =
                  correctIdx !== null && options[correctIdx] !== undefined
                    ? options[correctIdx]
                    : q.correct_answer ?? q.correctAnswer

                const fallbackUserAnswer =
                  (typeof q.user_answer === 'string' && q.user_answer) ||
                  (typeof q.userAnswer === 'string' && q.userAnswer) ||
                  ''

                const fallbackCorrectAnswer =
                  (typeof q.correct_answer === 'string' && q.correct_answer) ||
                  (typeof q.correctAnswer === 'string' && q.correctAnswer) ||
                  ''

                const userAnswerText = selectedLabel || fallbackUserAnswer || 'No answer'
                const correctAnswerText = correctLabel || fallbackCorrectAnswer || 'N/A'

                const explicitIsCorrect =
                  typeof q.is_correct === 'boolean'
                    ? q.is_correct
                    : typeof q.isCorrect === 'boolean'
                      ? q.isCorrect
                      : null

                const isCorrect =
                  explicitIsCorrect ??
                  (selectedIdx !== null && correctIdx !== null
                    ? selectedIdx === correctIdx
                    : userAnswerText !== 'No answer' && correctAnswerText !== 'N/A' && userAnswerText === correctAnswerText)

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
                            Your answer: {userAnswerText}
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
                            <div className="font-medium">{userAnswerText}</div>
                          </div>
                          {!isCorrect && (
                            <div className="p-4 rounded-lg border bg-green-50 border-green-200">
                              <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70 text-green-800">
                                Correct Answer
                              </div>
                              <div className="font-medium text-green-900">{correctAnswerText}</div>
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
                onClick={() => {
                  if (summaryId) {
                    navigate(`/flashcards/create/${summaryId}`)
                    return
                  }
                  toast.error('Summary is not available for this quiz')
                }}
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
