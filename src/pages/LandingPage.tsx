import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useScrollReveal } from '../hooks/useScrollReveal'
import './LandingPage.css'

/* ─── data ─── */
type FeatureCard = { title: string; body: string; icon: string; tag: string; tagClass: 'blue' | 'purple' | 'orange'; wide?: boolean }
type FormatCard = { icon: string; title: string; text: string; accent: 'blue' | 'purple' | 'orange' }
type Testimonial = { quote: string; name: string; role: string; avatar: string; avatarClass: 'aisha' | 'dmitri' | 'sara' }

const featureCards: FeatureCard[] = [
  { icon: '🧠', title: 'Four intelligent formats', body: 'Cornell notes, bullet points, paragraph summaries, and smart overviews — each crafted by specialized prompts for maximum retention.', tag: '4 formats', tagClass: 'blue', wide: true },
  { icon: '⚡', title: 'Real-time processing', body: 'Watch your summary generate in real time via WebSocket streaming. No waiting, no refreshing.', tag: 'WebSocket', tagClass: 'blue' },
  { icon: '🃏', title: 'Spaced repetition', body: 'Flashcards powered by the SM-2 algorithm. Rate difficulty and let the system optimize your review schedule.', tag: 'SM-2 algorithm', tagClass: 'purple' },
  { icon: '🎯', title: 'Adaptive quizzes', body: 'Multiple choice and true/false questions across three difficulty levels with timer and hints.', tag: '3 difficulty levels', tagClass: 'purple' },
  { icon: '📄', title: 'Beautiful PDF exports', body: 'Download any summary as a beautifully formatted PDF, ready for print or offline study.', tag: 'Export ready', tagClass: 'orange' },
]

const formatCards: FormatCard[] = [
  { icon: '📋', title: 'Cornell Method', text: 'Two-column cue/note layout with a synthesis summary. The gold standard for lecture retention.', accent: 'blue' },
  { icon: '•', title: 'Bullet Points', text: 'Structured breakdowns with definitions, functions, examples and specific key takeaways.', accent: 'blue' },
  { icon: '¶', title: 'Paragraph', text: 'Flowing prose with subheadings and a metaphor — ideal for writing essays or deep comprehension.', accent: 'purple' },
  { icon: '✦', title: 'Smart Summary', text: 'Key concepts with real-world applications, structured data tables, and interesting facts.', accent: 'orange' },
]

const testimonials: Testimonial[] = [
  { quote: 'I turned a 2-hour lecture into Cornell notes in 30 seconds. My exam scores went up immediately.', name: 'Aisha M.', role: 'Medical student, KazNMU', avatar: 'A', avatarClass: 'aisha' },
  { quote: 'The flashcard spaced repetition is genuinely better than Anki for video content. It just works.', name: 'Dmitri K.', role: 'CS student, NazU', avatar: 'D', avatarClass: 'dmitri' },
  { quote: "Finally an AI study tool that doesn't hallucinate. The chat actually refuses to go off-topic.", name: 'Sara T.', role: 'Law student, KIMEP', avatar: 'S', avatarClass: 'sara' },
]

