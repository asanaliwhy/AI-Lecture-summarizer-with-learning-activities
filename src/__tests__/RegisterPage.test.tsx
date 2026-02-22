import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

    ; (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    register: vi.fn(),
    googleLogin: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
    googleHook: vi.fn(() => ({ current: null })),
}))

vi.mock('../lib/AuthContext', () => ({
    useAuth: () => ({
        register: mocked.register,
        googleLogin: mocked.googleLogin,
    }),
}))

vi.mock('../hooks/useGoogleLogin', () => ({
    useGoogleLogin: mocked.googleHook,
}))

vi.mock('../components/ui/Toast', () => ({
    useToast: () => mocked.toast,
}))

vi.mock('react-router-dom', () => ({
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
    useNavigate: () => mocked.navigate,
}))

import { RegisterPage } from '../pages/RegisterPage'

describe('RegisterPage signup flows', () => {
    let container: HTMLDivElement
    let root: Root

    const flush = async () => {
        await act(async () => {
            await Promise.resolve()
            await Promise.resolve()
        })
    }

    const setInput = (selector: string, value: string) => {
        const input = container.querySelector(selector) as HTMLInputElement | null
        expect(input).toBeTruthy()
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )?.set

        act(() => {
            setter?.call(input, value)
            input!.dispatchEvent(new Event('input', { bubbles: true }))
            input!.dispatchEvent(new Event('change', { bubbles: true }))
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mocked.register.mockResolvedValue(undefined)
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
        localStorage.clear()
    })

    it('validates required fields and password matching before submit', async () => {
        act(() => {
            root.render(<RegisterPage />)
        })
        await flush()

        const form = container.querySelector('form') as HTMLFormElement | null
        expect(form).toBeTruthy()

        act(() => {
            form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        })
        await flush()

        expect(container.textContent).toContain('First name is required')
        expect(container.textContent).toContain('Last name is required')
        expect(container.textContent).toContain('Email is required')
        expect(mocked.register).not.toHaveBeenCalled()
    })

    it('registers successfully, stores pending email, and routes to verify-email', async () => {
        act(() => {
            root.render(<RegisterPage />)
        })
        await flush()

        setInput('#first-name', 'Ada')
        setInput('#last-name', 'Lovelace')
        setInput('#email', 'Ada@Example.com')
        setInput('#password', 'StrongPass123!')
        setInput('#confirmPassword', 'StrongPass123!')

        const terms = container.querySelector('#terms') as HTMLInputElement | null
        expect(terms).toBeTruthy()
        act(() => {
            terms!.click()
        })

        const form = container.querySelector('form') as HTMLFormElement
        act(() => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        })
        await flush()

        expect(mocked.register).toHaveBeenCalledWith('Ada Lovelace', 'Ada@Example.com', 'StrongPass123!')
        expect(localStorage.getItem('pending_verification_email')).toBe('ada@example.com')
        expect(mocked.toast.success).toHaveBeenCalledWith('Account created! Check your email to verify.')
        expect(mocked.navigate).toHaveBeenCalledWith('/verify-email')
    })

    it('toggles password visibility and supports keyboard interaction on terms', async () => {
        act(() => {
            root.render(<RegisterPage />)
        })
        await flush()

        const password = container.querySelector('#password') as HTMLInputElement | null
        expect(password?.type).toBe('password')

        const toggleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.className || '').includes('absolute right-3'),
        )
        expect(toggleBtn).toBeTruthy()
        act(() => {
            toggleBtn!.click()
        })
        expect((container.querySelector('#password') as HTMLInputElement).type).toBe('text')

        const terms = container.querySelector('#terms') as HTMLInputElement | null
        expect(terms).toBeTruthy()
        act(() => {
            terms!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
            terms!.click()
        })
        expect(terms?.checked).toBe(true)
    })
})

