import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, setTokens, clearTokens, ApiError } from './api'

interface User {
    id: string
    email: string
    full_name: string
    avatar_url?: string
    bio?: string | null
    is_verified: boolean
    plan: string
}

interface AuthContextType {
    user: User | null
    isLoading: boolean
    isAuthenticated: boolean
    login: (email: string, password: string) => Promise<void>
    register: (fullName: string, email: string, password: string) => Promise<void>
    logout: () => Promise<void>
    refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const refreshUser = useCallback(async () => {
        try {
            const data = await api.user.getMe()
            setUser(data.user || data)
        } catch {
            setUser(null)
            clearTokens()
        }
    }, [])

    // Check auth on mount
    useEffect(() => {
        const token = localStorage.getItem('access_token')
        if (token) {
            refreshUser().finally(() => setIsLoading(false))
        } else {
            setIsLoading(false)
        }
    }, [refreshUser])

    const login = async (email: string, password: string) => {
        const data = await api.auth.login({ email, password })
        setTokens(data.access_token, data.refresh_token)
        // Fetch user profile after login since login endpoint only returns tokens
        await refreshUser()
    }

    const register = async (fullName: string, email: string, password: string) => {
        await api.auth.register({ full_name: fullName, email, password })
        // Don't auto-login — user needs to verify email
    }

    const logout = async () => {
        try {
            await api.auth.logout()
        } catch {
            // Ignore errors on logout
        } finally {
            clearTokens()
            setUser(null)
        }
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                login,
                register,
                logout,
                refreshUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}

// Protected Route component
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth()

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (!isAuthenticated) {
        window.location.href = '/login'
        return null
    }

    return <>{children}</>
}
