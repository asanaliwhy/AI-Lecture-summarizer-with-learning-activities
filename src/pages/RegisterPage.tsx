import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ApiError } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { useToast } from '../components/ui/Toast'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { cn } from '../lib/utils'
export function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const { success: toastSuccess, error: toastError } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

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

      await register(fullName, email, password)
      localStorage.setItem('pending_verification_email', email.trim().toLowerCase())
      toastSuccess('Account created! Check your email to verify.')
      navigate('/verify-email')
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

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first-name">First Name</Label>
                <Input
                  id="first-name"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
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
                  required
                />
                {fieldErrors.lastName && <p className="text-xs text-destructive">{fieldErrors.lastName}</p>}
              </div>

              {fieldErrors.full_name && <p className="text-xs text-destructive sm:col-span-2">{fieldErrors.full_name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={
                    passwordsMatch
                      ? 'border-green-500 focus-visible:ring-green-500'
                      : ''
                  }
                  required
                />
                {passwordsMatch && (
                  <Check className="absolute right-3 top-2.5 h-4 w-4 text-green-500" />
                )}
              </div>
            </div>

            <div className="flex items-start space-x-2 pt-2">
              <input
                type="checkbox"
                id="terms"
                required
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

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

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
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1513258496098-3f1b4e7d02ac?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
        <div className="relative z-10 max-w-lg">
          <h2 className="text-3xl font-bold mb-6">
            Join thousands of students learning smarter.
          </h2>
          <ul className="space-y-4 text-lg opacity-90">
            <li className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Check className="h-4 w-4" />
              </div>
              AI-powered summaries in seconds
            </li>
            <li className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Check className="h-4 w-4" />
              </div>
              Automatically generated quizzes
            </li>
            <li className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Check className="h-4 w-4" />
              </div>
              Spaced repetition flashcards
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
