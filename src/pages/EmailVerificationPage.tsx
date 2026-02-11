import React, { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, setTokens } from '../lib/api'
import { Button } from '../components/ui/Button'
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

export function EmailVerificationPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const { success, error } = useToast()

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const [countdown, setCountdown] = useState(0)
  const verifyCalled = useRef(false)

  useEffect(() => {
    if (token && !verifyCalled.current) {
      verifyCalled.current = true
      verifyEmail(token)
    }
  }, [token])

  const verifyEmail = async (token: string) => {
    setStatus('verifying')
    try {
      const data = await api.auth.verifyEmail(token)
      // data contains { access_token, refresh_token, ... }
      if (data.access_token && data.refresh_token) {
        setTokens(data.access_token, data.refresh_token)
        setStatus('success')
        success('Email verified successfully! Redirecting...')
        setTimeout(() => navigate('/dashboard'), 2000)
      } else {
        // Fallback if structured differently, though backend sends tokens
        setStatus('success')
        setTimeout(() => navigate('/login'), 2000)
      }
    } catch (err: any) {
      setStatus('error')
      error(err.message || 'Verification failed')
    }
  }

  const handleResend = async () => {
    // For now, just a dummy countdown since we don't have the user's email 
    // accessible here easily unless we store it in local state/context during registration.
    // Real implementation would need the email address.
    setCountdown(60)
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
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
        <Card className="w-full max-w-md text-center border-green-200 bg-green-50/50">
          <CardHeader>
            <div className="mx-auto mb-4 text-green-500">
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
        <Card className="w-full max-w-md text-center border-red-200 bg-red-50/50">
          <CardHeader>
            <div className="mx-auto mb-4 text-red-500">
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
