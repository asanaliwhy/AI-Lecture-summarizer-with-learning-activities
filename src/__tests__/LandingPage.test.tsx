import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const mocked = vi.hoisted(() => ({
    scrolledTo: [] as string[],
}))

vi.mock('react-router-dom', () => ({
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

import { LandingPage } from '../pages/LandingPage'

describe('LandingPage trust/content updates', () => {
    let container: HTMLDivElement
    let root: Root

    const flush = async () => {
        await act(async () => {
            await Promise.resolve()
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mocked.scrolledTo = []

        vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
        vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
            mocked.scrolledTo.push(id)
            return {
                scrollIntoView: () => undefined,
            } as unknown as HTMLElement
        })

        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        act(() => {
            root.unmount()
        })
        container.remove()
    })

    it('removes fake social proof and shows real beta messaging', async () => {
        await act(async () => {
            root.render(<LandingPage />)
        })
        await flush()

        expect(container.textContent).toContain('Join 50+ student testers')
        expect(container.textContent).toContain('500+')
        expect(container.textContent).toContain('Built for university students worldwide')

        expect(container.textContent).not.toContain('10,000+')
        expect(container.textContent).not.toContain('1M+')
        expect(container.textContent).not.toContain('HARVARD')
        expect(container.textContent).not.toContain('Stanford')
    })

    it('contains required sections and CTA text', async () => {
        await act(async () => {
            root.render(<LandingPage />)
        })
        await flush()

        expect(container.textContent).toContain('How it works')
        expect(container.textContent).toContain('Frequently asked questions')
        expect(container.textContent).toContain('Manual study vs Lectura')
        expect(container.textContent).toContain('About This Project')
        expect(container.textContent).toContain('Start Free — No Credit Card Required')
        expect(container.textContent).toContain('Watch 45s Product Walkthrough')
    })
})

