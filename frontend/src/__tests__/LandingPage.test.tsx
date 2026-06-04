import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

    ; (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-router-dom', () => ({
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
    useNavigate: () => vi.fn(),
}))

import { LandingPage } from '../pages/LandingPage'

describe('LandingPage navigation flows', () => {
    let container: HTMLDivElement
    let root: Root
    const originalIntersectionObserver = globalThis.IntersectionObserver

    beforeAll(() => {
        class MockIntersectionObserver implements IntersectionObserver {
            readonly root: Element | Document | null = null
            readonly rootMargin = ''
            readonly thresholds: ReadonlyArray<number> = []

            disconnect(): void { }
            observe(_target: Element): void { }
            takeRecords(): IntersectionObserverEntry[] { return [] }
            unobserve(_target: Element): void { }
        }

        ; (globalThis as typeof globalThis & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
            MockIntersectionObserver as unknown as typeof IntersectionObserver
    })

    afterAll(() => {
        if (originalIntersectionObserver) {
            ; (globalThis as typeof globalThis & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
                originalIntersectionObserver
        }
    })

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

    it('scrolls to how/features/pricing sections from top nav', async () => {
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

        const clickLinkByText = (text: string) => {
            const link = Array.from(container.querySelectorAll('a')).find((a) =>
                (a.textContent || '').includes(text),
            )
            expect(link).toBeTruthy()
            act(() => {
                link!.click()
            })
        }

        clickLinkByText('How it works')
        clickLinkByText('Features')
        clickLinkByText('Pricing')

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
        const signIn = links.find((a) => (a.textContent || '').toLowerCase().includes('sign in'))
        const startForFree = links.find((a) => (a.textContent || '').includes('Start for free'))
        const howItWorks = links.find((a) => (a.textContent || '').includes('How it works'))

        expect(signIn?.getAttribute('href')).toBe('/login')
        expect(startForFree?.getAttribute('href')).toBe('/register')
        expect(howItWorks?.getAttribute('href')).toBe('#how')

        act(() => {
            signIn?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        })
        expect(signIn?.getAttribute('href')).toBe('/login')
    })
})

