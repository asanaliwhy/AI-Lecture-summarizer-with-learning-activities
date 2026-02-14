import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  api,
  type DashboardActivityResponse,
  type DashboardGoalType,
  type DashboardRecentItemResponse,
  type DashboardRecentResponse,
  type DashboardStatsResponse,
  type DashboardStreakResponse,
} from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Progress } from '../components/ui/Progress'
import { Input } from '../components/ui/Input'
import { DashboardSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/Toast'
import {
  FileText,
  BrainCircuit,
  Play,
  Clock,
  MoreHorizontal,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  ChevronRight,
  Target,
  BookOpen,
  Settings2,
  X,
} from 'lucide-react'
import { cn } from '../lib/utils'

type GoalType = DashboardGoalType
type RecentContentType = 'Summary' | 'Quiz' | 'Flashcards'

interface RecentContentCard {
  id: string
  title: string
  type: RecentContentType
  date: string
  tags: string[]
  progress: number
  link: string
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
  const [dashStats, setDashStats] = useState<DashboardStatsResponse | null>(null)
  const [recentItems, setRecentItems] = useState<DashboardRecentItemResponse[]>([])
  const [streakData, setStreakData] = useState<DashboardStreakResponse | null>(null)
  const [activityItems, setActivityItems] = useState<number[]>([])
  const [isSavingGoal, setIsSavingGoal] = useState(false)
  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [summaryGoalInput, setSummaryGoalInput] = useState('5')
  const [quizGoalInput, setQuizGoalInput] = useState('3')
  const [flashcardGoalInput, setFlashcardGoalInput] = useState('10')
  const [selectedGoalType, setSelectedGoalType] = useState<GoalType>('summary')
  const [goalError, setGoalError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [stats, recent, streak, activity] = await Promise.all([
          api.dashboard.stats().catch(() => null),
          api.dashboard.recent().catch((): DashboardRecentResponse => ({ recent: [], items: [] })),
          api.dashboard.streak().catch(() => null),
          api.dashboard.activity().catch((): DashboardActivityResponse => ({ activity: [], days: [] })),
        ])
        setDashStats(stats)
        setRecentItems(recent?.recent ?? recent?.items ?? [])
        setStreakData(streak)
        setActivityItems(activity?.activity ?? activity?.days ?? [])
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])
  if (isLoading) {
    return <AppLayout><DashboardSkeleton /></AppLayout>
  }

  const formatTrend = (value: number) => {
    const safe = Number.isFinite(value) ? value : 0
    const rounded = Math.round(Math.abs(safe))
    return `${safe >= 0 ? '+' : '-'}${rounded}%`
  }

  const getTrend = (value: number) => {
    const safe = Number.isFinite(value) ? value : 0
    return safe >= 0 ? 'up' : 'down'
  }

  const summariesTrend = Number(dashStats?.summaries_trend ?? 0)
  const quizzesTrend = Number(dashStats?.quizzes_trend ?? 0)
  const flashcardsTrend = Number(dashStats?.flashcards_trend ?? 0)
  const studyHoursTrend = Number(dashStats?.study_hours_trend ?? 0)

  const formatStudyHours = (value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0
    const truncated = Math.floor(safe * 100) / 100
    return truncated.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
  }

  const stats = [
    {
      label: 'Total Summaries',
      value: String(dashStats?.summaries ?? 0),
      change: formatTrend(summariesTrend),
      trend: getTrend(summariesTrend),
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      hoverGradientTo: 'group-hover:to-blue-500',
      link: '/summaries',
      clickable: true,
    },
    {
      label: 'Quizzes Taken',
      value: String(dashStats?.quizzes_taken ?? 0),
      change: formatTrend(quizzesTrend),
      trend: getTrend(quizzesTrend),
      icon: BrainCircuit,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      hoverGradientTo: 'group-hover:to-purple-500',
      link: '/quizzes',
      clickable: true,
    },
    {
      label: 'Flashcard Decks',
      value: String(dashStats?.flashcard_decks ?? 0),
      change: formatTrend(flashcardsTrend),
      trend: getTrend(flashcardsTrend),
      icon: Play,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      hoverGradientTo: 'group-hover:to-orange-500',
      link: '/flashcards',
      clickable: true,
    },
    {
      label: 'Study Hours',
      value: formatStudyHours(Number(dashStats?.study_hours ?? 0)),
      change: formatTrend(studyHoursTrend),
      trend: getTrend(studyHoursTrend),
      icon: Clock,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      hoverGradientTo: 'group-hover:to-green-500',
      link: null,
      clickable: false,
    },
  ]

  const weeklyGoalTargetRaw = Number(dashStats?.weekly_goal_target ?? 5)
  const weeklyGoalTarget = Number.isFinite(weeklyGoalTargetRaw) && weeklyGoalTargetRaw > 0
    ? weeklyGoalTargetRaw
    : 5
  const weeklyGoalTypeRaw = String(dashStats?.weekly_goal_type || 'summary').toLowerCase()
  const weeklyGoalType: GoalType =
    weeklyGoalTypeRaw === 'quiz'
      ? 'quiz'
      : weeklyGoalTypeRaw === 'flashcard' || weeklyGoalTypeRaw === 'flashcards'
        ? 'flashcard'
        : 'summary'

  const weeklySummaryCountRaw = Number(dashStats?.weekly_summaries ?? 0)
  const weeklySummaryCount = Number.isFinite(weeklySummaryCountRaw) && weeklySummaryCountRaw > 0 ? weeklySummaryCountRaw : 0
  const weeklyQuizCountRaw = Number(dashStats?.weekly_quizzes ?? 0)
  const weeklyQuizCount = Number.isFinite(weeklyQuizCountRaw) && weeklyQuizCountRaw > 0 ? weeklyQuizCountRaw : 0
  const weeklyFlashcardCountRaw = Number(dashStats?.weekly_flashcards ?? 0)
  const weeklyFlashcardCount = Number.isFinite(weeklyFlashcardCountRaw) && weeklyFlashcardCountRaw > 0 ? weeklyFlashcardCountRaw : 0

  const weeklyCurrentValue =
    weeklyGoalType === 'quiz'
      ? weeklyQuizCount
      : weeklyGoalType === 'flashcard'
        ? weeklyFlashcardCount
        : weeklySummaryCount

  const weeklyGoalLabel =
    weeklyGoalType === 'quiz'
      ? 'Quizzes Completed'
      : weeklyGoalType === 'flashcard'
        ? 'Flashcards Created'
        : 'Summaries Created'

  const weeklyGoalProgress = Math.max(
    0,
    Math.min(100, Math.round((weeklyCurrentValue / weeklyGoalTarget) * 100)),
  )
  const weeklyGoalRemaining = Math.max(0, weeklyGoalTarget - weeklyCurrentValue)

  const openGoalModal = () => {
    setSelectedGoalType(weeklyGoalType)
    setSummaryGoalInput(String(weeklyGoalType === 'summary' ? weeklyGoalTarget : 5))
    setQuizGoalInput(String(weeklyGoalType === 'quiz' ? weeklyGoalTarget : 3))
    setFlashcardGoalInput(String(weeklyGoalType === 'flashcard' ? weeklyGoalTarget : 10))
    setGoalError('')
    setGoalModalOpen(true)
  }

  const handleSaveGoal = async () => {
    const inputValue =
      selectedGoalType === 'quiz'
        ? quizGoalInput
        : selectedGoalType === 'flashcard'
          ? flashcardGoalInput
          : summaryGoalInput

    const parsed = Number(inputValue)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) {
      setGoalError('Please enter a valid number between 1 and 50.')
      return
    }

    const target = Math.round(parsed)
    setIsSavingGoal(true)
    try {
      const data = await api.dashboard.setWeeklyGoal(target, selectedGoalType)
      setDashStats((prev) => ({
        ...(prev || {}),
        weekly_goal_target: data?.weekly_goal_target ?? target,
        weekly_goal_type: data?.weekly_goal_type ?? selectedGoalType,
      }))
      setGoalModalOpen(false)
      toast.success('Weekly goal updated')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update weekly goal')
    } finally {
      setIsSavingGoal(false)
    }
  }

  const formatRelativeTime = (value?: string) => {
    if (!value) return 'Recently active'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Recently active'

    const diffMs = Date.now() - date.getTime()
    const minutes = Math.floor(diffMs / (1000 * 60))
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`

    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`

    return date.toLocaleDateString()
  }

  const recentContent: RecentContentCard[] = (recentItems || []).flatMap((item) => {
    const rawId = item?.id
    const id = typeof rawId === 'string' ? rawId.trim() : String(rawId ?? '').trim()
    if (!id) return []

    const rawType = String(item?.type || 'summary').toLowerCase()

    const type: RecentContentType =
      rawType === 'quiz'
        ? 'Quiz'
        : rawType === 'flashcard' || rawType === 'flashcards'
          ? 'Flashcards'
          : 'Summary'

    const link =
      rawType === 'quiz'
        ? `/quiz/take/${id}`
        : rawType === 'flashcard' || rawType === 'flashcards'
          ? `/flashcards/study/${id}`
          : `/summary/${id}`

    const progressRaw = Number(item?.progress ?? item?.completion ?? 0)
    const progress = Number.isFinite(progressRaw)
      ? Math.max(0, Math.min(100, progressRaw))
      : 0

    return [{
      id,
      title: item?.title || 'Untitled learning item',
      type,
      date: formatRelativeTime(item?.created_at || item?.createdAt),
      tags: [type],
      progress,
      link,
    }]
  }).slice(0, 4)

  const continueStudyItem = recentContent[0] || null

  const getContinueIcon = (type: RecentContentType) => {
    if (type === 'Quiz') return BrainCircuit
    if (type === 'Flashcards') return Play
    return BookOpen
  }

  const getContinueDescription = (type: RecentContentType) => {
    if (type === 'Quiz') return 'Continue practicing your quiz to improve retention.'
    if (type === 'Flashcards') return 'Resume your flashcard session and reinforce memory.'
    return 'Continue reading and reviewing your generated summary.'
  }

  const selectedGoalInputValue =
    selectedGoalType === 'quiz'
      ? quizGoalInput
      : selectedGoalType === 'flashcard'
        ? flashcardGoalInput
        : summaryGoalInput

  const previewGoalTargetRaw = Number(selectedGoalInputValue)
  const previewGoalTarget =
    previewGoalTargetRaw > 0
      ? Math.max(1, Math.round(previewGoalTargetRaw))
      : weeklyGoalTarget

  const previewGoalProgress = Math.max(
    0,
    Math.min(100, Math.round((weeklyCurrentValue / previewGoalTarget) * 100)),
  )

  // Backend returns activity as 7 numbers with Sunday=0 ... Saturday=6.
  // UI displays Monday-first: M T W T F S S.
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const normalizedActivity = dayLabels.map((_, uiIndex) => {
    const backendIndex = (uiIndex + 1) % 7
    const value = Number((activityItems || [])[backendIndex] ?? 0)
    return Number.isFinite(value) && value > 0 ? value : 0
  })

  const maxActivity = Math.max(...normalizedActivity, 0)
  const maxScale = maxActivity > 0 ? maxActivity : 1
  const maxVisualBarHeight = 96
  const minVisualBarHeight = 8

  const activityData = dayLabels.map((day, i) => {
    const value = normalizedActivity[i]
    const height = maxActivity > 0
      ? `${Math.max(minVisualBarHeight, Math.round((value / maxActivity) * maxVisualBarHeight))}px`
      : `${minVisualBarHeight}px`

    return {
      day,
      height,
      hours: `${value.toFixed(1)}h`,
    }
  })
  return (
    <AppLayout>
      <div className="space-y-8 pb-8 animate-in fade-in duration-500">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {greeting}, {user?.full_name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {recentItems.length > 0
                ? `You have ${recentItems.length} items to review today. Keep up the momentum!`
                : 'Start by creating your first summary!'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-orange-50 text-orange-700 px-4 py-2 rounded-full border border-orange-100 shadow-sm hover:shadow-md transition-all cursor-default">
              <Flame className="h-5 w-5 fill-orange-500 text-orange-500 animate-pulse" />
              <span className="font-semibold">{streakData?.current_streak || 0} Day Streak</span>
            </div>
            <Link to="/create">
              <Button className="shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                <Plus className="mr-2 h-4 w-4" /> New Summary
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const CardWrapper = stat.clickable ? Link : 'div'
            return (
              <CardWrapper
                key={stat.label}
                to={stat.link || '#'}
                className={cn(
                  'block transition-all duration-300',
                  stat.clickable &&
                  'cursor-pointer hover:-translate-y-1 hover:shadow-lg',
                )}
              >
                <Card className="overflow-hidden border-none shadow-sm h-full relative group">
                  <div
                    className={cn(
                      'absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-br from-transparent',
                      stat.hoverGradientTo,
                    )}
                  />
                  <CardContent className="p-6 relative z-10">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        {stat.label}
                      </p>
                      <div
                        className={cn(
                          'p-2 rounded-full transition-transform group-hover:scale-110',
                          stat.bgColor,
                        )}
                      >
                        <stat.icon className={cn('h-4 w-4', stat.color)} />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2 mt-2">
                      <h2 className="text-3xl font-bold tracking-tight">
                        {stat.value}
                      </h2>
                      <div
                        className={cn(
                          'flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
                          stat.trend === 'up'
                            ? 'text-green-700 bg-green-50'
                            : 'text-red-700 bg-red-50',
                        )}
                      >
                        {stat.trend === 'up' ? (
                          <ArrowUpRight className="h-3 w-3 mr-1" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 mr-1" />
                        )}
                        {stat.change}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      from last week
                    </p>
                  </CardContent>
                </Card>
              </CardWrapper>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Column (2/3) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Continue Studying */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold tracking-tight">
                  Continue Studying
                </h2>
              </div>
              {continueStudyItem ? (
                <Card
                  className="border-l-4 border-l-primary shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer group relative overflow-hidden"
                  onClick={() => navigate(continueStudyItem.link)}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="p-6 relative z-10">
                    <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                      <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                        {React.createElement(getContinueIcon(continueStudyItem.type), {
                          className: 'h-8 w-8 text-primary',
                        })}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="secondary"
                            className="text-xs font-normal bg-primary/10 text-primary border-primary/20"
                          >
                            {continueStudyItem.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Last active {continueStudyItem.date}
                          </span>
                        </div>
                        <h3 className="font-bold text-xl group-hover:text-primary transition-colors">
                          {continueStudyItem.title}
                        </h3>
                        <p className="text-muted-foreground text-sm line-clamp-1">
                          {getContinueDescription(continueStudyItem.type)}
                        </p>
                      </div>
                      <div className="w-full md:w-32 space-y-2">
                        <div className="flex justify-between text-xs font-medium">
                          <span>Progress</span>
                          <span>{Math.round(continueStudyItem.progress)}%</span>
                        </div>
                        <Progress value={continueStudyItem.progress} className="h-2" />
                        <Button
                          className="w-full mt-2 shadow-sm group-hover:shadow-md transition-all"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(continueStudyItem.link)
                          }}
                        >
                          Continue
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="p-6 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">No recent study items</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Create content to start your next learning session.
                      </p>
                    </div>
                    <Button onClick={() => navigate('/create')}>
                      <Plus className="mr-2 h-4 w-4" /> New Summary
                    </Button>
                  </CardContent>
                </Card>
              )}
            </section>

            {/* Recent Content */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold tracking-tight">
                  Recent Content
                </h2>
                <Link
                  to="/library"
                  className="text-sm font-medium text-primary hover:underline flex items-center group"
                >
                  View Library{' '}
                  <ChevronRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {recentContent.map((item) => (
                  <Card
                    key={item.id}
                    className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-t-4 border-t-transparent hover:border-t-primary relative overflow-hidden"
                    onClick={() => navigate(item.link)}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-secondary/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 relative z-10">
                      <Badge
                        variant={
                          item.type === 'Summary' ? 'default' : 'secondary'
                        }
                      >
                        {item.type}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background/80"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-4 relative z-10">
                      <h3 className="font-semibold leading-tight mb-2 group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                        <Clock className="h-3 w-3" />
                        <span>{item.date}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-secondary px-2 py-1 rounded-md text-secondary-foreground border border-transparent group-hover:border-border/50 transition-colors"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        {item.progress > 0 && (
                          <div className="h-1.5 w-16 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 transition-all duration-1000 ease-out"
                              style={{
                                width: `${item.progress}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar Column (1/3) */}
          <div className="space-y-8">
            {/* Quick Actions */}
            <section>
              <h2 className="text-lg font-semibold tracking-tight mb-4">
                Quick Actions
              </h2>
              <div className="space-y-3">
                <Link to="/create">
                  <Card className="hover:bg-secondary/50 transition-all duration-300 cursor-pointer border-dashed hover:border-solid hover:shadow-md group">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                        <Plus className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm group-hover:text-blue-700 transition-colors">
                          New Summary
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Upload or paste link
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/quizzes">
                  <Card className="hover:bg-secondary/50 transition-all duration-300 cursor-pointer border-dashed hover:border-solid hover:shadow-md group">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                        <BrainCircuit className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm group-hover:text-purple-700 transition-colors">
                          Take a Quiz
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Test your knowledge
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/flashcards">
                  <Card className="hover:bg-secondary/50 transition-all duration-300 cursor-pointer border-dashed hover:border-solid hover:shadow-md group">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
                        <Play className="h-5 w-5 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <div>
                        <p className="font-medium text-sm group-hover:text-orange-700 transition-colors">
                          Study Flashcards
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Review deck
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </section>

            {/* Weekly Activity */}
            <section>
              <h2 className="text-lg font-semibold tracking-tight mb-4">
                Weekly Activity
              </h2>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="relative h-32">
                    {/* Scale + grid */}
                    <div className="absolute inset-0 pl-8 pointer-events-none">
                      <div className="h-full flex flex-col justify-between text-[10px] text-muted-foreground/80">
                        <div className="relative">
                          <div className="absolute inset-x-0 top-1/2 border-t border-border/70" />
                          <span className="absolute -left-8 -top-1.5">{maxScale.toFixed(1)}h</span>
                        </div>
                        <div className="relative">
                          <div className="absolute inset-x-0 top-1/2 border-t border-border/50" />
                          <span className="absolute -left-8 -top-1.5">{(maxScale / 2).toFixed(1)}h</span>
                        </div>
                        <div className="relative">
                          <div className="absolute inset-x-0 top-1/2 border-t border-border/40" />
                          <span className="absolute -left-8 -top-1.5">0h</span>
                        </div>
                      </div>
                    </div>

                    <div className="relative flex items-end justify-between h-32 gap-2 pl-8">
                      {activityData.map((item, i) => (
                        <div
                          key={i}
                          className="flex flex-col items-center gap-2 flex-1 group relative"
                        >
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-2 bg-popover text-popover-foreground text-xs font-medium px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 border">
                            {item.hours}
                          </div>

                          <div
                            className="w-full rounded-t-md bg-primary/55 group-hover:bg-primary transition-all duration-300 shadow-sm"
                            style={{
                              height: item.height,
                            }}
                          />
                          <span className="text-xs text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                            {item.day}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Learning Goals */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold tracking-tight">
                  Weekly Goal
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-primary"
                  onClick={openGoalModal}
                  disabled={isSavingGoal}
                >
                  <Settings2 className="h-3 w-3 mr-1" /> {isSavingGoal ? 'Saving...' : 'Set Goal'}
                </Button>
              </div>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">
                        {weeklyGoalLabel}
                      </span>
                    </div>
                    <span className="text-sm font-bold">{weeklyCurrentValue}/{weeklyGoalTarget}</span>
                  </div>
                  <Progress value={weeklyGoalProgress} className="h-2" />
                  {weeklyGoalRemaining > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {weeklyGoalType === 'quiz'
                        ? `Complete ${weeklyGoalRemaining} more ${weeklyGoalRemaining === 1 ? 'quiz' : 'quizzes'} to reach your weekly goal!`
                        : weeklyGoalType === 'flashcard'
                          ? `Create ${weeklyGoalRemaining} more ${weeklyGoalRemaining === 1 ? 'flashcard' : 'flashcards'} to reach your weekly goal!`
                          : `Create ${weeklyGoalRemaining} more ${weeklyGoalRemaining === 1 ? 'summary' : 'summaries'} to reach your weekly goal!`}
                    </p>
                  ) : (
                    <p className="text-xs text-green-600">
                      Weekly goal reached. Great work!
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        </div>

        {goalModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setGoalModalOpen(false)}
              aria-label="Close modal"
            />
            <Card className="relative w-full max-w-lg shadow-2xl border-primary/20 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-primary/80" />

              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                      <Target className="h-6 w-6 text-primary" />
                      Set Your Weekly Goals
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Set targets to stay motivated and track your progress.
                    </p>
                  </div>

                  <button
                    className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
                    onClick={() => setGoalModalOpen(false)}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 px-6 pb-6 pt-1">
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGoalType('summary')
                      if (goalError) setGoalError('')
                    }}
                    className={cn(
                      'w-full text-left p-4 border rounded-lg hover:bg-secondary/20 transition-colors',
                      selectedGoalType === 'summary' && 'ring-2 ring-primary border-primary/40 bg-secondary/20',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Summaries Created</p>
                          <p className="text-xs text-muted-foreground">Per week</p>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={summaryGoalInput}
                        onChange={(e) => {
                          setSummaryGoalInput(e.target.value)
                          if (goalError) setGoalError('')
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'w-20 text-center font-mono',
                          selectedGoalType === 'summary' && goalError ? 'border-destructive focus-visible:ring-destructive/40' : '',
                        )}
                      />
                    </div>
                    {selectedGoalType === 'summary' && goalError && <p className="text-xs text-destructive mt-2">{goalError}</p>}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGoalType('quiz')
                      if (goalError) setGoalError('')
                    }}
                    className={cn(
                      'w-full text-left p-4 border rounded-lg hover:bg-secondary/20 transition-colors',
                      selectedGoalType === 'quiz' && 'ring-2 ring-primary border-primary/40 bg-secondary/20',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                          <BrainCircuit className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Quizzes Completed</p>
                          <p className="text-xs text-muted-foreground">Per week</p>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={quizGoalInput}
                        onChange={(e) => setQuizGoalInput(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-20 text-center font-mono"
                      />
                    </div>
                    {selectedGoalType === 'quiz' && goalError && <p className="text-xs text-destructive mt-2">{goalError}</p>}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGoalType('flashcard')
                      if (goalError) setGoalError('')
                    }}
                    className={cn(
                      'w-full text-left p-4 border rounded-lg hover:bg-secondary/20 transition-colors',
                      selectedGoalType === 'flashcard' && 'ring-2 ring-primary border-primary/40 bg-secondary/20',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Flashcards Created</p>
                          <p className="text-xs text-muted-foreground">Per week</p>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={flashcardGoalInput}
                        onChange={(e) => setFlashcardGoalInput(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-20 text-center font-mono"
                      />
                    </div>
                    {selectedGoalType === 'flashcard' && goalError && <p className="text-xs text-destructive mt-2">{goalError}</p>}
                  </button>
                </div>

                <div className="pt-1 border-t">
                  <div className="flex items-center justify-between text-xs mb-2 mt-3">
                    <span className="text-muted-foreground">Current goal progress preview</span>
                    <span className="font-medium">
                      {weeklyCurrentValue}/
                      {previewGoalTarget}
                    </span>
                  </div>
                  <Progress
                    value={previewGoalProgress}
                    className="h-2"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setGoalModalOpen(false)}
                    disabled={isSavingGoal}
                    className="min-w-[90px]"
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveGoal} disabled={isSavingGoal} className="min-w-[110px] shadow-sm">
                    {isSavingGoal ? 'Saving...' : 'Save Goal'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout >
  )
}
