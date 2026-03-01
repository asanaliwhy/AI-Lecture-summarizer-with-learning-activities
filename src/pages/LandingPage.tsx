import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useScrollReveal } from '../hooks/useScrollReveal'
import './LandingPage.css'

/* ─── data ─── */
type Testimonial = { quote: string; name: string; role: string; initial: string }

const testimonials: Testimonial[] = [
  { quote: 'I turned a two-hour lecture into Cornell notes in 30 seconds. My exam scores went up immediately.', name: 'Aisha M.', role: 'Medicine · KazNMU, Almaty', initial: 'A' },
  { quote: "The flashcard system is genuinely better than Anki for video content. It knows what I haven't reviewed.", name: 'Dmitri K.', role: 'Computer Science · NazU, Astana', initial: 'D' },
  { quote: "Finally an AI study tool that doesn't hallucinate. The chat refuses to go off-topic and stays grounded in the material.", name: 'Sara T.', role: 'Law · KIMEP University, Almaty', initial: 'S' },
]

/* ─── component ─── */
export function LandingPage() {
  const [scrollPct, setScrollPct] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isYearly, setIsYearly] = useState(false)
  const navigate = useNavigate()

  useScrollReveal()

  useEffect(() => {
    const onScroll = () => {
      const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)
      setScrollPct(Math.min(pct, 1))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = useCallback((id: string) => {
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const studentPrice = isYearly ? '4.9' : '7'
  const proPrice = isYearly ? '8.4' : '12'
  const period = isYearly ? 'per month, billed yearly' : 'per month'

  return (
    <div className="landing-page">
      {/* Scroll progress */}
      <div className="scroll-progress" style={{ transform: `scaleX(${scrollPct})` }} />

      {/* ── NAV ── */}
      <nav className="lp-nav">
        <a className="lp-logo" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <div className="lp-logo-mark">L</div>
          Lectura
        </a>

        <ul className="lp-nav-center">
          <li><a href="#how" onClick={e => { e.preventDefault(); scrollTo('how') }}>How it works</a></li>
          <li><a href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>Features</a></li>
          <li><a href="#pricing" onClick={e => { e.preventDefault(); scrollTo('pricing') }}>Pricing</a></li>
        </ul>

        <div className="lp-nav-right">
          <Link to="/login" className="lp-nav-link">Sign in</Link>
          <Link to="/register" className="lp-nav-btn">Get started →</Link>
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
        <Link to="/register" className="lp-nav-btn" style={{ alignSelf: 'flex-start' }}>Get started →</Link>
      </div>

      {/* ── HERO ── */}
      <div className="hero-wrap">
        <div className="hero-grid">
          <div>
            <div className="hero-kicker reveal">
              <span className="kicker-dot" />
              AI study tool · Now available
            </div>
            <h1 className="hero-h1 reveal d1">
              Turn any lecture<br />into <em>deep knowledge</em>
            </h1>
            <p className="hero-body reveal d2">
              Paste a YouTube link or upload a PDF. Lectura generates Cornell notes, flashcards, quizzes, and summaries — engineered for real retention.
            </p>
            <div className="hero-actions reveal d3">
              <Link to="/register" className="btn btn-dark">Start for free →</Link>
              <a href="#how" className="btn btn-ghost" onClick={e => { e.preventDefault(); scrollTo('how') }}>See how it works</a>
            </div>
            <div className="hero-social reveal d4">
              <div className="avatars">
                <div className="avatar" style={{ background: '#dbeafe', color: '#1e40af' }}>A</div>
                <div className="avatar" style={{ background: '#dcfce7', color: '#166534' }}>D</div>
                <div className="avatar" style={{ background: '#fef9c3', color: '#854d0e' }}>S</div>
                <div className="avatar" style={{ background: '#fce7f3', color: '#9d174d' }}>M</div>
              </div>
              <p className="hero-social-text">Trusted by students across Kazakhstan</p>
            </div>
          </div>

          <div className="reveal right d2">
            <div className="preview-card">
              <div className="preview-bar">
                <div className="preview-dots">
                  <div className="preview-dot" style={{ background: '#ff5f57' }} />
                  <div className="preview-dot" style={{ background: '#ffbd2e' }} />
                  <div className="preview-dot" style={{ background: '#28c840' }} />
                </div>
                <div className="preview-url">youtube.com/watch?v=art-of-war-lecture</div>
              </div>
              <div className="preview-body">
                <div className="preview-tabs">
                  <div className="preview-tab active">Cornell</div>
                  <div className="preview-tab">Bullets</div>
                  <div className="preview-tab">Paragraph</div>
                  <div className="preview-tab">Smart</div>
                </div>
                <div className="preview-heading">Sun Tzu's Art of War: Strategy Beyond the Battlefield</div>
                <div className="preview-2col">
                  <div className="preview-cue-col">
                    <div className="preview-col-label">Cues</div>
                    <div className="pline accent w100" />
                    <div className="pline accent w80" />
                    <div className="pline accent w60" />
                    <div className="pline accent w100" />
                    <div className="pline accent w45" />
                  </div>
                  <div className="preview-note-col">
                    <div className="preview-col-label">Notes</div>
                    <div className="pline w100" />
                    <div className="pline w80" />
                    <div className="pline w100" />
                    <div className="pline w60" />
                    <div className="pline w80" />
                    <div className="pline w100" />
                  </div>
                </div>
                <div className="preview-badge">✓ Generated in 28s</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── LOGOS ── */}
      <div className="logos-strip">
        <div className="logos-inner">
          <span className="logos-label">Used by students at</span>
          <div className="logos-list">
            <span className="logo-item">Nazarbayev University</span>
            <span className="logo-item">KIMEP University</span>
            <span className="logo-item">KazNMU</span>
            <span className="logo-item">SDU University</span>
            <span className="logo-item">KBTU</span>
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div className="how-wrap" id="how">
        <div className="how-sticky">
          <p className="section-eyebrow reveal">How it works</p>
          <h2 className="section-title reveal d1">Three steps.<br /><em>One habit.</em></h2>
          <p className="section-body reveal d2">No configuration. No friction. Paste your source, pick your format, and study — under 30 seconds to your first summary.</p>
        </div>
        <div>
          <div className="how-step reveal d1">
            <div className="how-step-num">01</div>
            <div>
              <div className="how-step-title">Paste any source</div>
              <div className="how-step-body">YouTube lectures, university documents, podcast links, academic articles. Lectura extracts the transcript or text and processes it instantly.</div>
              <span className="how-tag">YouTube · Document</span>
            </div>
          </div>
          <div className="how-step reveal d2">
            <div className="how-step-num">02</div>
            <div>
              <div className="how-step-title">Choose your format</div>
              <div className="how-step-body">Cornell Method, Bullet Points, Paragraph essay, or Smart Summary. Each format is engineered with specific prompt rules to maximize the quality of output.</div>
              <span className="how-tag">4 formats</span>
            </div>
          </div>
          <div className="how-step reveal d3">
            <div className="how-step-num">03</div>
            <div>
              <div className="how-step-title">Study and retain</div>
              <div className="how-step-body">Generate a quiz to test yourself. Create spaced-repetition flashcards. Ask AI questions about the material. Export a beautiful PDF.</div>
              <span className="how-tag">Quiz · Flashcards · Export</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FORMATS (dark) ── */}
      <div className="formats-section" id="formats">
        <div className="formats-inner">
          <div className="formats-header">
            <div>
              <p className="section-eyebrow reveal">Study formats</p>
              <h2 className="section-title reveal d1">One source,<br /><em>four perspectives</em></h2>
            </div>
            <p className="formats-desc reveal d2">Every format is built differently — not just a different prompt, but a different structure designed for a different kind of thinking.</p>
          </div>
          <div className="formats-grid">
            <div className="format-cell reveal d1">
              <div className="format-num">01</div>
              <span className="format-icon">C</span>
              <div className="format-name">Cornell Method</div>
              <div className="format-desc">Two-column cue and note layout with a synthesis summary. The research-backed gold standard for lecture retention.</div>
              <span className="format-pill">Retention-first</span>
            </div>
            <div className="format-cell reveal d2">
              <div className="format-num">02</div>
              <span className="format-icon">≡</span>
              <div className="format-name">Bullet Points</div>
              <div className="format-desc">Structured breakdowns with definition, function, examples, and key takeaways. Built for fast scanning.</div>
              <span className="format-pill">Scan-optimized</span>
            </div>
            <div className="format-cell reveal d3">
              <div className="format-num">03</div>
              <span className="format-icon">¶</span>
              <div className="format-name">Paragraph</div>
              <div className="format-desc">Flowing prose with subheadings and a real-world closing. Ideal for essay prep and deep comprehension.</div>
              <span className="format-pill">Essay-ready</span>
            </div>
            <div className="format-cell reveal d4">
              <div className="format-num">04</div>
              <span className="format-icon">◆</span>
              <div className="format-name">Smart Summary</div>
              <div className="format-desc">Key concepts with real-world applications, historical data tables, and interesting facts that stick.</div>
              <span className="format-pill">Context-rich</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section className="features-wrap" id="features">
        <div className="features-header">
          <p className="section-eyebrow reveal">Capabilities</p>
          <h2 className="section-title reveal d1">Everything you need<br /><em>to study seriously</em></h2>
        </div>
        <div className="features-grid">
          <div className="feat col-7 reveal d1">
            <div className="feat-icon">🧠</div>
            <div className="feat-title">Spaced repetition flashcards</div>
            <div className="feat-body">Cards built from your summaries using the SM-2 algorithm. Rate difficulty after each review and let the system schedule what you study next. Mnemonics and examples included automatically.</div>
            <div className="feat-stat">SM-2 <span>algorithm</span></div>
          </div>
          <div className="feat col-5 reveal d2">
            <div className="feat-icon">🎯</div>
            <div className="feat-title">Adaptive quizzes</div>
            <div className="feat-body">Multiple choice and true/false questions at Easy, Medium, and Hard difficulty. Timer, hints, and full explanations on every answer.</div>
            <div className="feat-stat">3 <span>difficulty levels</span></div>
          </div>
          <div className="feat col-4 reveal d1">
            <div className="feat-icon">⚡</div>
            <div className="feat-title">Real-time processing</div>
            <div className="feat-body">WebSocket-powered updates. Watch it generate live — no spinners, no waiting in the dark.</div>
          </div>
          <div className="feat col-4 reveal d2">
            <div className="feat-icon">💬</div>
            <div className="feat-title">Ask AI chat</div>
            <div className="feat-body">Ask questions about your summary. The AI stays grounded in your material and refuses to drift off-topic.</div>
          </div>
          <div className="feat col-4 reveal d3">
            <div className="feat-icon">📄</div>
            <div className="feat-title">Beautiful PDF exports</div>
            <div className="feat-body">Every summary exports as a professionally typeset PDF — branded layout, tables, and your content intact.</div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="testi-section">
        <div className="testi-inner">
          <div className="testi-header">
            <p className="section-eyebrow reveal">What students say</p>
            <h2 className="section-title reveal d1">Real results, <em>real students</em></h2>
          </div>
          <div className="testi-grid">
            {testimonials.map((t, i) => (
              <div key={i} className={`testi reveal d${i + 1}`}>
                <div className="testi-stars">★★★★★</div>
                <p className="testi-quote">"{t.quote}"</p>
                <div className="testi-author">
                  <div className="testi-av">{t.initial}</div>
                  <div>
                    <div className="testi-name">{t.name}</div>
                    <div className="testi-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="pricing-wrap" id="pricing">
        <div className="pricing-header">
          <div>
            <p className="section-eyebrow reveal">Pricing</p>
            <h2 className="section-title reveal d1">Simple, <em>honest</em> pricing</h2>
          </div>
          <div className="pricing-right reveal d2">
            <div className="pricing-toggle">
              <button className={`tog${!isYearly ? ' on' : ''}`} onClick={() => setIsYearly(false)}>Monthly</button>
              <button className={`tog${isYearly ? ' on' : ''}`} onClick={() => setIsYearly(true)}>Yearly</button>
            </div>
            <span className="save-tag">Save 30% yearly</span>
          </div>
        </div>

        <div className="plans-grid reveal d1">
          {/* Free */}
          <div className="plan">
            <div className="plan-name">Free</div>
            <div className="plan-price">$0</div>
            <div className="plan-period">forever, no card required</div>
            <div className="plan-rule" />
            <ul className="plan-feats">
              <li className="plan-feat"><span className="chk">✓</span> 5 summaries per month</li>
              <li className="plan-feat"><span className="chk">✓</span> All 4 summary formats</li>
              <li className="plan-feat"><span className="chk">✓</span> Quiz generation</li>
              <li className="plan-feat"><span className="chk">✓</span> Basic flashcards</li>
              <li className="plan-feat muted"><span className="dash">–</span> PDF exports</li>
              <li className="plan-feat muted"><span className="dash">–</span> Spaced repetition</li>
              <li className="plan-feat muted"><span className="dash">–</span> Ask AI chat</li>
            </ul>
            <Link to="/register" className="plan-cta">Get started free</Link>
          </div>

          {/* Student */}
          <div className="plan highlight">
            <div className="plan-badge">Popular</div>
            <div className="plan-name">Student</div>
            <div className="plan-price"><sup>$</sup>{studentPrice}</div>
            <div className="plan-period">{period}</div>
            <div className="plan-rule" />
            <ul className="plan-feats">
              <li className="plan-feat"><span className="chk">✓</span> 50 summaries per month</li>
              <li className="plan-feat"><span className="chk">✓</span> All 4 summary formats</li>
              <li className="plan-feat"><span className="chk">✓</span> Quiz generation</li>
              <li className="plan-feat"><span className="chk">✓</span> Spaced repetition flashcards</li>
              <li className="plan-feat"><span className="chk">✓</span> PDF exports</li>
              <li className="plan-feat"><span className="chk">✓</span> Ask AI chat</li>
              <li className="plan-feat muted"><span className="dash">–</span> Unlimited summaries</li>
            </ul>
            <Link to="/register?plan=student" className="plan-cta">Start Student plan →</Link>
          </div>

          {/* Pro */}
          <div className="plan">
            <div className="plan-name">Pro</div>
            <div className="plan-price"><sup>$</sup>{proPrice}</div>
            <div className="plan-period">{period}</div>
            <div className="plan-rule" />
            <ul className="plan-feats">
              <li className="plan-feat"><span className="chk">✓</span> Unlimited summaries</li>
              <li className="plan-feat"><span className="chk">✓</span> All 4 summary formats</li>
              <li className="plan-feat"><span className="chk">✓</span> Quiz generation</li>
              <li className="plan-feat"><span className="chk">✓</span> Spaced repetition flashcards</li>
              <li className="plan-feat"><span className="chk">✓</span> PDF exports</li>
              <li className="plan-feat"><span className="chk">✓</span> Ask AI chat</li>
              <li className="plan-feat"><span className="chk">✓</span> Priority processing</li>
            </ul>
            <Link to="/register?plan=pro" className="plan-cta">Start Pro plan →</Link>
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <div className="cta-wrap">
        <div className="cta-banner reveal">
          <div>
            <h2 className="cta-title">Ready to study<br /><em>like never before?</em></h2>
            <p className="cta-sub">Join students already using Lectura to transform how they learn. Free to start, no credit card needed.</p>
          </div>
          <div className="cta-actions">
            <Link to="/register" className="btn-light">Start learning free →</Link>
            <span className="cta-note">Free forever · No card required</span>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <a className="lp-logo" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          <div className="lp-logo-mark">L</div>
          Lectura
        </a>
        <ul className="lp-footer-nav">
          <li><a href="#">Product</a></li>
          <li><a href="#">Pricing</a></li>
          <li><a href="#">Privacy</a></li>
          <li><a href="#">Terms</a></li>
          <li><a href="#">Contact</a></li>
        </ul>
        <span className="lp-footer-copy">© 2026 Lectura</span>
      </footer>
    </div>
  )
}
