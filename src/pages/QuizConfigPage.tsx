import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { Slider } from '../components/ui/Slider'
import { Label } from '../components/ui/Label'
import { Checkbox } from '../components/ui/Checkbox'
import { Badge } from '../components/ui/Badge'
import {
  BrainCircuit,
  Clock,
  HelpCircle,
  Shuffle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'

export function QuizConfigPage() {
  const navigate = useNavigate()
  const { summaryId } = useParams()
  const [quizTitle, setQuizTitle] = useState('Quiz')
  const [questionCount, setQuestionCount] = useState([10])
  const [difficulty, setDifficulty] = useState([2])
  const [topics, setTopics] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  // Load summary info to pre-fill the quiz title and topics
  useEffect(() => {
    if (!summaryId) return
    api.summaries.get(summaryId).then((data: any) => {
      setQuizTitle(`Quiz: ${data.title || 'Untitled'}`)
      if (data.topics) setTopics(data.topics)
      else if (data.tags) setTopics(data.tags)
    }).catch(() => { })
  }, [summaryId])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError('')
    try {
      const result = await api.quizzes.generate({
        summary_id: summaryId,
        title: quizTitle,
        question_count: questionCount[0],
        difficulty: difficulty[0],
        topics,
      })
      if (result.job?.id) {
        navigate(`/processing/${result.job.id}`)
      } else if (result.quiz?.id) {
        navigate(`/quiz/take/${result.quiz.id}`)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate quiz')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Create Quiz
          </h1>
          <p className="text-muted-foreground">
            Configure your quiz settings based on your summary.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column - Configuration (55%) */}
          <div className="lg:col-span-7 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quiz Settings</CardTitle>
                <CardDescription>Customize the difficulty and format.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-2">
                  <Label htmlFor="quiz-title">Quiz Title</Label>
                  <Input
                    id="quiz-title"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Number of Questions</Label>
                    <span className="font-mono text-sm bg-secondary px-2 py-1 rounded">
                      {questionCount[0]}
                    </span>
                  </div>
                  <Slider
                    defaultValue={[10]}
                    max={50}
                    step={5}
                    min={5}
                    value={questionCount}
                    onValueChange={setQuestionCount}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Difficulty Level</Label>
                    <span className="text-sm font-medium text-primary">
                      {difficulty[0] === 1 ? 'Beginner' : difficulty[0] === 2 ? 'Intermediate' : 'Advanced'}
                    </span>
                  </div>
                  <Slider
                    defaultValue={[2]}
                    max={3}
                    step={1}
                    min={1}
                    value={difficulty}
                    onValueChange={setDifficulty}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground px-1">
                    <span>Easy</span>
                    <span>Medium</span>
                    <span>Hard</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Question Types</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-start space-x-2 border p-3 rounded-lg hover:bg-secondary/20 transition-colors">
                      <Checkbox id="multiple-choice" defaultChecked />
                      <div className="grid gap-1.5 leading-none">
                        <label htmlFor="multiple-choice" className="text-sm font-medium leading-none">
                          Multiple Choice
                        </label>
                        <p className="text-xs text-muted-foreground">Standard 4-option questions</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-2 border p-3 rounded-lg hover:bg-secondary/20 transition-colors">
                      <Checkbox id="true-false" defaultChecked />
                      <div className="grid gap-1.5 leading-none">
                        <label htmlFor="true-false" className="text-sm font-medium leading-none">
                          True / False
                        </label>
                        <p className="text-xs text-muted-foreground">Quick concept checks</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Options</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="timer" />
                      <label htmlFor="timer" className="text-sm font-medium">Enable Timer (30s per question)</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="shuffle" defaultChecked />
                      <label htmlFor="shuffle" className="text-sm font-medium">Shuffle Questions</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="hints" defaultChecked />
                      <label htmlFor="hints" className="text-sm font-medium">Allow Hints</label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {topics.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Topics Covered</CardTitle>
                  <CardDescription>Select which topics to include in the quiz.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {topics.map((topic) => (
                      <Badge
                        key={topic}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors px-3 py-1 text-sm"
                      >
                        {topic} <CheckCircle2 className="ml-2 h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="lg:hidden">
              <Button size="lg" className="w-full" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Start Quiz Generation
              </Button>
            </div>
          </div>

          {/* Right Column - Preview (45%) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Live Preview
                </h3>
                <Badge variant="outline" className="text-xs">Sample Question</Badge>
              </div>

              <div className="border rounded-xl bg-card shadow-lg overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20">
                  <div className="h-full bg-primary w-1/3"></div>
                </div>
                <div className="p-6 md:p-8 space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Question 3 of {questionCount[0]}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> 00:24
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold leading-tight">
                      Which type of machine learning algorithm is used when the output variable is continuous?
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 rounded-lg border-2 border-transparent bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors text-sm font-medium">
                      A. Classification
                    </div>
                    <div className="p-3 rounded-lg border-2 border-primary bg-primary/5 cursor-pointer transition-colors text-sm font-medium flex justify-between items-center">
                      <span>B. Regression</span>
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="p-3 rounded-lg border-2 border-transparent bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors text-sm font-medium">
                      C. Clustering
                    </div>
                    <div className="p-3 rounded-lg border-2 border-transparent bg-secondary/50 hover:bg-secondary cursor-pointer transition-colors text-sm font-medium">
                      D. Dimensionality Reduction
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-primary">
                      <HelpCircle className="h-3 w-3" />
                      <span>Show Hint</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <Button
                  size="lg"
                  className="w-full h-12 text-base shadow-md"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <BrainCircuit className="mr-2 h-5 w-5" />
                  )}
                  Generate Quiz
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Generating {questionCount[0]} questions based on your settings...
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
