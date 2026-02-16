import React from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import defaultVideoThumbnail from '../assets/default-video-thumbnail.svg'
import {
    ArrowRight,
    Check,
    FileText,
    BrainCircuit,
    Play,
    Shield,
    Lock,
    Globe,
    UploadCloud,
    Cpu,
    GraduationCap,
    Zap,
} from 'lucide-react'

const faqItems = [
    {
        q: 'Is Lectura free to start?',
        a: 'Yes. You can start with the free plan and no credit card is required.',
    },
    {
        q: 'What files can I upload?',
        a: 'You can paste a YouTube link or upload supported lecture/document formats from the content input page.',
    },
    {
        q: 'How accurate are the summaries and quizzes?',
        a: 'Quality depends on source quality, but outputs are designed for study workflows and can be regenerated or refined.',
    },
    {
        q: 'Is my data private?',
        a: 'Your data is processed with privacy in mind, encrypted in transit, and handled under secure application controls.',
    },
    {
        q: 'Can I export my materials?',
        a: 'Yes. You can export generated study materials such as summaries and quiz/flashcard-related outputs where supported.',
    },
    {
        q: 'Who is this built for?',
        a: 'University students, especially those preparing for exams, thesis work, and diploma projects.',
    },
]

export function LandingPage() {
    const scrollToSection = (id: string) => {
        const element = document.getElementById(id)
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' })
        }
    }

    return (
        <div className="min-h-screen bg-background flex flex-col font-sans selection:bg-primary/20">
            <header className="fixed top-0 w-full z-50 bg-background/85 backdrop-blur-md border-b">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="flex items-center gap-2 font-bold text-xl tracking-tight group"
                    >
                        <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Zap className="h-4 w-4" />
                        </div>
                        <span>Lectura</span>
                    </button>

                    <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
                        <button onClick={() => scrollToSection('features')} className="hover:text-foreground transition-colors">
                            Features
                        </button>
                        <button onClick={() => scrollToSection('how-it-works')} className="hover:text-foreground transition-colors">
                            How it works
                        </button>
                        <button onClick={() => scrollToSection('faq')} className="hover:text-foreground transition-colors">
                            FAQ
                        </button>
                        <button onClick={() => scrollToSection('pricing')} className="hover:text-foreground transition-colors">
                            Pricing
                        </button>
                    </nav>

                    <div className="flex items-center gap-3">
                        <Link to="/login">
                            <Button variant="ghost" className="font-medium">Sign In</Button>
                        </Link>
                        <Link to="/register">
                            <Button className="font-medium shadow-sm hover:shadow-md transition-all">Start Free</Button>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="flex-1 pt-16">
                <section className="relative py-20 md:py-28 px-4 text-center max-w-6xl mx-auto overflow-hidden">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-primary/5 rounded-full blur-3xl -z-10" />

                    <div className="inline-flex items-center rounded-full border bg-background/70 backdrop-blur px-3 py-1 text-sm font-medium text-muted-foreground mb-8">
                        <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                        Beta • Join 50+ student testers
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-8">
                        Turn any lecture into{' '}
                        <span className="bg-gradient-to-r from-primary via-blue-600 to-violet-600 bg-clip-text text-transparent inline-block">
                            structured knowledge
                        </span>
                        .
                    </h1>

                    <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed">
                        Upload a lecture or paste a YouTube link, then get summaries, quizzes, and flashcards in minutes.
                        Perfect for exams, coursework, thesis, and diploma-project preparation.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link to="/register">
                            <Button size="lg" className="h-12 px-8 text-base shadow-lg hover:shadow-xl transition-all group">
                                Start Free — No Credit Card Required
                                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </Link>
                        <Button
                            variant="outline"
                            size="lg"
                            className="h-12 px-8 text-base"
                            onClick={() => scrollToSection('demo')}
                        >
                            Watch 45s Product Walkthrough
                        </Button>
                    </div>

                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="outline" className="px-3 py-1 rounded-full"><Shield className="h-3.5 w-3.5 mr-1.5" /> GDPR Compliant</Badge>
                        <Badge variant="outline" className="px-3 py-1 rounded-full"><Lock className="h-3.5 w-3.5 mr-1.5" /> Encrypted & Secure</Badge>
                        <Badge variant="outline" className="px-3 py-1 rounded-full"><Globe className="h-3.5 w-3.5 mr-1.5" /> Your data stays private</Badge>
                    </div>

                    <div className="mt-16 pt-8 border-t border-border/50 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                        <div>
                            <div className="text-3xl font-bold">50+</div>
                            <div className="text-sm text-muted-foreground font-medium uppercase tracking-wide mt-1">Beta Students</div>
                        </div>
                        <div className="md:border-l border-border/50">
                            <div className="text-3xl font-bold">500+</div>
                            <div className="text-sm text-muted-foreground font-medium uppercase tracking-wide mt-1">Summaries Generated</div>
                        </div>
                        <div className="md:border-l border-border/50">
                            <div className="text-xl md:text-2xl font-bold">Built for university students worldwide</div>
                            <div className="text-sm text-muted-foreground font-medium uppercase tracking-wide mt-1">Student-first product</div>
                        </div>
                    </div>
                </section>

                <section id="demo" className="py-16 container mx-auto px-4 scroll-mt-20">
                    <div className="grid lg:grid-cols-2 gap-8 items-stretch">
                        <Card className="border shadow-sm overflow-hidden">
                            <CardContent className="p-0">
                                <div className="relative aspect-video bg-secondary/40">
                                    <img src={defaultVideoThumbnail} alt="Lectura product demo preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                                        <div className="h-14 w-14 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-lg">
                                            <Play className="h-6 w-6 ml-0.5" />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5 space-y-2">
                                    <h3 className="font-bold text-lg">45-second walkthrough</h3>
                                    <p className="text-sm text-muted-foreground">Upload → AI Summary → Quiz → Flashcards</p>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid sm:grid-cols-3 gap-4">
                            {[
                                { title: 'Cornell Summary', sub: 'Structured notes' },
                                { title: 'Quiz Interface', sub: 'Instant knowledge checks' },
                                { title: 'Flashcard Study', sub: 'Active recall flow' },
                            ].map((preview) => (
                                <Card key={preview.title} className="border shadow-sm">
                                    <CardContent className="p-4 space-y-3">
                                        <div className="aspect-[4/3] rounded-lg border bg-gradient-to-br from-secondary/50 to-secondary/20 flex items-center justify-center text-xs text-muted-foreground">
                                            Product screenshot slot
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm">{preview.title}</p>
                                            <p className="text-xs text-muted-foreground">{preview.sub}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </section>

                <section id="how-it-works" className="py-20 bg-secondary/20 scroll-mt-20">
                    <div className="container mx-auto px-4">
                        <div className="text-center max-w-2xl mx-auto mb-12">
                            <h2 className="text-3xl md:text-4xl font-bold mb-3">How it works</h2>
                            <p className="text-muted-foreground">Simple workflow from lecture input to exam-ready materials.</p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {[
                                { n: '1', icon: UploadCloud, title: 'Upload', text: 'Paste a YouTube link or upload your lecture/document.' },
                                { n: '2', icon: Cpu, title: 'AI Processes', text: 'Lectura generates structured notes, key concepts, and practice content.' },
                                { n: '3', icon: GraduationCap, title: 'Study', text: 'Review summary, take quizzes, and revise with flashcards.' },
                            ].map((step) => {
                                const Icon = step.icon
                                return (
                                    <Card key={step.n} className="border shadow-sm">
                                        <CardContent className="p-6 space-y-4">
                                            <Badge variant="secondary" className="w-fit rounded-full px-3">Step {step.n}</Badge>
                                            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                                                <Icon className="h-6 w-6" />
                                            </div>
                                            <h3 className="text-lg font-bold">{step.title}</h3>
                                            <p className="text-sm text-muted-foreground">{step.text}</p>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                </section>

                <section id="features" className="py-20 container mx-auto px-4 scroll-mt-20">
                    <div className="text-center max-w-3xl mx-auto mb-14">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for students like you</h2>
                        <p className="text-lg text-muted-foreground">
                            Spend less time rewriting lectures and more time actually learning.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <Card className="border shadow-sm">
                            <CardContent className="p-8 space-y-4">
                                <div className="h-14 w-14 rounded-2xl bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                                    <FileText className="h-7 w-7" />
                                </div>
                                <h3 className="text-xl font-bold">Smart Summaries</h3>
                                <p className="text-muted-foreground leading-relaxed">
                                    Cornell, bullets, paragraph, or smart format — choose the summary style that fits your subject.
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border shadow-sm">
                            <CardContent className="p-8 space-y-4">
                                <div className="h-14 w-14 rounded-2xl bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300 flex items-center justify-center">
                                    <BrainCircuit className="h-7 w-7" />
                                </div>
                                <h3 className="text-xl font-bold">Instant Quizzes</h3>
                                <p className="text-muted-foreground leading-relaxed">
                                    Generate practice questions from your own lecture material and quickly find knowledge gaps.
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border shadow-sm">
                            <CardContent className="p-8 space-y-4">
                                <div className="h-14 w-14 rounded-2xl bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300 flex items-center justify-center">
                                    <Play className="h-7 w-7 ml-1" />
                                </div>
                                <h3 className="text-xl font-bold">Flashcard Decks</h3>
                                <p className="text-muted-foreground leading-relaxed">
                                    Convert complex topics into active-recall cards for faster revision before exams.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <section id="comparison" className="py-20 bg-secondary/20">
                    <div className="container mx-auto px-4 max-w-5xl">
                        <div className="text-center mb-10">
                            <h2 className="text-3xl font-bold mb-3">Manual study vs Lectura</h2>
                            <p className="text-muted-foreground">Visualize where your time goes.</p>
                        </div>

                        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary/40">
                                    <tr>
                                        <th className="text-left p-4 font-semibold">Task</th>
                                        <th className="text-left p-4 font-semibold">Manual Method</th>
                                        <th className="text-left p-4 font-semibold">Lectura</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-t"><td className="p-4 font-medium">Lecture to notes</td><td className="p-4 text-muted-foreground">1-2 hours</td><td className="p-4">5-10 minutes</td></tr>
                                    <tr className="border-t"><td className="p-4 font-medium">Create quiz questions</td><td className="p-4 text-muted-foreground">30-60 minutes</td><td className="p-4">Instant</td></tr>
                                    <tr className="border-t"><td className="p-4 font-medium">Build flashcards</td><td className="p-4 text-muted-foreground">20-40 minutes</td><td className="p-4">Instant</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <section id="faq" className="py-20 container mx-auto px-4 max-w-4xl scroll-mt-20">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-3">Frequently asked questions</h2>
                        <p className="text-muted-foreground">Quick answers before you get started.</p>
                    </div>

                    <div className="space-y-3">
                        {faqItems.map((item) => (
                            <details key={item.q} className="group rounded-xl border bg-card px-5 py-4">
                                <summary className="cursor-pointer font-semibold list-none flex items-center justify-between gap-4">
                                    <span>{item.q}</span>
                                    <span className="text-muted-foreground group-open:rotate-45 transition-transform">+</span>
                                </summary>
                                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                            </details>
                        ))}
                    </div>
                </section>

                <section id="pricing" className="py-20 px-4 container mx-auto max-w-5xl scroll-mt-20">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl font-bold mb-4">Simple, transparent pricing</h2>
                        <p className="text-muted-foreground">Start free. Upgrade only when you need more.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 items-start">
                        <div className="rounded-2xl border bg-card p-8 shadow-sm">
                            <h3 className="text-xl font-bold mb-2">Student</h3>
                            <div className="text-4xl font-bold mb-6">$0 <span className="text-base font-normal text-muted-foreground">/ month</span></div>
                            <ul className="space-y-3 mb-8 text-sm">
                                {['5 summaries per month', 'Basic quizzes', 'Flashcard study', 'Core exports'].map((feature) => (
                                    <li key={feature} className="flex items-center gap-2">
                                        <Check className="h-4 w-4 text-green-600" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            <Link to="/register">
                                <Button variant="outline" className="w-full h-12 text-base">Start Free — No Card</Button>
                            </Link>
                        </div>

                        <div className="rounded-2xl border-2 border-primary bg-primary/5 p-8 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-bl-xl">POPULAR</div>
                            <h3 className="text-xl font-bold mb-2 text-primary">Pro Scholar</h3>
                            <div className="text-4xl font-bold mb-6">$12 <span className="text-base font-normal text-muted-foreground">/ month</span></div>
                            <ul className="space-y-3 mb-8 text-sm">
                                {['Unlimited summaries', 'Advanced quiz generation', 'Priority processing', 'Expanded export options'].map((feature) => (
                                    <li key={feature} className="flex items-center gap-2">
                                        <Check className="h-4 w-4 text-primary" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            <Link to="/register?plan=pro">
                                <Button className="w-full h-12 text-base">Start Free Trial</Button>
                            </Link>
                        </div>
                    </div>
                </section>

                <section id="about-project" className="py-20 bg-secondary/20 border-y">
                    <div className="container mx-auto px-4 max-w-4xl">
                        <Card className="border shadow-sm">
                            <CardContent className="p-8 space-y-4">
                                <Badge variant="secondary" className="w-fit">Diploma Project</Badge>
                                <h2 className="text-2xl md:text-3xl font-bold">About This Project</h2>
                                <p className="text-muted-foreground leading-relaxed">
                                    Lectura was built as a diploma project to solve a real student problem: too much time is spent
                                    transcribing lectures instead of learning.
                                </p>
                                <p className="text-muted-foreground leading-relaxed">
                                    This is a student-built product, designed with real academic workflows in mind.
                                </p>
                                <div className="flex flex-wrap gap-3 pt-2">
                                    <a href="https://github.com/asanaliwhy/AI-Lecture-summarizer-with-learning-activities" target="_blank" rel="noreferrer">
                                        <Button variant="outline">GitHub</Button>
                                    </a>
                                    <a href="https://github.com/asanaliwhy/AI-Lecture-summarizer-with-learning-activities/blob/main/README.md" target="_blank" rel="noreferrer">
                                        <Button variant="outline">Documentation</Button>
                                    </a>
                                    <a href="mailto:support@lectura.app">
                                        <Button variant="outline">Project Report Request</Button>
                                    </a>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>
            </main>

            <footer className="border-t py-10 bg-secondary/30">
                <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-5">
                    <div className="flex items-center gap-2 font-bold text-lg">
                        <div className="h-6 w-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs">
                            <Zap className="h-3 w-3" />
                        </div>
                        <span>Lectura</span>
                    </div>
                    <div className="text-sm text-muted-foreground">Made by a student, for students.</div>
                    <div className="text-sm text-muted-foreground">Support: support@lectura.app</div>
                </div>
            </footer>
        </div>
    )
}
