import React, { useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ApiError } from '../lib/api'
import { buildGoogleAuthURL } from '../lib/googleOAuth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { useToast } from '../components/ui/Toast'
import { Eye, EyeOff } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleGoogleSignIn = useCallback(async () => {
    const authURL = await buildGoogleAuthURL()
    if (!authURL) {
      setError('Google OAuth is not configured')
      toastError('Google OAuth is not configured')
      return
    }
    window.location.href = authURL
  }, [toastError])

  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (!email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address'
    if (!password) errors.password = 'Password is required'
    else if (password.length < 6) errors.password = 'Password must be at least 6 characters'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setIsLoading(true)
    setError('')

    try {
      await login(email, password)
      toastSuccess('Welcome back!')
      navigate('/dashboard')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
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
            <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-muted-foreground">
              Good to see you again.
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-lg border border-destructive/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: '' })) }}
                className={fieldErrors.email ? 'border-destructive' : ''}
                required
              />
              {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: '' })) }}
                  className={fieldErrors.password ? 'border-destructive' : ''}
                  required
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
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="remember"
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <label
                htmlFor="remember"
                className="text-sm font-medium leading-none"
              >
                Remember me for 30 days
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
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

          <Button type="button" variant="outline" className="w-full gap-2" onClick={handleGoogleSignIn}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" role="img">
              <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 4 1.5l2.7-2.6C17.1 3.5 14.8 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c6.9 0 9.2-4.8 9.2-7.3 0-.5 0-.9-.1-1.3H12z" />
              <path fill="#34A853" d="M3.6 7.6l3.2 2.4C7.7 8 9.7 6.5 12 6.5c1.9 0 3.2.8 4 1.5l2.7-2.6C17.1 3.5 14.8 2.5 12 2.5 8.4 2.5 5.4 4.5 3.6 7.6z" />
              <path fill="#FBBC05" d="M12 21.5c2.7 0 5-1 6.7-2.6l-3.1-2.5c-.8.6-2 1.1-3.6 1.1-3.1 0-5.7-2.1-6.6-4.9l-3.3 2.5C4 18.4 7.7 21.5 12 21.5z" />
              <path fill="#4285F4" d="M21.2 14.2c.1-.4.1-.8.1-1.2s0-.8-.1-1.2H12v2.4h5.3c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.5c1.8-1.7 2.7-4.1 2.7-6.4z" />
            </svg>
            <span>Continue with Google</span>
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-medium text-primary hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>

      {/* Right Panel - Visual */}
      <div className="hidden lg:flex w-1/2 bg-primary items-center justify-center p-12 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_45%),radial-gradient(circle_at_80%_75%,rgba(255,255,255,0.1),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_60%)]"></div>
        <div className="absolute inset-0 opacity-15 [background-size:34px_34px] [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)]"></div>
        <div className="absolute -left-16 top-16 h-64 w-64 rounded-full border border-white/20 bg-white/5 blur-2xl"></div>
        <div className="absolute -right-20 bottom-10 h-72 w-72 rounded-full border border-white/15 bg-white/5 blur-3xl"></div>
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
        <div className="relative z-10 max-w-lg text-center">
          <blockquote className="text-2xl font-medium italic mb-6">
            "The capacity to learn is a gift; the ability to learn is a skill;
            the willingness to learn is a choice."
          </blockquote>
          <cite className="not-italic font-semibold opacity-80">
            — Brian Herbert
          </cite>
        </div>
      </div>
    </div>
  )
}
