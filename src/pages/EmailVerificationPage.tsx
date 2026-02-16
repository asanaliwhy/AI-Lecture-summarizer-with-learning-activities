import React, { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError, setTokens } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/Card'
import { Mail, ArrowRight, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useToast } from '../components/ui/Toast'

const RESEND_STORAGE_KEY = 'pending_verification_email'

export function EmailVerificationPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const { success, error } = useToast()

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const [countdown, setCountdown] = useState(0)
  const [resendEmail, setResendEmail] = useState('')
  const [isResending, setIsResending] = useState(false)
  const [resendError, setResendError] = useState('')
  const [resendAttempts, setResendAttempts] = useState(0)
  const verifyCalled = useRef(false)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const MAX_RESEND_ATTEMPTS = 5

  useEffect(() => {
    const stored = localStorage.getItem(RESEND_STORAGE_KEY)
    if (stored) {
      setResendEmail(stored)
    }
  }, [])

  useEffect(() => {
    if (token && !verifyCalled.current) {
      verifyCalled.current = true
      verifyEmail(token)
    }
  }, [token])

  // Cleanup redirect timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current)
      }
    }
  }, [])

  const verifyEmail = async (token: string) => {
    setStatus('verifying')
    try {
      const data = await api.auth.verifyEmail(token)
      if (data.access_token && data.refresh_token) {
        setTokens(data.access_token, data.refresh_token)
        setStatus('success')
        success('Email verified successfully! Redirecting...')
        redirectTimer.current = setTimeout(() => navigate('/dashboard'), 2000)
      } else {
        setStatus('success')
        redirectTimer.current = setTimeout(() => navigate('/login'), 2000)
      }
    } catch (err: unknown) {
      setStatus('error')
      if (err instanceof ApiError) {
        error(err.message)
      } else {
        error('Verification failed. The link may be invalid or expired.')
      }
    }
  }

  useEffect(() => {
    if (countdown <= 0) return

    const timeout = window.setTimeout(() => {
      setCountdown((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => window.clearTimeout(timeout)
  }, [countdown])

  const handleResend = async () => {
    const email = resendEmail.trim().toLowerCase()

    if (!email) {
      setResendError('Enter the email used during registration.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResendError('Enter a valid email address.')
      return
    }

    if (countdown > 0 || isResending) {
      return
    }

    if (resendAttempts >= MAX_RESEND_ATTEMPTS) {
      setResendError('Maximum resend attempts reached. Please try again later or contact support.')
      return
    }

    setIsResending(true)
    setResendError('')

    try {
      await api.auth.resendVerification(email)
      localStorage.setItem(RESEND_STORAGE_KEY, email)
      setCountdown(60)
      setResendAttempts((prev) => prev + 1)
      success('Verification email sent again.')
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to resend verification email'
      setResendError(message)
      error(message)
    } finally {
      setIsResending(false)
    }
  }

  // Render "Verifying" state
  if (token && status === 'verifying') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-secondary/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
            <CardTitle>Verifying your email</CardTitle>
            <CardDescription>Please wait while we secure your account...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Render Success state
  if (status === 'success') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-secondary/30 p-4">
        <Card className="w-full max-w-md text-center border-emerald-500/30 bg-emerald-500/5">
          <CardHeader>
            <div className="mx-auto mb-4 text-emerald-500">
              <CheckCircle className="h-12 w-12" />
            </div>
            <CardTitle>Email Verified!</CardTitle>
            <CardDescription>Thank you for verifying your email.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">Redirecting you to dashboard...</p>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Render Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-secondary/30 p-4">
        <Card className="w-full max-w-md text-center border-destructive/30 bg-destructive/5">
          <CardHeader>
            <div className="mx-auto mb-4 text-destructive">
              <XCircle className="h-12 w-12" />
            </div>
            <CardTitle>Verification Failed</CardTitle>
            <CardDescription>This link may be invalid or expired.</CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center gap-4">
            <Button onClick={() => navigate('/login')} variant="outline">Back to Login</Button>
            <Button onClick={() => navigate('/register')}>Register Again</Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Render "Check your email" instruction state (no token)
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-4 pb-2">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
            <Mail className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription className="text-base">
            We sent a verification link to your email address.
            <br />
            <span className="text-xs text-muted-foreground">(Check spam folder if missing)</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Click the link in the email to verify your account.
          </p>

          <div className="space-y-2 text-left">
            <label htmlFor="resend-email" className="text-sm font-medium">
              Email address
            </label>
            <Input
              id="resend-email"
              type="email"
              placeholder="name@example.com"
              value={resendEmail}
              onChange={(e) => {
                setResendEmail(e.target.value)
                if (resendError) setResendError('')
              }}
            />
            {resendError && <p className="text-xs text-destructive">{resendError}</p>}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={isResending || countdown > 0}
            className="w-full"
          >
            {isResending
              ? 'Sending...'
              : countdown > 0
                ? `Resend in ${countdown}s`
                : resendAttempts >= MAX_RESEND_ATTEMPTS
                  ? 'Max attempts reached'
                  : `Resend verification email${resendAttempts > 0 ? ` (${MAX_RESEND_ATTEMPTS - resendAttempts} left)` : ''}`}
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Link
            to="/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to Login
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
