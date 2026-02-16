import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const mocked = vi.hoisted(() => ({
    navigate: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
    userApi: {
        updateMe: vi.fn(),
        changePassword: vi.fn(),
        deleteMe: vi.fn(),
    },
    user: {
        id: 'user-1',
        email: 'test@example.com',
        full_name: 'Alice Noor',
        avatar_url: '',
        is_verified: true,
        plan: 'free',
    },
}))

vi.mock('../lib/api', () => ({
    api: {
        user: mocked.userApi,
    },
}))

vi.mock('../lib/AuthContext', () => ({
    useAuth: () => ({
        user: mocked.user,
        logout: mocked.logout,
        refreshUser: mocked.refreshUser,
    }),
}))

vi.mock('../components/layout/AppLayout', () => ({
    AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../components/ui/Toast', () => ({
    useToast: () => mocked.toast,
}))

vi.mock('react-router-dom', () => ({
    useNavigate: () => mocked.navigate,
}))

import { SettingsPage } from '../pages/SettingsPage'

describe('SettingsPage avatar persistence', () => {
    let container: HTMLDivElement
    let root: Root

    const flush = async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    const clickButton = (text: string) => {
        const target = Array.from(container.querySelectorAll('button')).find((btn) =>
            (btn.textContent || '').includes(text),
        )
        expect(target).toBeTruthy()
        act(() => {
            target!.click()
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mocked.userApi.updateMe.mockResolvedValue({ ...mocked.user })
        mocked.userApi.changePassword.mockResolvedValue({})
        mocked.userApi.deleteMe.mockResolvedValue({})
        mocked.refreshUser.mockResolvedValue(undefined)

        const fileReaderRead = vi.fn(function (this: FileReader) {
            const reader = this as FileReader & { result: string | ArrayBuffer | null; onload: null | (() => void) }
            reader.result = 'data:image/png;base64,ZmFrZS1hdmF0YXI='
            setTimeout(() => {
                reader.onload?.({} as ProgressEvent<FileReader>)
            }, 0)
        })

        class MockFileReader {
            result: string | ArrayBuffer | null = null
            error: DOMException | null = null
            onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null
            onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null
            readAsDataURL = fileReaderRead as unknown as FileReader['readAsDataURL']
            abort = vi.fn()
            addEventListener = vi.fn()
            removeEventListener = vi.fn()
            dispatchEvent = vi.fn().mockReturnValue(true)
            readonly EMPTY = 0
            readonly LOADING = 1
            readonly DONE = 2
            readyState = 0
        }

        vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader)

        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => {
            root.unmount()
        })
        container.remove()
        vi.unstubAllGlobals()
    })

    it('selects avatar file and persists avatar on Save Changes', async () => {
        await act(async () => {
            root.render(<SettingsPage />)
        })
        await flush()

        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null
        expect(fileInput).toBeTruthy()

        const file = new File(['avatar-bytes'], 'avatar.png', { type: 'image/png' })
        act(() => {
            Object.defineProperty(fileInput!, 'files', {
                configurable: true,
                value: [file],
            })
            fileInput!.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flush()

        clickButton('Save Changes')
        await flush()

        expect(mocked.userApi.updateMe).toHaveBeenCalledWith(
            expect.objectContaining({
                full_name: 'Alice Noor',
                email: 'test@example.com',
                avatar_url: 'data:image/png;base64,ZmFrZS1hdmF0YXI=',
            }),
        )
        expect(mocked.refreshUser).toHaveBeenCalled()
        expect(mocked.toast.success).toHaveBeenCalledWith('Profile updated successfully!')
    })

    it('rejects unsupported avatar type and prevents save payload from changing avatar', async () => {
        await act(async () => {
            root.render(<SettingsPage />)
        })
        await flush()

        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null
        expect(fileInput).toBeTruthy()

        const file = new File(['avatar-bytes'], 'avatar.webp', { type: 'image/webp' })
        act(() => {
            Object.defineProperty(fileInput!, 'files', {
                configurable: true,
                value: [file],
            })
            fileInput!.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flush()

        expect(mocked.toast.error).toHaveBeenCalledWith('Avatar must be JPG, GIF, or PNG.')

        clickButton('Save Changes')
        await flush()

        expect(mocked.userApi.updateMe).toHaveBeenCalledWith(
            expect.objectContaining({
                avatar_url: '',
            }),
        )
    })
})

