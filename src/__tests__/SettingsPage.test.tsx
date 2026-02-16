import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const SUMMARY_LENGTH_STORAGE_KEY = 'default_summary_length'
const SUMMARY_FORMAT_STORAGE_KEY = 'default_summary_format'
const THEME_STORAGE_KEY = 'theme_preference'

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
        getNotifications: vi.fn(),
        updateNotification: vi.fn(),
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

vi.mock('../components/ui/Tabs', async () => {
    const React = await vi.importActual<typeof import('react')>('react')

    const TabsContext = React.createContext<{
        value: string
        setValue: (value: string) => void
    } | null>(null)

    const Tabs = ({ defaultValue, children }: any) => {
        const [value, setValue] = React.useState<string>(defaultValue || 'account')
        return (
            <TabsContext.Provider value={{ value, setValue }}>
                {children}
            </TabsContext.Provider>
        )
    }

    const TabsList = ({ children, ...props }: any) => <div {...props}>{children}</div>

    const TabsTrigger = ({ value, children, ...props }: any) => {
        const ctx = React.useContext(TabsContext)
        if (!ctx) return null
        return (
            <button
                type="button"
                data-state={ctx.value === value ? 'active' : 'inactive'}
                onClick={() => ctx.setValue(value)}
                {...props}
            >
                {children}
            </button>
        )
    }

    const TabsContent = ({ value, children, ...props }: any) => {
        const ctx = React.useContext(TabsContext)
        if (!ctx || ctx.value !== value) return null
        return <div {...props}>{children}</div>
    }

    return { Tabs, TabsList, TabsTrigger, TabsContent }
})

