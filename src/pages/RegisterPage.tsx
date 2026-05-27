import React, { useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ApiError } from '../lib/api'
import { buildGoogleAuthURL } from '../lib/googleOAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { useToast } from '../components/ui/Toast'
import { Eye, EyeOff, Check, X, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'
export function RegisterPage() {
  const navigate = useNavigate()
  const { register, login } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleGoogleSignUp = useCallback(async () => {
    const authURL = await buildGoogleAuthURL()
    if (!authURL) {
      setError('Google OAuth is not configured')
      toastError('Google OAuth is not configured')
      return
    }
    window.location.href = authURL
  }, [toastError])

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '' }
    let score = 0
    if (pass.length > 8) score++
    if (/[A-Z]/.test(pass)) score++
    if (/[0-9]/.test(pass)) score++
    if (/[^A-Za-z0-9]/.test(pass)) score++
    const labels = ['Weak', 'Fair', 'Good', 'Strong']
    return { score, label: labels[score - 1] || 'Weak' }
  }
  const strength = getPasswordStrength(password)
  const passwordsMatch = password && confirmPassword && password === confirmPassword
  const hasConfirmMismatch = !!confirmPassword && password !== confirmPassword

  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (!firstName.trim()) errors.firstName = 'First name is required'
    else if (firstName.trim().length < 2) errors.firstName = 'First name must be at least 2 characters'

    if (!lastName.trim()) errors.lastName = 'Last name is required'
    else if (lastName.trim().length < 2) errors.lastName = 'Last name must be at least 2 characters'

    if (!email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address'
    if (!password) errors.password = 'Password is required'
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters'
    else if (strength.score < 2) errors.password = 'Password is too weak. Add uppercase, numbers or symbols.'
    if (!confirmPassword) errors.confirmPassword = 'Please confirm your password'
    else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match'
    if (!termsAccepted) errors.terms = 'You must agree to the Terms of Service'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setIsLoading(true)
    setError('')
    setFieldErrors({})

    try {
      const normalizedFirstName = firstName.trim()
      const normalizedLastName = lastName.trim()
      const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim()
      const normalizedEmail = email.trim().toLowerCase()

      await register(fullName, normalizedEmail, password)
      
      try {
        await login(normalizedEmail, password)
        toastSuccess('Account created successfully!')
        navigate('/dashboard')
      } catch (loginErr) {
        if (loginErr instanceof ApiError && (loginErr.status === 403 || loginErr.status === 401)) {
          localStorage.setItem('pending_verification_email', normalizedEmail)
          toastSuccess('Account created! Check your email to verify.')
          navigate('/verify-email')
        } else {
          toastSuccess('Account created! Please sign in.')
          navigate('/login')
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setFieldErrors(err.fields)
        else setError(err.message)
        toastError(err.message)
      } else {
        setError('An unexpected error occurred')
        toastError('Connection failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }
  return (
    <div className="min-h-screen w-full flex">
      {/* Left Panel - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="flex items-center gap-2 font-bold text-xl mb-8">
            <div className="h-8 w-8 rounded bg-primary text-primary-foreground flex items-center justify-center text-sm">
              AI
            </div>
            <span>Lectura</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Create an account
            </h1>
            <p className="text-muted-foreground">
              Start turning lectures into knowledge today
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-lg border border-destructive/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first-name">First Name</Label>
                <Input
                  id="first-name"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                {fieldErrors.firstName && <p className="text-xs text-destructive">{fieldErrors.firstName}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="last-name">Last Name</Label>
                <Input
                  id="last-name"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
                {fieldErrors.lastName && <p className="text-xs text-destructive">{fieldErrors.lastName}</p>}
              </div>

              {fieldErrors.full_name && <p className="text-xs text-destructive sm:col-span-2">{fieldErrors.full_name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="text" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {/* Password Strength Meter */}
              {password && (
                <div className="space-y-1 pt-1">
                  <div className="flex gap-1 h-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={cn(
                          'flex-1 rounded-full transition-colors duration-300',
                          strength.score >= level
                            ? strength.score < 3
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                            : 'bg-secondary',
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    {strength.label}
                  </p>
                </div>
              )}
              {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={cn(
                    passwordsMatch && 'border-green-500 focus-visible:ring-green-500',
                    hasConfirmMismatch && 'border-destructive focus-visible:ring-destructive',
                  )}
                />
                {passwordsMatch && (
                  <Check className="absolute right-3 top-2.5 h-4 w-4 text-green-500" />
                )}
                {hasConfirmMismatch && (
                  <X className="absolute right-3 top-2.5 h-4 w-4 text-destructive" />
                )}
              </div>
              {fieldErrors.confirmPassword && <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>}
            </div>

            <div className="flex items-start space-x-2 pt-2">
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <label
                htmlFor="terms"
                className="text-sm text-muted-foreground leading-tight"
              >
                I agree to the{' '}
                <a href="#" className="text-primary hover:underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-primary hover:underline">
                  Privacy Policy
                </a>
                .
              </label>
            </div>
            {fieldErrors.terms && <p className="text-xs text-destructive -mt-4">{fieldErrors.terms}</p>}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <Button type="button" variant="outline" className="w-full gap-2" onClick={handleGoogleSignUp}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" role="img">
              <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 4 1.5l2.7-2.6C17.1 3.5 14.8 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c6.9 0 9.2-4.8 9.2-7.3 0-.5 0-.9-.1-1.3H12z" />
              <path fill="#34A853" d="M3.6 7.6l3.2 2.4C7.7 8 9.7 6.5 12 6.5c1.9 0 3.2.8 4 1.5l2.7-2.6C17.1 3.5 14.8 2.5 12 2.5 8.4 2.5 5.4 4.5 3.6 7.6z" />
              <path fill="#FBBC05" d="M12 21.5c2.7 0 5-1 6.7-2.6l-3.1-2.5c-.8.6-2 1.1-3.6 1.1-3.1 0-5.7-2.1-6.6-4.9l-3.3 2.5C4 18.4 7.7 21.5 12 21.5z" />
              <path fill="#4285F4" d="M21.2 14.2c.1-.4.1-.8.1-1.2s0-.8-.1-1.2H12v2.4h5.3c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.5c1.8-1.7 2.7-4.1 2.7-6.4z" />
            </svg>
            <span>Continue with Google</span>
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right Panel - Visual */}
      <div className="hidden lg:flex w-1/2 bg-primary items-center justify-center p-12 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(255,255,255,0.14),transparent_46%),radial-gradient(circle_at_80%_72%,rgba(255,255,255,0.1),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.05),transparent_62%)]"></div>
        <div className="absolute inset-0 opacity-10 [background-size:36px_36px] [background-image:linear-gradient(to_right,rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.16)_1px,transparent_1px)]"></div>
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full border border-white/20 bg-white/5 blur-3xl"></div>
        <div className="absolute -right-16 bottom-12 h-64 w-64 rounded-full border border-white/15 bg-white/5 blur-2xl"></div>
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1513258496098-3f1b4e7d02ac?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
        <div className="relative z-10 max-w-lg w-full">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-1.5 mb-5 shadow-[0_0_20px_rgba(255,255,255,0.14)]">
            <Sparkles className="h-4 w-4 text-primary-foreground/90" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/85">Lectura</span>
          </div>
          <h2 className="text-3xl font-bold mb-6">
            Built for students who want to learn smarter.
          </h2>
          <ul className="space-y-4 text-lg opacity-90">
            <li className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full border border-primary-foreground/35 bg-primary-foreground/20 shadow-[0_0_18px_rgba(255,255,255,0.2)] flex items-center justify-center">
                <Check className="h-5 w-5 text-primary-foreground" />
              </div>
              AI-powered summaries in seconds
            </li>
            <li className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full border border-primary-foreground/35 bg-primary-foreground/20 shadow-[0_0_18px_rgba(255,255,255,0.2)] flex items-center justify-center">
                <Check className="h-5 w-5 text-primary-foreground" />
              </div>
              Automatically generated quizzes
            </li>
            <li className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full border border-primary-foreground/35 bg-primary-foreground/20 shadow-[0_0_18px_rgba(255,255,255,0.2)] flex items-center justify-center">
                <Check className="h-5 w-5 text-primary-foreground" />
              </div>
              Spaced repetition flashcards
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