/* ─── component ─── */
export function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [scrollPct, setScrollPct] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isYearly, setIsYearly] = useState(false)

  const navigate = useNavigate()

  useScrollReveal()

  /* scroll listener — throttled with rAF */
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 60)
          const h = document.documentElement.scrollHeight - window.innerHeight
          setScrollPct(h > 0 ? window.scrollY / h : 0)
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = useCallback((id: string) => {
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const studentPrice = isYearly ? '$4.9' : '$7'
  const proPrice = isYearly ? '$8.4' : '$12'
  const period = isYearly ? '/mo billed yearly' : '/mo'

  return (
    <div className="landing-page">
      {/* Scroll progress */}
      <div className="scroll-progress" style={{ transform: `scaleX(${scrollPct})` }} />

      {/* ── NAV ── */}
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <a className="lp-logo" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <div className="lp-logo-icon">✦</div>
          <span>Lectura</span>
        </a>

        <div className="lp-nav-links">
          <a href="#how" onClick={e => { e.preventDefault(); scrollTo('how') }}>How it works</a>
          <a href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>Features</a>
          <a href="#pricing" onClick={e => { e.preventDefault(); scrollTo('pricing') }}>Pricing</a>
          <Link to="/login">Sign in</Link>
          <Link to="/register" className="lp-nav-cta">Start for free →</Link>
        </div>

        <button className={`lp-hamburger${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </nav>

      {/* Mobile menu */}
      <div className={`lp-mobile-menu${menuOpen ? ' open' : ''}`}>
        <a href="#how" onClick={e => { e.preventDefault(); scrollTo('how') }}>How it works</a>
        <a href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>Features</a>
        <a href="#pricing" onClick={e => { e.preventDefault(); scrollTo('pricing') }}>Pricing</a>
        <Link to="/login">Sign in</Link>
        <Link to="/register" className="lp-nav-cta" style={{ alignSelf: 'flex-start' }}>Start for free →</Link>
      </div>

      {/* ── HERO ── */}
      <section className="lp-hero">
        <div className="lp-orb lp-orb-1" />
        <div className="lp-orb lp-orb-2" />
        <div className="lp-orb lp-orb-3" />

        <div className="lp-badge reveal d1">
          <span className="lp-badge-dot" />
          AI-powered study intelligence
        </div>

        <h1 className="reveal d2">
          Learn anything.<br /><em>Deeply.</em>
        </h1>

        <p className="lp-hero-sub reveal d3">
          Paste a YouTube link or upload a PDF. Lectura transforms it into Cornell notes, flashcards, quizzes, and summaries — in seconds.
        </p>

        <div className="lp-hero-btns reveal d4">
          <Link to="/register" className="lp-btn-primary">Start learning free →</Link>
          <a href="#how" className="lp-btn-secondary" onClick={e => { e.preventDefault(); scrollTo('how') }}>See how it works ↓</a>
        </div>

        <div className="lp-stats reveal d5">
          <div className="lp-stat"><div className="lp-stat-num">4<span>×</span></div><div className="lp-stat-label">Study formats</div></div>
          <div className="lp-stat"><div className="lp-stat-num"><span>∞</span></div><div className="lp-stat-label">Topics supported</div></div>
          <div className="lp-stat"><div className="lp-stat-num">30<span>s</span></div><div className="lp-stat-label">To first summary</div></div>
          <div className="lp-stat"><div className="lp-stat-num">147</div><div className="lp-stat-label">Tests passing</div></div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="lp-how" id="how">
        <div className="lp-how-grid">
          <div className="reveal-left">
            <div className="lp-section-label">PROCESS</div>
            <h2>Three steps to <em>mastery</em></h2>
            <p className="lp-section-sub">From any source to study-ready material in seconds. No transcription, no manual notes.</p>

            <div className="lp-steps">
              <div className="lp-step">
                <div className="lp-step-num">01</div>
                <div><div className="lp-step-title">Paste any source</div><div className="lp-step-body">YouTube lecture, podcast, PDF document. Lectura handles it all.</div></div>
              </div>
              <div className="lp-step">
                <div className="lp-step-num">02</div>
                <div><div className="lp-step-title">Choose your format</div><div className="lp-step-body">Cornell notes, bullet summaries, paragraph, or smart overview.</div></div>
              </div>
              <div className="lp-step">
                <div className="lp-step-num">03</div>
                <div><div className="lp-step-title">Study and retain</div><div className="lp-step-body">Quizzes, spaced-repetition flashcards, and beautiful PDF exports.</div></div>
              </div>
            </div>
          </div>

          <div className="reveal-right">
            <div className="lp-how-visual">
              <div className="lp-how-glow" />
              <div className="lp-mock-url">
                <span className="lp-mock-url-icon">▶</span>
                <span className="lp-mock-url-text">youtube.com/watch?v=dQw4w9WgXcQ</span>
              </div>
              <div className="lp-mock-label">CORNELL NOTES · GENERATED</div>
              <div className="lp-mock-content">
                <div className="lp-shimmer" style={{ width: '80%' }} />
                <div className="lp-shimmer" style={{ width: '95%' }} />
                <div className="lp-shimmer accent" style={{ width: '60%' }} />
                <div className="lp-shimmer" style={{ width: '85%' }} />
                <div className="lp-shimmer" style={{ width: '70%' }} />
                <div className="lp-shimmer accent" style={{ width: '55%' }} />
                <div className="lp-shimmer" style={{ width: '90%' }} />
                <div className="lp-shimmer" style={{ width: '75%' }} />
                <div className="lp-shimmer" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="lp-features" id="features">
        <div className="lp-features-inner">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 60 }}>
            <div className="lp-section-label">CAPABILITIES</div>
            <h2>Everything you need to <em>study smarter</em></h2>
          </div>

          <div className="lp-features-grid">
            {featureCards.map((c, i) => (
              <div key={i} className={`lp-fcard reveal d${i + 1}${c.wide ? ' wide' : ''}`}>
                <div className="lp-fcard-icon">{c.icon}</div>
                <div className="lp-fcard-title">{c.title}</div>
                <div className="lp-fcard-body">{c.body}</div>
                <div className={`lp-fcard-tag ${c.tagClass}`}>{c.tag}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FORMATS ── */}
      <section className="lp-formats">
        <div className="lp-formats-inner">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2>One source,<br /><em>four perspectives</em></h2>
            <p className="lp-section-sub">Every format crafted by prompt engineers with 78-test quality suites.</p>
          </div>

          <div className="lp-formats-grid">
            {formatCards.map((c, i) => (
              <div key={i} className={`lp-fmt-card ${c.accent} reveal d${i + 1}`}>
                <div className={`lp-fmt-icon ${c.accent}`}>{c.icon}</div>
                <div className="lp-fmt-title">{c.title}</div>
                <div className="lp-fmt-text">{c.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="lp-testimonials">
        <div className="lp-testimonials-inner">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2>Students who <em>study differently</em></h2>
          </div>

          <div className="lp-test-grid">
            {testimonials.map((t, i) => (
              <div key={i} className={`lp-test-card reveal d${i + 1}`}>
                <div className="lp-test-stars">★★★★★</div>
                <div className="lp-test-quote">"{t.quote}"</div>
                <div className="lp-test-author">
                  <div className={`lp-test-avatar ${t.avatarClass}`}>{t.avatar}</div>
                  <div><div className="lp-test-name">{t.name}</div><div className="lp-test-role">{t.role}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="lp-pricing-section" id="pricing">
        <div className="lp-pricing-inner">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 20 }}>
            <h2>Simple, <em>honest</em> pricing</h2>
            <p className="lp-section-sub">No hidden fees. Cancel anytime. Start free today.</p>
          </div>

          <div className="lp-toggle-wrap reveal d1">
            <div className="lp-toggle">
              <button className={!isYearly ? 'active' : ''} onClick={() => setIsYearly(false)}>Monthly</button>
              <button className={isYearly ? 'active' : ''} onClick={() => setIsYearly(true)}>Yearly</button>
            </div>
            {isYearly && <span className="lp-save-badge">Save 30%</span>}
          </div>

          <div className="lp-pricing-grid">
            {/* Free */}
            <div className="lp-plan reveal d1">
              <div className="lp-plan-name">FREE</div>
              <div className="lp-plan-price"><span className="lp-plan-price-val">$0</span></div>
              <div className="lp-plan-price-note">forever free</div>
              <div className="lp-plan-divider" />
              <ul className="lp-plan-features">
                <li><span className="check">✓</span> 5 summaries/month</li>
                <li><span className="check">✓</span> All 4 formats</li>
                <li><span className="check">✓</span> Quiz generation</li>
                <li><span className="check">✓</span> Basic flashcards</li>
                <li className="disabled"><span className="dash">–</span> PDF exports</li>
                <li className="disabled"><span className="dash">–</span> Spaced repetition</li>
                <li className="disabled"><span className="dash">–</span> Priority processing</li>
              </ul>
              <Link to="/register" className="lp-plan-btn outline">Get started free</Link>
            </div>

            {/* Student */}
            <div className="lp-plan featured reveal d2">
              <div className="lp-popular-badge">POPULAR</div>
              <div className="lp-plan-name">STUDENT</div>
              <div className="lp-plan-price"><span className="lp-plan-price-val">{studentPrice}</span><span className="lp-plan-price-period">{period}</span></div>
              <div className="lp-plan-price-note">{isYearly ? 'billed yearly' : 'cancel anytime'}</div>
              <div className="lp-plan-divider" />
              <ul className="lp-plan-features">
                <li><span className="check">✓</span> 50 summaries/month</li>
                <li><span className="check">✓</span> All 4 formats</li>
                <li><span className="check">✓</span> Quiz generation</li>
                <li><span className="check">✓</span> Spaced repetition</li>
                <li><span className="check">✓</span> PDF exports</li>
                <li><span className="check">✓</span> Ask AI chat</li>
                <li className="disabled"><span className="dash">–</span> Unlimited summaries</li>
              </ul>
              <Link to="/register?plan=student" className="lp-plan-btn filled">Start Student plan →</Link>
            </div>

            {/* Pro */}
            <div className="lp-plan reveal d3">
              <div className="lp-plan-name">PRO</div>
              <div className="lp-plan-price"><span className="lp-plan-price-val">{proPrice}</span><span className="lp-plan-price-period">{period}</span></div>
              <div className="lp-plan-price-note">{isYearly ? 'billed yearly' : 'cancel anytime'}</div>
              <div className="lp-plan-divider" />
              <ul className="lp-plan-features">
                <li><span className="check">✓</span> Unlimited summaries</li>
                <li><span className="check">✓</span> All 4 formats</li>
                <li><span className="check">✓</span> Quiz generation</li>
                <li><span className="check">✓</span> Spaced repetition</li>
                <li><span className="check">✓</span> PDF exports</li>
                <li><span className="check">✓</span> Ask AI chat</li>
                <li><span className="check">✓</span> Priority processing</li>
              </ul>
              <Link to="/register?plan=pro" className="lp-plan-btn outline">Start Pro plan →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta-section">
        <div className="lp-section-label reveal" style={{ position: 'relative', zIndex: 2 }}>GET STARTED</div>
        <h2 className="reveal d1" style={{ position: 'relative', zIndex: 2 }}>Ready to study<br /><em>like never before?</em></h2>
        <p className="lp-section-sub reveal d2" style={{ position: 'relative', zIndex: 2, maxWidth: 520, margin: '0 auto' }}>Join students already using Lectura to transform how they learn.</p>
        <div className="reveal d3" style={{ position: 'relative', zIndex: 2, marginTop: 32 }}>
          <Link to="/register" className="lp-btn-primary">Start learning free →</Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <a className="lp-logo" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <div className="lp-logo-icon">✦</div>
          <span>Lectura</span>
        </a>
        <div className="lp-footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Contact</a>
        </div>
        <div className="lp-footer-copy">© 2026 Lectura</div>
      </footer>
    </div>
  )
}
