import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    searchParams: new URLSearchParams(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
    authApi: {
        verifyEmail: vi.fn(),
        resendVerification: vi.fn(),
    },
    setTokens: vi.fn(),
}))

vi.mock('../lib/api', () => ({
    api: {
        auth: mocked.authApi,
    },
    ApiError: class ApiError extends Error {
        status: number
        fields?: Record<string, string>
        constructor(status: number, message: string, fields?: Record<string, string>) {
            super(message)
            this.status = status
            this.fields = fields
        }
    },
    setTokens: mocked.setTokens,
}))

vi.mock('../components/ui/Toast', () => ({
    useToast: () => mocked.toast,
}))

vi.mock('react-router-dom', () => ({
    Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to}>{children}</a>,
    useNavigate: () => mocked.navigate,
    useSearchParams: () => [mocked.searchParams],
}))

vi.mock('../components/ui/Card', () => ({
    Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
    CardContent: ({ children }: any) => <div>{children}</div>,
    CardDescription: ({ children }: any) => <p>{children}</p>,
    CardFooter: ({ children }: any) => <div>{children}</div>,
    CardHeader: ({ children }: any) => <div>{children}</div>,
    CardTitle: ({ children }: any) => <h2>{children}</h2>,
}))

vi.mock('../components/ui/Button', () => ({
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

vi.mock('../components/ui/Input', () => ({
    Input: (props: any) => <input {...props} />,
}))

import { EmailVerificationPage } from '../pages/EmailVerificationPage'

describe('EmailVerificationPage', () => {
    let container: HTMLDivElement
    let root: Root

    const flush = async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    const setInputValue = (input: HTMLInputElement, value: string) => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set

        act(() => {
            nativeSetter?.call(input, value)
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ shouldAdvanceTime: true })
        // Default: no token in URL
        mocked.searchParams.delete('token')
        localStorage.clear()

        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => {
            root.unmount()
        })
        container.remove()
        vi.useRealTimers()
    })

    // ─── Idle state (no token) ───

    it('renders check-your-email screen when no token is present', async () => {
        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        expect(container.textContent).toContain('Check your email')
        expect(container.textContent).toContain('verification link')
        expect(container.textContent).toContain('Resend verification email')
    })

    it('pre-fills email from localStorage', async () => {
        localStorage.setItem('pending_verification_email', 'test@example.com')

        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
        expect(emailInput).toBeTruthy()
        expect(emailInput.value).toBe('test@example.com')
    })

    // ─── Verification flow ───

    it('shows verifying spinner when token is present', async () => {
        mocked.searchParams.set('token', 'test-token')
        mocked.authApi.verifyEmail.mockImplementation(() => new Promise(() => { })) // Never resolves

        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        expect(container.textContent).toContain('Verifying your email')
    })

    it('handles successful verification with tokens', async () => {
        mocked.searchParams.set('token', 'valid-token')
        mocked.authApi.verifyEmail.mockResolvedValue({
            access_token: 'at-123',
            refresh_token: 'rt-456',
        })

        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        expect(mocked.authApi.verifyEmail).toHaveBeenCalledWith('valid-token')
        expect(mocked.setTokens).toHaveBeenCalledWith('at-123', 'rt-456')
        expect(container.textContent).toContain('Email Verified')
        expect(mocked.toast.success).toHaveBeenCalledWith('Email verified successfully! Redirecting...')

        // Advance timer to trigger redirect
        act(() => {
            vi.advanceTimersByTime(2100)
        })
        expect(mocked.navigate).toHaveBeenCalledWith('/dashboard')
    })

    it('handles verification failure', async () => {
        mocked.searchParams.set('token', 'invalid-token')
        mocked.authApi.verifyEmail.mockRejectedValue(new Error('Token expired'))

        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        expect(container.textContent).toContain('Verification Failed')
        expect(container.textContent).toContain('invalid or expired')
        expect(container.textContent).toContain('Back to Login')
        expect(container.textContent).toContain('Register Again')
    })

    // ─── Resend flow ───

    it('validates empty email on resend', async () => {
        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        const resendBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Resend'),
        )
        expect(resendBtn).toBeTruthy()

        act(() => {
            resendBtn!.click()
        })
        await flush()

        expect(container.textContent).toContain('Enter the email used during registration')
    })

    it('validates invalid email format on resend', async () => {
        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
        setInputValue(emailInput, 'not-an-email')
        await flush()

        const resendBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Resend'),
        )
        act(() => {
            resendBtn!.click()
        })
        await flush()

        expect(container.textContent).toContain('Enter a valid email address')
    })

    it('handles successful resend and starts countdown', async () => {
        mocked.authApi.resendVerification.mockResolvedValue({ message: 'ok' })

        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
        setInputValue(emailInput, 'user@example.com')
        await flush()

        const resendBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Resend'),
        )
        act(() => {
            resendBtn!.click()
        })
        await flush()

        expect(mocked.authApi.resendVerification).toHaveBeenCalledWith('user@example.com')
        expect(mocked.toast.success).toHaveBeenCalledWith('Verification email sent again.')
        expect(container.textContent).toContain('Resend in')
    })

    it('handles resend failure with error message', async () => {
        const { ApiError } = await import('../lib/api')
        mocked.authApi.resendVerification.mockRejectedValue(new ApiError(429, 'Please wait 60 seconds'))

        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
        setInputValue(emailInput, 'user@example.com')
        await flush()

        const resendBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Resend'),
        )
        act(() => {
            resendBtn!.click()
        })
        await flush()

        expect(container.textContent).toContain('Please wait 60 seconds')
    })

    // ─── Max resend attempts ───

    it('blocks resend after max attempts reached', async () => {
        mocked.authApi.resendVerification.mockResolvedValue({ message: 'ok' })

        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement
        setInputValue(emailInput, 'user@example.com')
        await flush()

        // Send 5 resends (max)
        for (let i = 0; i < 5; i++) {
            // Find clickable resend button
            const btn = Array.from(container.querySelectorAll('button')).find(
                (b) => !b.disabled && (b.textContent?.includes('Resend verification') || b.textContent?.includes('left)')),
            )
            if (!btn) break

            await act(async () => {
                btn.click()
            })
            await flush()

            // Advance past the 60s countdown
            for (let s = 0; s < 61; s++) {
                act(() => {
                    vi.advanceTimersByTime(1000)
                })
            }
            await flush()
        }

        // After 5 attempts, try clicking resend again
        const resendBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Resend') || b.textContent?.includes('Max'),
        )

        if (resendBtn && !resendBtn.disabled) {
            act(() => {
                resendBtn.click()
            })
            await flush()
        }

        // Should show max attempts message
        expect(container.textContent).toContain('Maximum resend attempts reached')
    })

    // ─── Navigation buttons on error ───

    it('navigates to login when Back to Login is clicked on error', async () => {
        mocked.searchParams.set('token', 'bad-token')
        mocked.authApi.verifyEmail.mockRejectedValue(new Error('expired'))

        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        const loginBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Back to Login'),
        )
        expect(loginBtn).toBeTruthy()
        act(() => {
            loginBtn!.click()
        })
        expect(mocked.navigate).toHaveBeenCalledWith('/login')
    })

    it('navigates to register when Register Again is clicked on error', async () => {
        mocked.searchParams.set('token', 'bad-token')
        mocked.authApi.verifyEmail.mockRejectedValue(new Error('expired'))

        await act(async () => {
            root.render(<EmailVerificationPage />)
        })
        await flush()

        const registerBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            b.textContent?.includes('Register Again'),
        )
        expect(registerBtn).toBeTruthy()
        act(() => {
            registerBtn!.click()
        })
        expect(mocked.navigate).toHaveBeenCalledWith('/register')
    })
})
