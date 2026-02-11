import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { api } from '../lib/api'
import { AppLayout } from '../components/layout/AppLayout'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Progress } from '../components/ui/Progress'
import { DashboardSkeleton } from '../components/ui/Skeleton'
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
} from 'lucide-react'
import { cn } from '../lib/utils'
export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)
  const [dashStats, setDashStats] = useState<any>(null)
  const [recentItems, setRecentItems] = useState<any[]>([])
  const [streakData, setStreakData] = useState<any>(null)
  const [activityItems, setActivityItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [stats, recent, streak, activity] = await Promise.all([
          api.dashboard.stats().catch(() => null),
          api.dashboard.recent().catch(() => ({ items: [] })),
          api.dashboard.streak().catch(() => null),
          api.dashboard.activity().catch(() => ({ days: [] })),
        ])
        setDashStats(stats)
        setRecentItems(recent?.items || [])
        setStreakData(streak)
        setActivityItems(activity?.days || [])
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])
  if (isLoading) {
    return <AppLayout><DashboardSkeleton /></AppLayout>
  }
  const stats = [
    {
      label: 'Total Summaries',
      value: String(dashStats?.summaries ?? 0),
      change: '+12%',
      trend: 'up',
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      link: '/summaries',
      clickable: true,
    },
    {
      label: 'Quizzes Taken',
      value: String(dashStats?.quizzes_taken ?? 0),
      change: '+4%',
      trend: 'up',
      icon: BrainCircuit,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      link: '/quizzes',
      clickable: true,
    },
    {
      label: 'Flashcard Decks',
      value: String(dashStats?.flashcard_decks ?? 0),
      change: '+24%',
      trend: 'up',
      icon: Play,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      link: '/library?type=flashcards',
      clickable: true,
    },
    {
      label: 'Study Hours',
      value: String(dashStats?.study_hours ?? 0),
      change: '',
      trend: 'up',
      icon: Clock,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      link: null,
      clickable: false,
    },
  ]
  const recentContent = [
    {
      id: 1,
      title: 'Introduction to Neural Networks',
      type: 'Summary',
      date: '2 hours ago',
      tags: ['AI', 'CS'],
      progress: 100,
      link: '/summary/1',
    },
    {
      id: 2,
      title: 'History of the Roman Empire',
      type: 'Quiz',
      date: 'Yesterday',
      tags: ['History'],
      progress: 80,
      link: '/quiz/take/2',
    },
    {
      id: 3,
      title: 'Organic Chemistry: Alkanes',
      type: 'Flashcards',
      date: '2 days ago',
      tags: ['Chemistry'],
      progress: 45,
      link: '/flashcards/study/3',
    },
  ]
  const activityData = [
    {
      day: 'M',
      height: '40%',
      hours: '2.5h',
    },
    {
      day: 'T',
      height: '70%',
      hours: '4.2h',
    },
    {
      day: 'W',
      height: '30%',
      hours: '1.8h',
    },
    {
      day: 'T',
      height: '85%',
      hours: '5.1h',
    },
    {
      day: 'F',
      height: '50%',
      hours: '3.0h',
    },
    {
      day: 'S',
      height: '20%',
      hours: '1.2h',
    },
    {
      day: 'S',
      height: '10%',
      hours: '0.5h',
    },
  ]
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
                      `to-${stat.color.split('-')[1]}-500`,
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
              <Card
                className="border-l-4 border-l-primary shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer group relative overflow-hidden"
                onClick={() => navigate('/summary/4')}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardContent className="p-6 relative z-10">
                  <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                      <BookOpen className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="secondary"
                          className="text-xs font-normal bg-primary/10 text-primary border-primary/20"
                        >
                          Summary
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Last active 25m ago
                        </span>
                      </div>
                      <h3 className="font-bold text-xl group-hover:text-primary transition-colors">
                        Macroeconomics 101: Supply & Demand
                      </h3>
                      <p className="text-muted-foreground text-sm line-clamp-1">
                        Understanding the fundamental relationship between price
                        and quantity in a market economy.
                      </p>
                    </div>
                    <div className="w-full md:w-32 space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Progress</span>
                        <span>65%</span>
                      </div>
                      <Progress value={65} className="h-2" />
                      <Button
                        className="w-full mt-2 shadow-sm group-hover:shadow-md transition-all"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate('/summary/4')
                        }}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
                <Link to="/library?type=flashcards">
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
                  <div className="flex items-end justify-between h-32 gap-2">
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
                          className="w-full bg-primary/20 rounded-t-sm group-hover:bg-primary/60 transition-all duration-300 relative"
                          style={{
                            height: item.height,
                          }}
                        ></div>
                        <span className="text-xs text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                          {item.day}
                        </span>
                      </div>
                    ))}
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
                >
                  <Settings2 className="h-3 w-3 mr-1" /> Set Goal
                </Button>
              </div>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">
                        Summaries Created
                      </span>
                    </div>
                    <span className="text-sm font-bold">4/5</span>
                  </div>
                  <Progress value={80} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Create 1 more summary to reach your weekly goal!
                  </p>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </AppLayout >
  )
}
