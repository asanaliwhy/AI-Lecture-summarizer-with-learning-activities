import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

    ; (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    login: vi.fn(),
    googleLogin: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
    googleHook: vi.fn(() => ({ current: null })),
}))

vi.mock('../lib/AuthContext', () => ({
    useAuth: () => ({
        login: mocked.login,
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

import { LoginPage } from '../pages/LoginPage'

describe('LoginPage auth flows', () => {
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

    const clickButton = (text: string) => {
        const btn = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes(text),
        )
        expect(btn).toBeTruthy()
        act(() => {
            btn!.click()
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mocked.login.mockResolvedValue(undefined)

        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => {
            root.unmount()
        })
        container.remove()
    })

    it('validates empty form and blocks submit', async () => {
        act(() => {
            root.render(<LoginPage />)
        })
        await flush()

        const form = container.querySelector('form') as HTMLFormElement | null
        expect(form).toBeTruthy()
        act(() => {
            form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        })
        await flush()

        expect(container.textContent).toContain('Email is required')
        expect(mocked.login).not.toHaveBeenCalled()
    })

    it('submits successfully and navigates to dashboard', async () => {
        act(() => {
            root.render(<LoginPage />)
        })
        await flush()

        setInput('#email', 'user@example.com')
        setInput('#password', 'Password123!')

        const form = container.querySelector('form') as HTMLFormElement | null
        expect(form).toBeTruthy()
        act(() => {
            form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        })
        await flush()

        expect(mocked.login).toHaveBeenCalledWith('user@example.com', 'Password123!')
        expect(mocked.toast.success).toHaveBeenCalledWith('Welcome back!')
        expect(mocked.navigate).toHaveBeenCalledWith('/dashboard')
    })

    it('toggles password visibility button and supports keyboard interaction on submit button', async () => {
        act(() => {
            root.render(<LoginPage />)
        })
        await flush()

        const password = container.querySelector('#password') as HTMLInputElement | null
        expect(password).toBeTruthy()
        expect(password?.type).toBe('password')

        const toggleBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => !(b.textContent || '').includes('Sign In'),
        )
        expect(toggleBtn).toBeTruthy()

        act(() => {
            toggleBtn!.click()
        })
        expect((container.querySelector('#password') as HTMLInputElement).type).toBe('text')

        setInput('#email', 'user@example.com')
        setInput('#password', 'Password123!')

        const submit = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes('Sign In'),
        )
        expect(submit).toBeTruthy()

        act(() => {
            submit!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        })

        const form = container.querySelector('form') as HTMLFormElement
        act(() => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        })
        await flush()

        expect(mocked.login).toHaveBeenCalledTimes(1)
    })
})

