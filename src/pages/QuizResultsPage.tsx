import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { SummaryChatPanel } from '../components/SummaryChatPanel'
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
  MessageCircle,
} from 'lucide-react'
import { cn } from '../lib/utils'

interface QuizQuestion {
  id: string
  text: string
  options: string[]
  correctIndex: number
  explanation: string
  userAnswer?: number
  isCorrect?: boolean
}

interface QuizAttempt {
  score: number
  correctCount: number
  totalCount: number
  passed: boolean
  timeTaken: number
  answers: QuizAnswer[]
}

interface QuizAnswer {
  questionId: string
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
}

type QuizAttemptAnswerEntry = {
  question_index?: number | string
  questionIndex?: number | string
  answer_index?: number | string
  answerIndex?: number | string
  selected_index?: number | string
}

type QuizReviewQuestion = {
  id?: string | number
  questionNumber?: number | string
  question?: string
  text?: string
  options?: string[]
  answers?: string[]
  user_answer_index?: number | string
  answer_index?: number | string
  selected_index?: number | string
  user_answer?: number | string
  userAnswer?: string
  correct_index?: number | string
  correctIndex?: number | string
  correct_answer?: string
  correctAnswer?: string
  is_correct?: boolean
  isCorrect?: boolean
  explanation?: string
}

type QuizAttemptMeta = {
  score_percent?: number | string
  score?: number | string
  total_questions?: number | string
  correct_count?: number | string
  time_taken_seconds?: number | string | null
  time_taken?: number | string | null
  duration?: number | string | null
  quiz_id?: string | null
  summary_id?: string | null
  content_id?: string | null
  contentId?: string | null
  quiz_title?: string
  answers?: unknown
  answers_json?: unknown
}

type QuizMeta = {
  id?: string
  title?: string
  content_id?: string | null
  contentId?: string | null
  created_at?: string
  timeTaken?: number | string | null
  duration?: number | string | null
  time_taken_seconds?: number | string | null
  time_taken?: number | string | null
  question_count?: number | string
  last_score?: number | string | null
  summary_id?: string | null
  questions?: unknown
}

type QuizAttemptResponse = {
  attempt?: QuizAttemptMeta
  quiz?: QuizMeta
  id?: string
  created_at?: string
  timeTaken?: number | string | null
  questions?: unknown
  review?: unknown
  answers?: unknown
  answers_json?: unknown
  score_percent?: number | string | null
  score?: number | string | null
  total_questions?: number | string | null
  correct_count?: number | string | null
  time_taken_seconds?: number | string | null
  time_taken?: number | string | null
  duration?: number | string | null
  quiz_id?: string | null
  summary_id?: string | null
  content_id?: string | null
  contentId?: string | null
  quiz_title?: string
  title?: string
  question_count?: number | string
  last_score?: number | string | null
}

function buildQuizChatMessage(
  question: QuizReviewQuestion,
  userAnswer: string,
  correctAnswer: string,
  isCorrect: boolean,
): string {
  return `I just completed a quiz and ${isCorrect ? 'answered this question correctly but want to understand it deeper' : 'got this question wrong'}.

**Question:** ${question.question || question.text || 'Question'}

**My answer:** ${userAnswer}

**Correct answer:** ${correctAnswer}

**Explanation:** ${question.explanation ?? 'No explanation provided.'}

Can you help me understand this concept better and explain why ${isCorrect ? 'this is the correct answer' : 'my answer was incorrect'}?`
}

