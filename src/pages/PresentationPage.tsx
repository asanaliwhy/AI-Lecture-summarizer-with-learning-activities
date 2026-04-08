import React from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, presentationQueryKeys } from '../lib/api'
import { SlideViewer } from '../components/presentation/SlideViewer'
import type { Presentation } from '../lib/presentationTypes'
import { normalizePresentation } from '../lib/presentationTypes'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'

const TEST_PRESENTATION: Presentation = normalizePresentation({
  id: 'test-presentation-1',
  title: 'The Cognitive Science of Learning',
  slideCount: 7,
  status: 'completed',
  theme: 'navy',
  language: 'en',
  createdAt: new Date().toISOString(),
  slides: [
    {
      id: 'slide-1',
      type: 'title',
      icon: '🧠',
      title: 'The Cognitive Science of Learning',
      subtitle:
        'How spaced repetition, active recall, and interleaving reshape the way we acquire and retain knowledge.',
      notes:
        'Welcome the audience. This presentation covers three evidence-based learning strategies backed by decades of cognitive psychology research.',
    },
    {
      id: 'slide-2',
      type: 'content',
      title: 'Spaced Repetition',
      bullets: [
        'Memory strength decays exponentially without reinforcement — the Ebbinghaus forgetting curve',
        'Reviewing material at increasing intervals produces 200% better long-term retention',
        'The SM-2 algorithm dynamically schedules review based on difficulty ratings',
        'Optimal spacing varies by material complexity: vocabulary (1-3-7 days) vs. concepts (1-7-30 days)',
        'Digital tools like Anki and Lectura automate scheduling decisions',
      ],
      imageUrl: '📊',
      imageAlt: 'Spaced repetition curve',
      notes:
        'Emphasize the Ebbinghaus curve — most students lose 70% of material within 24 hours without review.',
    },
    {
      id: 'slide-3',
      type: 'section',
      sectionLabel: 'Part II',
      title: 'Active Recall & Testing Effect',
      subtitle:
        'Why retrieving information from memory strengthens it more than passive re-reading.',
      notes:
        'Transition slide. Ask the audience: how many of you re-read your notes before exams?',
    },
    {
      id: 'slide-4',
      type: 'two_column',
      title: 'Passive vs. Active Learning Strategies',
      columns: [
        {
          label: 'Passive (Low Retention)',
          items: [
            'Re-reading textbook chapters',
            'Highlighting and underlining',
            'Watching lecture recordings',
            'Copying notes verbatim',
          ],
        },
        {
          label: 'Active (High Retention)',
          items: [
            'Self-testing with flashcards',
            'Explaining concepts out loud',
            'Practice problems without hints',
            'Teaching material to peers',
          ],
        },
      ],
      notes:
        'Reference Dunlosky et al. (2013) meta-analysis: practice testing and distributed practice rated as high-utility strategies.',
    },
    {
      id: 'slide-5',
      type: 'stats',
      title: 'The Numbers Behind Effective Study',
      stats: [
        { value: '200%', label: 'Retention boost' },
        { value: '70%', label: 'Forgotten in 24h' },
        { value: '50%', label: 'More after testing' },
      ],
      notes:
        'These statistics come from peer-reviewed studies on spaced repetition and active recall.',
    },

    {
      id: 'slide-7',
      type: 'summary',
      title: 'Key Takeaways',
      takeaways: [
        {
          title: 'Space Your Reviews',
          description:
            'Distribute study sessions over time. Even 10-minute daily reviews outperform 2-hour cramming sessions.',
        },
        {
          title: 'Test Yourself Often',
          description:
            'Use flashcards, practice quizzes, and self-explanation. Retrieval is the engine of durable memory.',
        },
        {
          title: 'Interleave Topics',
          description:
            'Mix different subjects within study sessions. This builds flexible, transferable knowledge.',
        },
        {
          title: 'Embrace Difficulty',
          description:
            'Desirable difficulties — like harder retrieval — slow initial learning but dramatically improve retention.',
        },
      ],
      notes:
        'Summarize with a call to action: try implementing one strategy this week.',
    },
  ],
})

function PresentationViewerSkeleton() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
        </div>
      </div>
    </AppLayout>
  )
}

export function PresentationPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const isTestRoute = location.pathname === '/presentations/test'

  const handleDelete = async (presentationID: string) => {
    await api.presentations.delete(presentationID)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: presentationQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: presentationQueryKeys.detail(presentationID) }),
    ])
    navigate('/presentations', { replace: true })
  }

  const { data, isLoading, error } = useQuery({
    queryKey: id ? presentationQueryKeys.detail(id) : ['presentation', 'missing-id'],
    queryFn: () => api.presentations.get(id as string),
    enabled: Boolean(id) && !isTestRoute,
  })

  if (isTestRoute) {
    return (
      <SlideViewer
        presentation={TEST_PRESENTATION}
        onBack={() => navigate('/presentations')}
        canDelete={false}
      />
    )
  }

  if (isLoading) {
    return <PresentationViewerSkeleton />
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">Presentation not found</h1>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : 'The requested presentation could not be loaded.'}
          </p>
          <Button onClick={() => navigate('/presentations')}>Back to Presentations</Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <SlideViewer
      presentation={data}
      onBack={() => navigate('/presentations')}
      onDelete={handleDelete}
      canDelete
    />
  )
}
