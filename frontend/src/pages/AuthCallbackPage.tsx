import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ApiError } from '../lib/api'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'

export function AuthCallbackPage() {
    const navigate = useNavigate()
    const location = useLocation()
    const { googleCodeLogin } = useAuth()
    const { error: toastError } = useToast()
    const [error, setError] = useState('')
    const authAttemptedRef = useRef(false)

    useEffect(() => {
        if (authAttemptedRef.current) {
            return
        }
        authAttemptedRef.current = true

        const completeAuth = async () => {
            const params = new URLSearchParams(window.location.search)
            const oauthError = params.get('error')
            const code = params.get('code')

            if (oauthError) {
                const message = 'Google authentication was cancelled or denied'
                setError(message)
                toastError(message)
                return
            }

            if (!code) {
                const message = 'Missing authorization code from Google'
                setError(message)
                toastError(message)
                return
            }

            try {
                await Promise.race([
                    googleCodeLogin(code),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Google sign-in timed out. Please try again.')), 15000),
                    ),
                ])
                navigate(from, { replace: true })
            } catch (err) {
                const message = err instanceof ApiError ? err.message : 'Google sign-in failed'
                setError(message)
                toastError(message)
            }
        }

        completeAuth()
    }, [from, googleCodeLogin, navigate, toastError])

    if (!error) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center space-y-4">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                    <h1 className="text-xl font-semibold">Signing you in with Google</h1>
                    <p className="text-sm text-muted-foreground">Please wait while we complete authentication.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center space-y-4">
                <h1 className="text-xl font-semibold text-destructive">Google sign-in failed</h1>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button type="button" className="w-full" onClick={() => navigate('/login', { replace: true })}>
                    Back to login
                </Button>
            </div>
        </div>
    )
}
const from = (location as unknown as { state?: { from?: string } }).state?.from ?? '/dashboard'