export async function exportQuizResultsPdf(params: {
  attemptData: QuizAttemptResponse
  preferredFileTitle?: string
}) {
  const { attemptData, preferredFileTitle } = params
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const safeParseJSON = (value: unknown): unknown => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value)
    }
    return null
  }

  const attemptMeta = attemptData?.attempt || attemptData || {}
  const quizMeta = attemptData?.quiz || attemptData || {}
  const reviewQuestionsRaw = attemptData?.questions || attemptData?.review || quizMeta?.questions || []
  const reviewQuestionsParsed = safeParseJSON(reviewQuestionsRaw)
  const reviewQuestions = Array.isArray(reviewQuestionsParsed) ? reviewQuestionsParsed : []

  const rawAttemptAnswers = safeParseJSON(
    attemptMeta?.answers ??
    attemptMeta?.answers_json ??
    attemptData?.answers ??
    attemptData?.answers_json,
  )

  const answerMap = new Map<number, number>()
  if (Array.isArray(rawAttemptAnswers)) {
    rawAttemptAnswers.forEach((entry: QuizAttemptAnswerEntry) => {
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

  const score = toNumber(attemptMeta?.score_percent ?? attemptMeta?.score ?? quizMeta?.last_score) ?? 0
  const totalQuestions = toNumber(quizMeta?.question_count) ?? reviewQuestions.length ?? 0
  const quizTitle = quizMeta?.title ?? attemptMeta?.quiz_title ?? 'Quiz'

  const sanitizeFileName = (value: string) => {
    return value
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'quiz-results'
  }

  const margin = 42
  const quizPageWidth = doc.internal.pageSize.getWidth()
  const quizPageHeight = doc.internal.pageSize.getHeight()
  const quizContentWidth = quizPageWidth - margin * 2
  let yQuiz = margin

  const ensurePageSpaceQuiz = (h: number) => {
    if (yQuiz + h > quizPageHeight - margin) {
      doc.addPage()
      yQuiz = margin
    }
  }

  const formatPdfDate = (value?: string): string => {
    if (!value) return '-'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '-'
    const dd = String(parsed.getDate()).padStart(2, '0')
    const mm = String(parsed.getMonth() + 1).padStart(2, '0')
    const yyyy = String(parsed.getFullYear())
    return `${dd}.${mm}.${yyyy}`
  }

  const stripInlineMarkdown = (value: string): string =>
    String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()

  const hexToRgb = (hex: string): [number, number, number] => {
    const normalized = hex.replace('#', '').trim()
    const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0, 0, 0]
    const int = Number.parseInt(full, 16)
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
  }

  const setTextHex = (hex: string) => {
    const [r, g, b] = hexToRgb(hex)
    doc.setTextColor(r, g, b)
  }

  const setFillHex = (hex: string) => {
    const [r, g, b] = hexToRgb(hex)
    doc.setFillColor(r, g, b)
  }

  const setDrawHex = (hex: string) => {
    const [r, g, b] = hexToRgb(hex)
    doc.setDrawColor(r, g, b)
  }

  const drawRect = (
    x: number,
    yPos: number,
    w: number,
    h: number,
    mode: 'F' | 'FD' | 'S' | undefined = undefined,
  ) => {
    doc.rect(x, yPos, w, h, mode)
  }

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    doc.line(x1, y1, x2, y2)
  }

  const formatDurationForPdf = (value: unknown): string => {
    const num = toNumber(value)
    if (num === null) {
      return typeof value === 'string' && value.trim() ? value : '-'
    }
    const seconds = Math.max(0, Math.round(num))
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}m ${s}s`
  }

  const fileTitle = sanitizeFileName(preferredFileTitle || `${quizTitle} quiz results`)

  const NAVY = '#1a1a2e'
  const SLATE = '#475569'
  const BODY_COLOR = '#334155'
  const OFF_WHITE = '#f8fafc'
  const RULE = '#e2e8f0'
  const GRAY_LIGHT = '#f1f5f9'
  const GRAY_TEXT = '#94a3b8'
  const GREEN = '#15803d'
  const GREEN_BG = '#f0fdf4'
  const RED = '#b91c1c'
  const RED_BG = '#fff1f2'

  const pdfQuestions = reviewQuestions.map((questionItem: QuizReviewQuestion, index: number) => {
    const options = Array.isArray(questionItem?.options)
      ? questionItem.options
      : Array.isArray(questionItem?.answers)
        ? questionItem.answers
        : []

    const selectedIdx = toNumber(
      questionItem?.user_answer_index ??
      questionItem?.answer_index ??
      questionItem?.selected_index ??
      questionItem?.user_answer ??
      answerMap.get(index),
    )

    const correctIdx = toNumber(questionItem?.correct_index ?? questionItem?.correctIndex)

    const selectedLabel = selectedIdx !== null && options[selectedIdx] !== undefined
      ? options[selectedIdx]
      : null

    const correctLabel = correctIdx !== null && options[correctIdx] !== undefined
      ? options[correctIdx]
      : null

    const userAnswer = stripInlineMarkdown(
      selectedLabel ||
      (typeof questionItem?.userAnswer === 'string' ? questionItem.userAnswer : '') ||
      (typeof questionItem?.user_answer === 'string' ? questionItem.user_answer : '') ||
      'No answer',
    )

    const correctAnswer = stripInlineMarkdown(
      correctLabel ||
      (typeof questionItem?.correctAnswer === 'string' ? questionItem.correctAnswer : '') ||
      (typeof questionItem?.correct_answer === 'string' ? questionItem.correct_answer : '') ||
      'N/A',
    )

    return {
      questionNumber: toNumber(questionItem?.questionNumber) ?? index + 1,
      text: stripInlineMarkdown(questionItem?.question || questionItem?.text || `Question ${index + 1}`),
      userAnswer,
      correctAnswer,
      explanation: stripInlineMarkdown(questionItem?.explanation || ''),
      passed: userAnswer === correctAnswer,
    }
  })

  const total = totalQuestions > 0 ? totalQuestions : pdfQuestions.length
  const correct = pdfQuestions.filter((q) => q.passed).length
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0
  const passedQuiz = percentage >= 60

  const rawDuration =
    quizMeta?.timeTaken ??
    quizMeta?.duration ??
    quizMeta?.time_taken_seconds ??
    quizMeta?.time_taken ??
    attemptMeta?.time_taken_seconds ??
    attemptMeta?.time_taken ??
    attemptMeta?.duration

  const timeText = formatDurationForPdf(rawDuration)
  const generatedDate = formatPdfDate(quizMeta?.created_at || new Date().toISOString())

  const badgeHeight = 16
  const badgeToTitleGap = 28
  ensurePageSpaceQuiz(badgeHeight)
  setFillHex(NAVY)
  drawRect(margin, yQuiz, quizContentWidth, badgeHeight, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setTextHex('#ffffff')
  doc.text('QUIZ RESULTS', margin + 8, yQuiz + 11)
  yQuiz += badgeHeight + badgeToTitleGap

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  setTextHex(NAVY)
  const titleLines = doc.splitTextToSize(`Quiz: ${quizTitle}`, quizContentWidth) as string[]
  for (const line of titleLines) {
    ensurePageSpaceQuiz(28)
    doc.text(line, margin, yQuiz)
    yQuiz += 28
  }
  yQuiz += -7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setTextHex(GRAY_TEXT)
  ensurePageSpaceQuiz(16)
  doc.text(`Generated: ${generatedDate}`, margin, yQuiz)
  yQuiz += 12

  ensurePageSpaceQuiz(20)
  setFillHex(NAVY)
  drawRect(margin, yQuiz, quizContentWidth, 1.5, 'F')
  yQuiz += 20

  const cardX = margin
  const cardY = yQuiz
  const cardW = quizContentWidth
  const leftW = cardW * 0.3
  const statW = (cardW - leftW) / 3
  const cardH = 92

  ensurePageSpaceQuiz(cardH + 5 + 20)

  setFillHex(NAVY)
  drawRect(cardX, cardY, leftW, cardH, 'F')

  setFillHex(OFF_WHITE)
  drawRect(cardX + leftW, cardY, cardW - leftW, cardH, 'F')

  setDrawHex(RULE)
  doc.setLineWidth(0.5)
  drawRect(cardX, cardY, cardW, cardH, 'S')

  for (let i = 1; i <= 2; i += 1) {
    const x = cardX + leftW + statW * i
    drawLine(x, cardY, x, cardY + cardH)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(36)
  setTextHex('#ffffff')
  doc.text(`${percentage}%`, cardX + leftW / 2, cardY + cardH / 2 + 12, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextHex(GRAY_TEXT)

  const statValues = [timeText, `${correct}/${total}`, passedQuiz ? 'Pass' : 'Fail']
  const statLabels = ['TIME', 'SCORE', 'RESULT']
  const statColors = [NAVY, NAVY, passedQuiz ? GREEN : RED]

  for (let i = 0; i < 3; i += 1) {
    const cellX = cardX + leftW + statW * i
    const centerX = cellX + statW / 2

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    setTextHex(statColors[i])
    doc.text(statValues[i], centerX, cardY + 45, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setTextHex(GRAY_TEXT)
    doc.text(statLabels[i], centerX, cardY + 62, { align: 'center' })
  }

  yQuiz += cardH

  const progressHeight = 5
  const progressRatio = total > 0 ? correct / total : 0
  setFillHex(RULE)
  drawRect(margin, yQuiz, quizContentWidth, progressHeight, 'F')
  setFillHex(NAVY)
  drawRect(margin, yQuiz, quizContentWidth * progressRatio, progressHeight, 'F')
  yQuiz += progressHeight

  const separatorTopGap = 35
  const separatorBottomGap = 30
  yQuiz += separatorTopGap
  ensurePageSpaceQuiz(8)
  setDrawHex(NAVY)
  doc.setLineWidth(1.6)
  drawLine(margin, yQuiz, margin + quizContentWidth, yQuiz)
  yQuiz += separatorBottomGap

  ensurePageSpaceQuiz(25)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setTextHex(NAVY)
  doc.text('DETAILED REVIEW', margin, yQuiz)
  yQuiz += 15

  pdfQuestions.forEach((question, index) => {
    const questionTextMaxWidth = Math.max(quizContentWidth - 40, 80)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    const qTextWrapped = doc.splitTextToSize(question.text, questionTextMaxWidth) as string[]
    const qTextHeight = qTextWrapped.length * 15 + 10
    const ansRowHeight = 40
    const explanationValue = question.explanation || 'No explanation provided.'
    const explanationTextMaxWidth = Math.max(quizContentWidth - 30, 80)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const explWrapped = doc.splitTextToSize(explanationValue, explanationTextMaxWidth) as string[]
    const explHeight = explWrapped.length * 14 + 24
    const cardHeight = 22 + 6 + qTextHeight + ansRowHeight + 4 + explHeight + 16
    ensurePageSpaceQuiz(cardHeight)

    const cardStartY = yQuiz
    const textCardY = cardStartY + 22 + 6

    setFillHex(NAVY)
    drawRect(margin, cardStartY, 22, 22, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    setTextHex('#ffffff')
    doc.text(String(question.questionNumber || index + 1), margin + 11, cardStartY + 15, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    setTextHex(NAVY)
    doc.text(`Question ${question.questionNumber || index + 1}`, margin + 32, cardStartY + 15)

    setFillHex(NAVY)
    drawRect(margin, textCardY, 4, qTextHeight, 'F')
    setFillHex(OFF_WHITE)
    setDrawHex(RULE)
    drawRect(margin + 4, textCardY, quizContentWidth - 4, qTextHeight, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    setTextHex(NAVY)
    let qLineY = textCardY + 15
    qTextWrapped.forEach((line) => {
      doc.text(line, margin + 16, qLineY)
      qLineY += 15
    })

    let cursorY = textCardY + qTextHeight + 6

    const passed = question.userAnswer === question.correctAnswer
    const rowBg = passed ? GREEN_BG : RED_BG
    const rowCellWidth = quizContentWidth / 3

    setFillHex(rowBg)
    drawRect(margin, cursorY, quizContentWidth, ansRowHeight, 'F')
    setDrawHex(RULE)
    drawRect(margin, cursorY, quizContentWidth, ansRowHeight, 'S')

    drawLine(margin + rowCellWidth, cursorY, margin + rowCellWidth, cursorY + ansRowHeight)
    drawLine(margin + rowCellWidth * 2, cursorY, margin + rowCellWidth * 2, cursorY + ansRowHeight)

    const answerCells = [
      { label: 'YOUR ANSWER', value: question.userAnswer, valueColor: BODY_COLOR },
      { label: 'CORRECT ANSWER', value: question.correctAnswer, valueColor: BODY_COLOR },
      { label: 'RESULT', value: passed ? 'Correct' : 'Incorrect', valueColor: passed ? GREEN : RED },
    ]

    answerCells.forEach((cell, i) => {
      const cellX = margin + rowCellWidth * i + 10
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      setTextHex(GRAY_TEXT)
      doc.text(cell.label, cellX, cursorY + 12)

      doc.setFont('helvetica', i === 2 ? 'bold' : 'normal')
      doc.setFontSize(10)
      setTextHex(cell.valueColor)
      const valueLine = (doc.splitTextToSize(cell.value, rowCellWidth - 20) as string[])[0] || ''
      doc.text(valueLine, cellX, cursorY + 27)
    })

    cursorY += ansRowHeight + 4

    setFillHex(GRAY_LIGHT)
    setDrawHex(RULE)
    drawRect(margin, cursorY, quizContentWidth, explHeight, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setTextHex(GRAY_TEXT)
    doc.text('EXPLANATION', margin + 12, cursorY + 10)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setTextHex(SLATE)
    let explY = cursorY + 30
    explWrapped.forEach((line) => {
      doc.text(line, margin + 12, explY)
      explY += 14
    })

    yQuiz += cardHeight
  })

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.5)
    drawLine(margin, quizPageHeight - margin + 8, margin + quizContentWidth, quizPageHeight - margin + 8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`Lectura · Page ${i} of ${totalPages}`, quizPageWidth / 2, quizPageHeight - margin + 18, {
      align: 'center',
    })
  }

  doc.save(`${fileTitle}.pdf`)
}

export function QuizResultsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { attemptId } = useParams()

  const [attempt, setAttempt] = useState<QuizAttemptResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [expandedQuestion, setExpandedQuestion] = useState<string | number | null>(null)
  const [chatPrefillMessage, setChatPrefillMessage] = useState('')
  const loadRequestIdRef = useRef(0)

  const safeParseJSON = (value: unknown): unknown => {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value)
    }
    return null
  }

  const loadAttempt = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current

    if (!attemptId) {
      setAttempt(null)
      setLoadError('Quiz attempt ID is missing.')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(null)

    let attemptLoadError: unknown = null
    let loadedData: QuizAttemptResponse | null = null

    try {
      try {
        const data = await api.quizzes.getAttempt(attemptId)
        loadedData = data as QuizAttemptResponse
      } catch (err: unknown) {
        attemptLoadError = err

        // Fallback: If getAttempt fails, try fetching as quiz ID (for latest results view)
        const quizData = await api.quizzes.get(attemptId)
        loadedData = quizData as QuizAttemptResponse
      }
    } catch (err: unknown) {
      if (requestId !== loadRequestIdRef.current) {
        return
      }

      setAttempt(null)
      const fallbackMessage = err instanceof Error ? err.message : ''
      const primaryMessage = attemptLoadError instanceof Error ? attemptLoadError.message : ''
      setLoadError(fallbackMessage || primaryMessage || 'Failed to load quiz results')
    } finally {
      if (requestId === loadRequestIdRef.current) {
        if (loadedData) {
          setAttempt(loadedData)
        }
        setIsLoading(false)
      }
    }
  }, [attemptId])

  useEffect(() => {
    loadAttempt()

    return () => {
      loadRequestIdRef.current += 1
    }
  }, [loadAttempt])

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
    rawAttemptAnswers.forEach((entry: QuizAttemptAnswerEntry) => {
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

  const score = toNumber(attemptMeta?.score_percent ?? attemptMeta?.score ?? quizMeta?.last_score) ?? 0
  const totalQuestions = toNumber(quizMeta?.question_count) ?? reviewQuestions.length ?? 0
  const correctCount = toNumber(attemptMeta?.correct_count) ?? Math.round((score / 100) * totalQuestions)
  const incorrectCount = Math.max(0, totalQuestions - correctCount)
  const timeTaken = attemptMeta?.time_taken_seconds ?? attemptMeta?.time_taken ?? attemptMeta?.duration ?? ''
  const quizTitle = quizMeta?.title ?? attemptMeta?.quiz_title ?? 'Quiz'
  const quizId = attemptMeta?.quiz_id ?? quizMeta?.id ?? null
  const summaryId = quizMeta?.summary_id ?? attemptMeta?.summary_id ?? null
  const quizContentId = quizMeta?.content_id ?? quizMeta?.contentId ?? attemptMeta?.content_id ?? attemptMeta?.contentId ?? null
  const isPass = score >= 70

  const { data: sourceSummaryId, isLoading: isSourceSummaryLoading } = useQuery<string | null>({
    queryKey: ['quiz-source-summary', summaryId, quizContentId],
    queryFn: async (): Promise<string | null> => {
      if (summaryId) {
        const summary = await api.summaries.get(summaryId)
        return summary?.id ?? null
      }

      if (!quizContentId) return null

      const response = await api.summaries.list({ limit: '100' })
      const summaries = response?.summaries ?? []
      const linkedSummary = summaries.find((summary) => (
        summary.content_id === quizContentId || summary.config?.content_id === quizContentId
      ))

      return linkedSummary?.id ?? null
    },
    enabled: Boolean(summaryId || quizContentId),
  })

  const getQuestionReviewData = (questionItem: QuizReviewQuestion, index: number) => {
    const q = questionItem
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

    return {
      qId,
      userAnswerText,
      correctAnswerText,
      isCorrect,
    }
  }

  const getActiveDiscussTarget = () => {
    if (questions.length === 0) return null

    if (expandedQuestion !== null) {
      const expandedIndex = questions.findIndex((questionItem, index) => {
        const q = questionItem as QuizReviewQuestion
        return (q.id || index) === expandedQuestion
      })

      if (expandedIndex >= 0) {
        return {
          question: questions[expandedIndex] as QuizReviewQuestion,
          index: expandedIndex,
        }
      }
    }

    const firstIncorrectIndex = questions.findIndex((questionItem, index) => {
      return !getQuestionReviewData(questionItem as QuizReviewQuestion, index).isCorrect
    })

    const targetIndex = firstIncorrectIndex >= 0 ? firstIncorrectIndex : 0

    return {
      question: questions[targetIndex] as QuizReviewQuestion,
      index: targetIndex,
    }
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
    if (loadError) {
      return (
        <AppLayout>
          <div className="flex flex-col items-center justify-center h-96 text-center">
            <h2 className="text-2xl font-bold mb-2">Failed to load quiz results</h2>
            <p className="text-muted-foreground mb-6">{loadError}</p>
            <div className="flex items-center gap-3">
              <Button onClick={loadAttempt}>Retry</Button>
              <Button variant="outline" onClick={() => navigate('/quizzes')}>Back to Quizzes</Button>
            </div>
          </div>
        </AppLayout>
      )
    }

    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 text-center">
          <h2 className="text-2xl font-bold mb-2">Results Not Found</h2>
          <p className="text-muted-foreground mb-6">This quiz attempt may not exist or hasn't been completed yet.</p>
          <div className="flex items-center gap-3">
            <Button onClick={loadAttempt}>Retry</Button>
            <Button variant="outline" onClick={() => navigate('/quizzes')}>Back to Quizzes</Button>
          </div>
        </div>
      </AppLayout>
    )
  }

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

      const margin = 42
      const quizPageWidth = doc.internal.pageSize.getWidth()
      const quizPageHeight = doc.internal.pageSize.getHeight()
      const quizContentWidth = quizPageWidth - margin * 2
      let yQuiz = margin

      const ensurePageSpaceQuiz = (h: number) => {
        if (yQuiz + h > quizPageHeight - margin) {
          doc.addPage()
          yQuiz = margin
        }
      }

      const formatPdfDate = (value?: string): string => {
        if (!value) return '-'
        const parsed = new Date(value)
        if (Number.isNaN(parsed.getTime())) return '-'
        const dd = String(parsed.getDate()).padStart(2, '0')
        const mm = String(parsed.getMonth() + 1).padStart(2, '0')
        const yyyy = String(parsed.getFullYear())
        return `${dd}.${mm}.${yyyy}`
      }

      const stripInlineMarkdown = (value: string): string =>
        String(value || '')
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/__(.*?)__/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\s+/g, ' ')
          .trim()

      const hexToRgb = (hex: string): [number, number, number] => {
        const normalized = hex.replace('#', '').trim()
        const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized
        if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0, 0, 0]
        const int = Number.parseInt(full, 16)
        return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
      }

      const setTextHex = (hex: string) => {
        const [r, g, b] = hexToRgb(hex)
        doc.setTextColor(r, g, b)
      }

      const setFillHex = (hex: string) => {
        const [r, g, b] = hexToRgb(hex)
        doc.setFillColor(r, g, b)
      }

      const setDrawHex = (hex: string) => {
        const [r, g, b] = hexToRgb(hex)
        doc.setDrawColor(r, g, b)
      }

      const drawRect = (
        x: number,
        yPos: number,
        w: number,
        h: number,
        mode: 'F' | 'FD' | 'S' | undefined = undefined,
      ) => {
        doc.rect(x, yPos, w, h, mode)
      }

      const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
        doc.line(x1, y1, x2, y2)
      }

      const formatDurationForPdf = (value: unknown): string => {
        const num = toNumber(value)
        if (num === null) {
          return typeof value === 'string' && value.trim() ? value : '-'
        }
        const seconds = Math.max(0, Math.round(num))
        if (seconds < 60) return `${seconds}s`
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${m}m ${s}s`
      }

      const fileTitle = sanitizeFileName(`${quizTitle} quiz results`)

      const NAVY = '#1a1a2e'
      const NAVY_MUTED = '#e8e8f0'
      const SLATE = '#475569'
      const BODY_COLOR = '#334155'
      const OFF_WHITE = '#f8fafc'
      const RULE = '#e2e8f0'
      const GRAY_LIGHT = '#f1f5f9'
      const GRAY_TEXT = '#94a3b8'
      const GREEN = '#15803d'
      const GREEN_BG = '#f0fdf4'
      const RED = '#b91c1c'
      const RED_BG = '#fff1f2'

      const pdfQuestions = questions.map((questionItem, index: number) => {
        const q = questionItem as QuizReviewQuestion
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

        const selectedLabel = selectedIdx !== null && options[selectedIdx] !== undefined
          ? options[selectedIdx]
          : null

        const correctLabel = correctIdx !== null && options[correctIdx] !== undefined
          ? options[correctIdx]
          : null

        const userAnswer = stripInlineMarkdown(
          selectedLabel ||
          (typeof q.userAnswer === 'string' ? q.userAnswer : '') ||
          (typeof q.user_answer === 'string' ? q.user_answer : '') ||
          'No answer',
        )

        const correctAnswer = stripInlineMarkdown(
          correctLabel ||
          (typeof q.correctAnswer === 'string' ? q.correctAnswer : '') ||
          (typeof q.correct_answer === 'string' ? q.correct_answer : '') ||
          'N/A',
        )

        return {
          questionNumber: toNumber(q.questionNumber) ?? index + 1,
          text: stripInlineMarkdown(q.question || q.text || `Question ${index + 1}`),
          userAnswer,
          correctAnswer,
          explanation: stripInlineMarkdown(q.explanation || ''),
          passed: userAnswer === correctAnswer,
        }
      })

      const total = totalQuestions > 0 ? totalQuestions : pdfQuestions.length
      const correct = pdfQuestions.filter((q) => q.passed).length
      const percentage = total > 0 ? Math.round((correct / total) * 100) : 0
      const passedQuiz = percentage >= 60

      const rawDuration =
        quizMeta?.timeTaken ??
        quizMeta?.duration ??
        quizMeta?.time_taken_seconds ??
        quizMeta?.time_taken ??
        attemptMeta?.time_taken_seconds ??
        attemptMeta?.time_taken ??
        attemptMeta?.duration

      const timeText = formatDurationForPdf(rawDuration)
      const generatedDate = formatPdfDate(quizMeta?.created_at || new Date().toISOString())

      // 1) Badge (match summary export settings)
      const badgeHeight = 16
      const badgeToTitleGap = 28
      ensurePageSpaceQuiz(badgeHeight)
      setFillHex(NAVY)
      drawRect(margin, yQuiz, quizContentWidth, badgeHeight, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      setTextHex('#ffffff')
      doc.text('QUIZ RESULTS', margin + 8, yQuiz + 11)
      yQuiz += badgeHeight + badgeToTitleGap

      // 2) Title (match summary export settings)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(22)
      setTextHex(NAVY)
      const titleLines = doc.splitTextToSize(`Quiz: ${quizTitle}`, quizContentWidth) as string[]
      for (const line of titleLines) {
        ensurePageSpaceQuiz(28)
        doc.text(line, margin, yQuiz)
        yQuiz += 28
      }
      yQuiz += -7

      // 3) Meta (match summary export settings)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      setTextHex(GRAY_TEXT)
      ensurePageSpaceQuiz(16)
      doc.text(`Generated: ${generatedDate}`, margin, yQuiz)
      yQuiz += 12

      // 4) Navy divider
      ensurePageSpaceQuiz(20)
      setFillHex(NAVY)
      drawRect(margin, yQuiz, quizContentWidth, 1.5, 'F')
      yQuiz += 20

      // 5) Score summary card
      const cardX = margin
      const cardY = yQuiz
      const cardW = quizContentWidth
      const leftW = cardW * 0.3
      const statW = (cardW - leftW) / 3
      const cardH = 92

      ensurePageSpaceQuiz(cardH + 5 + 20)

      setFillHex(NAVY)
      drawRect(cardX, cardY, leftW, cardH, 'F')

      setFillHex(OFF_WHITE)
      drawRect(cardX + leftW, cardY, cardW - leftW, cardH, 'F')

      setDrawHex(RULE)
      doc.setLineWidth(0.5)
      drawRect(cardX, cardY, cardW, cardH, 'S')

      for (let i = 1; i <= 2; i += 1) {
        const x = cardX + leftW + statW * i
        drawLine(x, cardY, x, cardY + cardH)
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(36)
      setTextHex('#ffffff')
      doc.text(`${percentage}%`, cardX + leftW / 2, cardY + cardH / 2 + 12, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      setTextHex(GRAY_TEXT)

      const statValues = [timeText, `${correct}/${total}`, passedQuiz ? 'Pass' : 'Fail']
      const statLabels = ['TIME', 'SCORE', 'RESULT']
      const statColors = [NAVY, NAVY, passedQuiz ? GREEN : RED]

      for (let i = 0; i < 3; i += 1) {
        const cellX = cardX + leftW + statW * i
        const centerX = cellX + statW / 2

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(15)
        setTextHex(statColors[i])
        doc.text(statValues[i], centerX, cardY + 45, { align: 'center' })

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        setTextHex(GRAY_TEXT)
        doc.text(statLabels[i], centerX, cardY + 62, { align: 'center' })
      }

      yQuiz += cardH

      // 6) Progress bar
      const progressHeight = 5
      const progressRatio = total > 0 ? correct / total : 0
      setFillHex(RULE)
      drawRect(margin, yQuiz, quizContentWidth, progressHeight, 'F')
      setFillHex(NAVY)
      drawRect(margin, yQuiz, quizContentWidth * progressRatio, progressHeight, 'F')
      yQuiz += progressHeight

      // separator between progress and detailed review
      const separatorTopGap = 35
      const separatorBottomGap = 30
      yQuiz += separatorTopGap
      ensurePageSpaceQuiz(8)
      setDrawHex(NAVY)
      doc.setLineWidth(1.6)
      drawLine(margin, yQuiz, margin + quizContentWidth, yQuiz)
      yQuiz += separatorBottomGap

      // 7) Detailed review label
      ensurePageSpaceQuiz(25)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      setTextHex(NAVY)
      doc.text('DETAILED REVIEW', margin, yQuiz)
      yQuiz += 15

      // 8) Per-question cards
      pdfQuestions.forEach((question, index) => {
        const questionTextMaxWidth = Math.max(quizContentWidth - 40, 80)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        const qTextWrapped = doc.splitTextToSize(question.text, questionTextMaxWidth) as string[]
        const qTextHeight = qTextWrapped.length * 15 + 10
        const ansRowHeight = 40
        const explanationValue = question.explanation || 'No explanation provided.'
        const explanationTextMaxWidth = Math.max(quizContentWidth - 30, 80)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const explWrapped = doc.splitTextToSize(explanationValue, explanationTextMaxWidth) as string[]
        const explHeight = explWrapped.length * 14 + 24
        const cardHeight = 22 + 6 + qTextHeight + ansRowHeight + 4 + explHeight + 16
        ensurePageSpaceQuiz(cardHeight)

        const cardStartY = yQuiz
        const textCardY = cardStartY + 22 + 6

        // 8a header row (number badge style aligned with paragraph summary sections)
        setFillHex(NAVY)
        drawRect(margin, cardStartY, 22, 22, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        setTextHex('#ffffff')
        doc.text(String(question.questionNumber || index + 1), margin + 11, cardStartY + 15, { align: 'center' })

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        setTextHex(NAVY)
        doc.text(`Question ${question.questionNumber || index + 1}`, margin + 32, cardStartY + 15)

        // 8b question text card
        setFillHex(NAVY)
        drawRect(margin, textCardY, 4, qTextHeight, 'F')
        setFillHex(OFF_WHITE)
        setDrawHex(RULE)
        drawRect(margin + 4, textCardY, quizContentWidth - 4, qTextHeight, 'FD')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        setTextHex(NAVY)
        let qLineY = textCardY + 15
        qTextWrapped.forEach((line) => {
          doc.text(line, margin + 16, qLineY)
          qLineY += 15
        })

        let cursorY = textCardY + qTextHeight + 6

        // 8c answer + result row
        const passed = question.userAnswer === question.correctAnswer
        const rowBg = passed ? GREEN_BG : RED_BG
        const rowCellWidth = quizContentWidth / 3

        setFillHex(rowBg)
        drawRect(margin, cursorY, quizContentWidth, ansRowHeight, 'F')
        setDrawHex(RULE)
        drawRect(margin, cursorY, quizContentWidth, ansRowHeight, 'S')

        drawLine(margin + rowCellWidth, cursorY, margin + rowCellWidth, cursorY + ansRowHeight)
        drawLine(margin + rowCellWidth * 2, cursorY, margin + rowCellWidth * 2, cursorY + ansRowHeight)

        const answerCells = [
          { label: 'YOUR ANSWER', value: question.userAnswer, valueColor: BODY_COLOR },
          { label: 'CORRECT ANSWER', value: question.correctAnswer, valueColor: BODY_COLOR },
          { label: 'RESULT', value: passed ? 'Correct' : 'Incorrect', valueColor: passed ? GREEN : RED },
        ]

        answerCells.forEach((cell, i) => {
          const cellX = margin + rowCellWidth * i + 10
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          setTextHex(GRAY_TEXT)
          doc.text(cell.label, cellX, cursorY + 12)

          doc.setFont('helvetica', i === 2 ? 'bold' : 'normal')
          doc.setFontSize(10)
          setTextHex(cell.valueColor)
          const valueLine = (doc.splitTextToSize(cell.value, rowCellWidth - 20) as string[])[0] || ''
          doc.text(valueLine, cellX, cursorY + 27)
        })

        cursorY += ansRowHeight + 4

        // 8d explanation block
        setFillHex(GRAY_LIGHT)
        setDrawHex(RULE)
        drawRect(margin, cursorY, quizContentWidth, explHeight, 'FD')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        setTextHex(GRAY_TEXT)
        doc.text('EXPLANATION', margin + 12, cursorY + 10)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        setTextHex(SLATE)
        let explY = cursorY + 30
        explWrapped.forEach((line) => {
          doc.text(line, margin + 12, explY)
          explY += 14
        })

        yQuiz += cardHeight
      })

      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i += 1) {
        doc.setPage(i)
        doc.setDrawColor(226, 232, 240)
        doc.setLineWidth(0.5)
        drawLine(margin, quizPageHeight - margin + 8, margin + quizContentWidth, quizPageHeight - margin + 8)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.text(`Lectura · Page ${i} of ${totalPages}`, quizPageWidth / 2, quizPageHeight - margin + 18, {
          align: 'center',
        })
      }

      doc.save(`${fileTitle}.pdf`)
      toast.success('PDF downloaded')
    } catch {
      toast.error('Failed to download PDF')
    } finally {
      setIsExportingPdf(false)
    }
  }

  const handleDiscussInChat = (question: QuizReviewQuestion, answer: QuizAnswer) => {
    if (!sourceSummaryId) {
      return
    }

    const message = buildQuizChatMessage(
      question,
      answer.userAnswer,
      answer.correctAnswer,
      answer.isCorrect,
    )

    setChatPrefillMessage(message)
  }

  const handleOpenFloatingDiscuss = () => {
    const target = getActiveDiscussTarget()
    if (!target) {
      return
    }

    const { question, index } = target
    const reviewData = getQuestionReviewData(question, index)

    handleDiscussInChat(question, {
      questionId: String(reviewData.qId),
      userAnswer: reviewData.userAnswerText,
      correctAnswer: reviewData.correctAnswerText,
      isCorrect: reviewData.isCorrect,
    })
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto py-8">
        {/* Header Section */}
        <div className="text-center mb-12">
          <div className={cn(
            'inline-flex items-center justify-center p-3 rounded-full mb-4',
            isPass ? 'bg-yellow-100 dark:bg-yellow-500/15' : 'bg-orange-100 dark:bg-orange-500/15'
          )}>
            {isPass ? (
              <Trophy className="h-8 w-8 text-yellow-600 dark:text-yellow-300" />
            ) : (
              <Target className="h-8 w-8 text-orange-600 dark:text-orange-300" />
            )}
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
            <div className="text-4xl font-bold text-green-600 dark:text-green-300 mb-1">{correctCount}/{totalQuestions}</div>
            <div className="text-sm font-medium text-muted-foreground">Correct Answers</div>
          </Card>
          <Card className="text-center py-6">
            <div className="text-4xl font-bold text-blue-600 mb-1">
              {timeTaken ? formatTime(timeTaken) : '-'}
            </div>
            <div className="text-sm font-medium text-muted-foreground">Time Taken</div>
          </Card>
          <Card className="text-center py-6">
            <div className={cn(
              'text-4xl font-bold mb-1',
              isPass ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300',
            )}>
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
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/40">
                  {correctCount} Correct
                </Badge>
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40">
                  {incorrectCount} Incorrect
                </Badge>
              </div>
            </div>

            <div className="space-y-4">
              {questions.map((questionItem, index: number) => {
                const q = questionItem as QuizReviewQuestion
                const { qId, userAnswerText, correctAnswerText, isCorrect } = getQuestionReviewData(q, index)

                const toggleQuestion = () => {
                  setExpandedQuestion(expandedQuestion === qId ? null : qId)
                }

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
                      onClick={toggleQuestion}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleQuestion()
                        }
                      }}
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
                          <p className={cn('text-sm mt-2', isCorrect ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300')}>
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
                            isCorrect
                              ? 'bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30'
                              : 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30',
                          )}>
                            <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">Your Answer</div>
                            <div className="font-medium">{userAnswerText}</div>
                          </div>
                          {!isCorrect && (
                            <div className="p-4 rounded-lg border bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30">
                              <div className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70 text-green-800 dark:text-green-300">
                                Correct Answer
                              </div>
                              <div className="font-medium text-green-900 dark:text-green-200">{correctAnswerText}</div>
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
                        {isSourceSummaryLoading && !sourceSummaryId ? (
                          <button disabled className="mt-3 text-sm text-gray-400 px-3 py-1.5 rounded-md border border-gray-200">
                            Loading chat...
                          </button>
                        ) : (
                          <button
                            title={!sourceSummaryId ? 'Source summary not available' : 'Discuss this question in the AI chat'}
                            disabled={!sourceSummaryId}
                            onClick={() => handleDiscussInChat(q, {
                              questionId: String(q.id ?? q.questionNumber ?? index),
                              userAnswer: userAnswerText,
                              correctAnswer: correctAnswerText,
                              isCorrect,
                            })}
                            className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-md border border-blue-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Discuss in Chat
                          </button>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>

            <div className="mt-12 bg-slate-900 dark:bg-slate-800 rounded-xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-800 dark:border-slate-700">
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
      {sourceSummaryId && (
        <SummaryChatPanel
          summaryId={sourceSummaryId}
          summaryTitle={quizTitle}
          prefillMessage={chatPrefillMessage}
          onPrefillConsumed={() => setChatPrefillMessage('')}
          hideLauncher
        />
      )}
      <button
        type="button"
        title={!sourceSummaryId ? 'Source summary not available' : 'Discuss the current quiz/question in chat'}
        disabled={!sourceSummaryId || questions.length === 0}
        onClick={handleOpenFloatingDiscuss}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="text-sm font-medium">Discuss in Chat</span>
      </button>
    </AppLayout>
  )
}
