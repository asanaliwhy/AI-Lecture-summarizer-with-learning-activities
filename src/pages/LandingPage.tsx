import React from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import {
  Check,
  ArrowRight,
  Play,
  FileText,
  BrainCircuit,
  Star,
  Zap,
  Shield,
  Users,
} from 'lucide-react'
export function LandingPage() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
      })
    }
  }
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary/20">
      {/* Navigation */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b transition-all duration-300">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight group cursor-pointer">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center group-hover:scale-110 transition-transform">
              <Zap className="h-4 w-4" />
            </div>
            <span>Lectura</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <button
              onClick={() => scrollToSection('features')}
              className="hover:text-foreground transition-colors hover:underline underline-offset-4"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('testimonials')}
              className="hover:text-foreground transition-colors hover:underline underline-offset-4"
            >
              Testimonials
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="hover:text-foreground transition-colors hover:underline underline-offset-4"
            >
              Pricing
            </button>
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button
                variant="ghost"
                className="font-medium hover:bg-secondary"
              >
                Sign In
              </Button>
            </Link>
            <Link to="/register">
              <Button className="font-medium shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-16">
        {/* Hero Section */}
        <section className="relative py-20 md:py-32 px-4 text-center max-w-5xl mx-auto overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/5 rounded-full blur-3xl -z-10 animate-pulse" />

          <div className="inline-flex items-center rounded-full border bg-background/50 backdrop-blur px-3 py-1 text-sm font-medium text-muted-foreground mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 hover:bg-background/80 transition-colors cursor-default">
            <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
            Now available for early access
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            Turn any lecture into <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-primary via-blue-600 to-violet-600 bg-clip-text text-transparent pb-2 inline-block hover:scale-105 transition-transform cursor-default">
              structured knowledge.
            </span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
            Paste a YouTube link or upload a recording. Get structured
            summaries, quizzes, and flashcards instantly. Built for serious
            students who value their time.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            <Link to="/register">
              <Button
                size="lg"
                className="h-12 px-8 text-base shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 group"
              >
                Start Learning Free{' '}
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/demo">
              <Button
                variant="outline"
                size="lg"
                className="h-12 px-8 text-base bg-background/50 backdrop-blur hover:bg-background/80 hover:border-primary/50 transition-all"
              >
                View Demo
              </Button>
            </Link>
          </div>

          {/* Social Proof Bar */}
          <div className="mt-20 pt-8 border-t border-border/50 grid grid-cols-1 md:grid-cols-3 gap-8 text-center animate-in fade-in duration-1000 delay-300">
            <div className="group cursor-default">
              <div className="text-3xl font-bold text-foreground group-hover:text-primary transition-colors">
                10,000+
              </div>
              <div className="text-sm text-muted-foreground font-medium uppercase tracking-wide mt-1">
                Students
              </div>
            </div>
            <div className="md:border-l border-border/50 group cursor-default">
              <div className="text-3xl font-bold text-foreground group-hover:text-primary transition-colors">
                500+
              </div>
              <div className="text-sm text-muted-foreground font-medium uppercase tracking-wide mt-1">
                Universities
              </div>
            </div>
            <div className="md:border-l border-border/50 group cursor-default">
              <div className="text-3xl font-bold text-foreground group-hover:text-primary transition-colors">
                1M+
              </div>
              <div className="text-sm text-muted-foreground font-medium uppercase tracking-wide mt-1">
                Summaries Generated
              </div>
            </div>
          </div>
        </section>

        {/* Trusted By */}
        <section className="py-12 bg-secondary/30 border-y">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-8">
              Trusted by students at
            </p>
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
              <span className="text-xl font-bold font-serif hover:text-primary cursor-default transition-colors">
                HARVARD
              </span>
              <span className="text-xl font-bold font-serif hover:text-primary cursor-default transition-colors">
                MIT
              </span>
              <span className="text-xl font-bold font-serif hover:text-primary cursor-default transition-colors">
                Stanford
              </span>
              <span className="text-xl font-bold font-serif hover:text-primary cursor-default transition-colors">
                Oxford
              </span>
              <span className="text-xl font-bold font-serif hover:text-primary cursor-default transition-colors">
                Berkeley
              </span>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section
          id="features"
          className="py-24 container mx-auto px-4 scroll-mt-20"
        >
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to ace your exams
            </h2>
            <p className="text-lg text-muted-foreground">
              Stop wasting time transcribing. Start understanding.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="group hover:shadow-xl transition-all duration-300 border-border/50 hover:border-primary/50 hover:-translate-y-1 cursor-default">
              <CardContent className="p-8 space-y-4">
                <div className="h-14 w-14 rounded-2xl bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
                  <FileText className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold group-hover:text-blue-600 transition-colors">
                  Smart Summaries
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Get Cornell-style notes from any video or audio file. Our AI
                  identifies key concepts, definitions, and action items
                  automatically.
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-border/50 hover:border-primary/50 hover:-translate-y-1 cursor-default">
              <CardContent className="p-8 space-y-4">
                <div className="h-14 w-14 rounded-2xl bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
                  <BrainCircuit className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold group-hover:text-purple-600 transition-colors">
                  Instant Quizzes
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Test your knowledge immediately. Generate multiple-choice and
                  open-ended questions based on the lecture content.
                </p>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-border/50 hover:border-primary/50 hover:-translate-y-1 cursor-default">
              <CardContent className="p-8 space-y-4">
                <div className="h-14 w-14 rounded-2xl bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
                  <Play className="h-7 w-7 ml-1" />
                </div>
                <h3 className="text-xl font-bold group-hover:text-orange-600 transition-colors">
                  Flashcard Decks
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Convert lectures into spaced-repetition flashcards. Study
                  efficiently and retain information longer with active recall.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Testimonials */}
        <section
          id="testimonials"
          className="py-24 bg-secondary/20 scroll-mt-20"
        >
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-16">
              Loved by students everywhere
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  quote:
                    'Lectura saved my semester. I used to spend hours transcribing lectures, now I just review the summaries and take quizzes.',
                  author: 'Sarah J.',
                  role: 'Med Student, Johns Hopkins',
                },
                {
                  quote:
                    'The flashcard generation is magic. It picks out exactly the concepts I would have missed on my own.',
                  author: 'Michael C.',
                  role: 'Law Student, Yale',
                },
                {
                  quote:
                    'I can process a 2-hour lecture in minutes. This is the biggest productivity hack for university students.',
                  author: 'Jessica T.',
                  role: 'Engineering, MIT',
                },
              ].map((t, i) => (
                <Card
                  key={i}
                  className="border-none shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-default"
                >
                  <CardContent className="p-8 flex flex-col h-full">
                    <div className="flex gap-1 text-yellow-500 mb-4">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className="h-4 w-4 fill-current animate-in zoom-in duration-300"
                          style={{
                            animationDelay: `${s * 100}ms`,
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-lg font-medium leading-relaxed mb-6 flex-1 text-foreground/90">
                      "{t.quote}"
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                        {t.author[0]}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{t.author}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.role}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section
          id="pricing"
          className="py-24 px-4 container mx-auto max-w-5xl scroll-mt-20"
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-muted-foreground">
              Start for free, upgrade when you need more power.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Free Plan */}
            <div className="rounded-2xl border bg-card p-8 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group">
              <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                Student
              </h3>
              <div className="text-4xl font-bold mb-6">
                $0{' '}
                <span className="text-base font-normal text-muted-foreground">
                  / month
                </span>
              </div>
              <ul className="space-y-4 mb-8">
                {[
                  '5 summaries per month',
                  'Basic quizzes',
                  'Standard processing speed',
                  '720p video support',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <div className="h-5 w-5 rounded-full bg-green-100 dark:bg-green-500/15 text-green-600 dark:text-green-300 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link to="/register">
                <Button
                  variant="outline"
                  className="w-full h-12 text-base hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  Get Started
                </Button>
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="rounded-2xl border-2 border-primary bg-primary/5 p-8 shadow-xl relative overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 group">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-bl-xl shadow-sm">
                MOST POPULAR
              </div>
              <h3 className="text-xl font-bold mb-2 text-primary">
                Pro Scholar
              </h3>
              <div className="text-4xl font-bold mb-6">
                $12{' '}
                <span className="text-base font-normal text-muted-foreground">
                  / month
                </span>
              </div>
              <ul className="space-y-4 mb-8">
                {[
                  'Unlimited summaries',
                  'Advanced quiz generation',
                  'Priority processing',
                  '4K video support',
                  'Export to PDF/Notion',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Check className="h-3 w-3" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link to="/register?plan=pro">
                <Button className="w-full h-12 text-base shadow-lg hover:shadow-xl transition-all">
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12 bg-secondary/30">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-lg group cursor-pointer">
            <div className="h-6 w-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs group-hover:scale-110 transition-transform">
              <Zap className="h-3 w-3" />
            </div>
            <span>Lectura</span>
          </div>
          <div className="flex gap-8 text-sm text-muted-foreground">
            <a
              href="#"
              className="hover:text-foreground transition-colors hover:underline"
            >
              Terms
            </a>
            <a
              href="#"
              className="hover:text-foreground transition-colors hover:underline"
            >
              Privacy
            </a>
            <a
              href="#"
              className="hover:text-foreground transition-colors hover:underline"
            >
              Contact
            </a>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            Made with <span className="text-red-500 animate-pulse">❤️</span> for
            students
          </div>
        </div>
      </footer>
    </div>
  )
}