vi.mock('../components/ui/Select', async () => {
    const React = await vi.importActual<typeof import('react')>('react')

    const SelectContext = React.createContext<{
        value?: string
        onValueChange?: (value: string) => void
    } | null>(null)

    const Select = ({ value, onValueChange, children }: any) => (
        <SelectContext.Provider value={{ value, onValueChange }}>
            <div data-testid="default-summary-length-select" data-value={value}>{children}</div>
        </SelectContext.Provider>
    )

    const SelectTrigger = ({ children, ...props }: any) => <div {...props}>{children}</div>
    const SelectValue = ({ placeholder }: any) => <span>{placeholder}</span>
    const SelectContent = ({ children, ...props }: any) => <div {...props}>{children}</div>

    const SelectItem = ({ value, children, ...props }: any) => {
        const ctx = React.useContext(SelectContext)
        return (
            <button
                type="button"
                onClick={() => ctx?.onValueChange?.(value)}
                data-value={value}
                {...props}
            >
                {children}
            </button>
        )
    }

    return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
})

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

    const clickSwitch = (label: string) => {
        const target = container.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null
        expect(target).toBeTruthy()
        act(() => {
            target!.click()
        })
    }

    const typeIntoInput = (input: HTMLInputElement, value: string) => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        if (!valueSetter) throw new Error('Unable to resolve input value setter')

        act(() => {
            valueSetter.call(input, value)
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.removeItem(SUMMARY_LENGTH_STORAGE_KEY)
        localStorage.removeItem(SUMMARY_FORMAT_STORAGE_KEY)
        localStorage.removeItem(THEME_STORAGE_KEY)
        mocked.userApi.updateMe.mockResolvedValue({ ...mocked.user })
        mocked.userApi.changePassword.mockResolvedValue({})
        mocked.userApi.deleteMe.mockResolvedValue({})
        mocked.userApi.getNotifications.mockResolvedValue({
            processing_complete: true,
            weekly_digest: false,
            study_reminders: false,
        })
        mocked.userApi.updateNotification.mockResolvedValue({
            key: 'processing_complete',
            enabled: false,
        })
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
        localStorage.removeItem(SUMMARY_LENGTH_STORAGE_KEY)
        localStorage.removeItem(SUMMARY_FORMAT_STORAGE_KEY)
        localStorage.removeItem(THEME_STORAGE_KEY)
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

    it('persists default summary length when switching tabs', async () => {
        await act(async () => {
            root.render(<SettingsPage />)
        })
        await flush()

        clickButton('Preferences')
        await flush()

        clickButton('Detailed')
        await flush()

        expect(localStorage.getItem(SUMMARY_LENGTH_STORAGE_KEY)).toBe('detailed')

        clickButton('Account')
        await flush()
        clickButton('Preferences')
        await flush()

        const selectRoot = container.querySelector('[data-testid="default-summary-length-select"]')
        expect(selectRoot?.getAttribute('data-value')).toBe('detailed')
    })

    it('persists default summary format when switching tabs', async () => {
        await act(async () => {
            root.render(<SettingsPage />)
        })
        await flush()

        clickButton('Preferences')
        await flush()

        clickButton('Smart Summary')
        await flush()

        expect(localStorage.getItem(SUMMARY_FORMAT_STORAGE_KEY)).toBe('smart')

        clickButton('Security')
        await flush()
        clickButton('Preferences')
        await flush()

        const selectRoots = Array.from(container.querySelectorAll('[data-testid="default-summary-length-select"]'))
        expect(selectRoots.length).toBeGreaterThanOrEqual(2)
        expect(selectRoots[1]?.getAttribute('data-value')).toBe('smart')
    })

    it('loads notification preferences and persists processing-complete toggle', async () => {
        mocked.userApi.getNotifications.mockResolvedValue({
            processing_complete: false,
            weekly_digest: true,
            study_reminders: false,
        })

        await act(async () => {
            root.render(<SettingsPage />)
        })
        await flush()

        expect(mocked.userApi.getNotifications).toHaveBeenCalledTimes(1)

        clickButton('Preferences')
        await flush()

        clickSwitch('Processing Complete')
        await flush()

        expect(mocked.userApi.updateNotification).toHaveBeenCalledWith({
            key: 'processing_complete',
            enabled: true,
        })
    })

    it('persists weekly digest and study reminders toggles', async () => {
        mocked.userApi.getNotifications.mockResolvedValue({
            processing_complete: true,
            weekly_digest: false,
            study_reminders: false,
        })

        await act(async () => {
            root.render(<SettingsPage />)
        })
        await flush()

        clickButton('Preferences')
        await flush()

        clickSwitch('Weekly Digest')
        await flush()

        clickSwitch('Study Reminders')
        await flush()

        expect(mocked.userApi.updateNotification).toHaveBeenCalledWith({
            key: 'weekly_digest',
            enabled: true,
        })
        expect(mocked.userApi.updateNotification).toHaveBeenCalledWith({
            key: 'study_reminders',
            enabled: true,
        })
    })

    it('toggles dark mode and persists theme preference', async () => {
        await act(async () => {
            root.render(<SettingsPage />)
        })
        await flush()

        clickButton('Preferences')
        await flush()

        clickSwitch('Dark Mode')
        await flush()

        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
        expect(document.documentElement.classList.contains('dark')).toBe(true)

        clickSwitch('Dark Mode')
        await flush()

        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
        expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('validates new password complexity before calling API', async () => {
        await act(async () => {
            root.render(<SettingsPage />)
        })
        await flush()

        clickButton('Security')
        await flush()

        const currentInput = container.querySelector('#current-password') as HTMLInputElement | null
        const newInput = container.querySelector('#new-password') as HTMLInputElement | null
        expect(currentInput).toBeTruthy()
        expect(newInput).toBeTruthy()

        typeIntoInput(currentInput!, 'CurrentPass1')
        typeIntoInput(newInput!, 'NoDigitsHere')
        await flush()

        clickButton('Update Password')
        await flush()

        expect(mocked.userApi.changePassword).not.toHaveBeenCalled()
        expect(container.textContent).toContain('New password must contain at least one number')
    })

    it('changes password successfully, trims current password, and resets fields', async () => {
        await act(async () => {
            root.render(<SettingsPage />)
        })
        await flush()

        clickButton('Security')
        await flush()

        const currentInput = container.querySelector('#current-password') as HTMLInputElement | null
        const newInput = container.querySelector('#new-password') as HTMLInputElement | null
        expect(currentInput).toBeTruthy()
        expect(newInput).toBeTruthy()

        typeIntoInput(currentInput!, '  CurrentPass1  ')
        typeIntoInput(newInput!, 'NewPass123')
        await flush()

        clickButton('Update Password')
        await flush()

        expect(mocked.userApi.changePassword).toHaveBeenCalledWith({
            current_password: 'CurrentPass1',
            new_password: 'NewPass123',
        })
        expect(mocked.toast.success).toHaveBeenCalledWith('Password changed successfully!')

        expect((container.querySelector('#current-password') as HTMLInputElement).value).toBe('')
        expect((container.querySelector('#new-password') as HTMLInputElement).value).toBe('')
    })
})

