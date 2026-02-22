import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

    ; (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-router-dom', () => ({
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

import { LandingPage } from '../pages/LandingPage'

describe('LandingPage navigation flows', () => {
    let container: HTMLDivElement
    let root: Root

    const flush = async () => {
        await act(async () => {
            await Promise.resolve()
        })
    }

    beforeEach(() => {
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => {
            root.unmount()
        })
        container.remove()
        vi.restoreAllMocks()
    })

    it('scrolls to feature/testimonial/pricing sections from top nav', async () => {
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
        const scrollSpy = vi.fn()
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            writable: true,
            value: scrollSpy,
        })

        act(() => {
            root.render(<LandingPage />)
        })
        await flush()

        const clickByText = (text: string) => {
            const btn = Array.from(container.querySelectorAll('button')).find((b) =>
                (b.textContent || '').includes(text),
            )
            expect(btn).toBeTruthy()
            act(() => {
                btn!.click()
            })
        }

        clickByText('Features')
        clickByText('Testimonials')
        clickByText('Pricing')

        expect(scrollSpy).toHaveBeenCalledTimes(3)

        if (originalScrollIntoView) {
            Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
                configurable: true,
                writable: true,
                value: originalScrollIntoView,
            })
        }
    })

    it('renders primary auth/navigation links with keyboard-focusable anchors', async () => {
        act(() => {
            root.render(<LandingPage />)
        })
        await flush()

        const links = Array.from(container.querySelectorAll('a'))
        const signIn = links.find((a) => (a.textContent || '').includes('Sign In'))
        const getStarted = links.find((a) => (a.textContent || '').includes('Get Started'))
        const demo = links.find((a) => (a.textContent || '').includes('View Demo'))

        expect(signIn?.getAttribute('href')).toBe('/login')
        expect(getStarted?.getAttribute('href')).toBe('/register')
        expect(demo?.getAttribute('href')).toBe('/demo')

        act(() => {
            signIn?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        })
        expect(signIn?.getAttribute('href')).toBe('/login')
    })
})

