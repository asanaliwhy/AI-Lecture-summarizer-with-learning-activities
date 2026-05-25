import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '../components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs'
import { Label } from '../components/ui/Label'
import { Switch } from '../components/ui/Switch'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Textarea } from '../components/ui/Textarea'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/Select'
import {
  getStoredSummaryLengthPreference,
  getStoredSummaryFormatPreference,
  parseSummaryLengthPreference,
  parseSummaryFormatPreference,
  saveStoredSummaryLengthPreference,
  saveStoredSummaryFormatPreference,
  type SummaryFormatPreference,
  type SummaryLengthPreference,
} from '../lib/summaryLengthPreference'
import {
  applyThemePreference,
  getStoredThemePreference,
  saveStoredThemePreference,
  type ThemePreference,
} from '../lib/themePreference'
import {
  type NotificationPreferencesResponse,
  type UpdateNotificationPreferencePayload,
} from '../lib/api'
import { User, Bell, Key, CreditCard, Shield, LogOut, Loader2, Sparkles, Eye, EyeOff, Zap, Infinity } from 'lucide-react'
import { useToast } from '../components/ui/Toast'

const MAX_AVATAR_BYTES = 800 * 1024
const ACCEPTED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif'])

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesResponse = {
  processing_complete: true,
  weekly_digest: false,
  study_reminders: false,
}

const PASSWORD_MIN_LENGTH = 8
const MAX_BIO_LENGTH = 300

function validateNewPassword(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return 'New password must be at least 8 characters'
  }
  if (!/\d/.test(value)) {
    return 'New password must contain at least one number'
  }
  return null
}

export function SettingsPage() {
  const { user, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [bio, setBio] = useState('')
  const [isAvatarProcessing, setIsAvatarProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [defaultSummaryLength, setDefaultSummaryLength] =
    useState<SummaryLengthPreference>(() => getStoredSummaryLengthPreference())
  const [defaultSummaryFormat, setDefaultSummaryFormat] =
    useState<SummaryFormatPreference>(() => getStoredSummaryFormatPreference())
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(() => getStoredThemePreference())
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferencesResponse>(DEFAULT_NOTIFICATION_PREFERENCES)
  const [isSettingsSyncing, setIsSettingsSyncing] = useState(false)
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(true)
  const [savingNotificationKey, setSavingNotificationKey] =
    useState<UpdateNotificationPreferencePayload['key'] | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  // Gemini API key state
  const [geminiKeyInput, setGeminiKeyInput] = useState('')
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false)
  const [isClearingGeminiKey, setIsClearingGeminiKey] = useState(false)

  // Billing state
  const [isCheckoutLoading, setIsCheckoutLoading] = useState<'student' | 'pro' | null>(null)
  const [isPortalLoading, setIsPortalLoading] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const checkoutStatus = searchParams.get('checkout')
    if (checkoutStatus === 'success') {
      toast.success('Subscription updated successfully! Your new limits are now active.')
      refreshUser()
      // Remove the query param to prevent showing toast again on refresh
      searchParams.delete('checkout')
      setSearchParams(searchParams)
    } else if (checkoutStatus === 'cancel') {
      toast.info('Checkout was cancelled.')
      searchParams.delete('checkout')
      setSearchParams(searchParams)
    }
  }, [searchParams, setSearchParams, refreshUser, toast])

  useEffect(() => {
    if (user) {
      const normalizedFullName = String(user.full_name || '').trim()
      const nameParts = normalizedFullName.split(/\s+/).filter(Boolean)
      const derivedFirstName = nameParts[0] || ''
      const derivedLastName = nameParts.slice(1).join(' ')

      setFirstName(derivedFirstName)
      setLastName(derivedLastName)
      setEmail(user.email || '')
      setAvatarUrl(user.avatar_url || '')
      setBio(user.bio || '')
    }
  }, [user])

  useEffect(() => {
    let isActive = true

    const loadSettings = async () => {
      if (!user) return

      try {
        const settings = await api.user.getSettings()
        if (!isActive) return

        const backendLength = parseSummaryLengthPreference(settings?.default_summary_length)
        const backendFormat = parseSummaryFormatPreference(settings?.default_format)

        setDefaultSummaryLength(backendLength)
        setDefaultSummaryFormat(backendFormat)

        saveStoredSummaryLengthPreference(backendLength)
        saveStoredSummaryFormatPreference(backendFormat)
      } catch {
        if (!isActive) return

        setDefaultSummaryLength(getStoredSummaryLengthPreference())
        setDefaultSummaryFormat(getStoredSummaryFormatPreference())
      }
    }

    loadSettings()

    return () => {
      isActive = false
    }
  }, [user])

  useEffect(() => {
    let isActive = true

    const loadNotifications = async () => {
      if (!user) {
        setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES)
        setIsNotificationsLoading(false)
        return
      }

      setIsNotificationsLoading(true)
      try {
        const prefs = await api.user.getNotifications()
        if (!isActive) return

        setNotificationPreferences({
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...prefs,
        })
      } catch {
        if (!isActive) return

        setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES)
      } finally {
        if (isActive) {
          setIsNotificationsLoading(false)
        }
      }
    }

    loadNotifications()

    return () => {
      isActive = false
    }
  }, [user])

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
          return
        }
        reject(new Error('Invalid avatar data'))
      }
      reader.onerror = () => reject(new Error('Failed to read avatar file'))
      reader.readAsDataURL(file)
    })

  const handleAvatarButtonClick = () => {
    avatarInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
      toast.error('Avatar must be JPG, GIF, or PNG.')
      e.target.value = ''
      return
    }

    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Avatar file is too large. Maximum size is 800KB.')
      e.target.value = ''
      return
    }

    setIsAvatarProcessing(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setAvatarUrl(dataUrl)
      setSaveSuccess(false)
      toast.success('Avatar selected. Click Save Changes to persist it.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process avatar'
      toast.error(message)
    } finally {
      setIsAvatarProcessing(false)
      e.target.value = ''
    }
  }

  const handleRemoveAvatar = () => {
    setAvatarUrl('')
    setSaveSuccess(false)
    toast.info('Avatar removed locally. Click Save Changes to persist it.')
  }

  const handleSaveProfile = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      const normalizedFirstName = firstName.trim()
      const normalizedLastName = lastName.trim()
      const normalizedBio = bio.trim()

      if (!normalizedFirstName || !normalizedLastName) {
        toast.error('First name and last name are required.')
        return
      }

      if (normalizedBio.length > MAX_BIO_LENGTH) {
        toast.error(`Bio must be ${MAX_BIO_LENGTH} characters or fewer.`)
        return
      }

      const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim()

      await api.user.updateMe({
        full_name: fullName,
        email,
        avatar_url: avatarUrl || '',
        bio: normalizedBio,
      })
      await refreshUser()
      setSaveSuccess(true)
      toast.success('Profile updated successfully!')
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update profile'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordError('')
    setPasswordSuccess(false)

    const trimmedCurrentPassword = currentPassword.trim()

    if (!trimmedCurrentPassword || !newPassword) {
      setPasswordError('Both fields are required')
      return
    }

    if (trimmedCurrentPassword === newPassword) {
      setPasswordError('New password must be different from current password')
      return
    }

    const newPasswordValidationError = validateNewPassword(newPassword)
    if (newPasswordValidationError) {
      setPasswordError(newPasswordValidationError)
      return
    }

    setIsChangingPassword(true)

    try {
      await api.user.changePassword({
        current_password: trimmedCurrentPassword,
        new_password: newPassword,
      })
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      toast.success('Password changed successfully!')
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setPasswordError('Current password is incorrect')
          return
        }
        if (err.status === 400) {
          let message = err.message || 'Invalid input'
          if (err.fields) {
            message =
              err.fields.new_password ||
              err.fields.current_password ||
              err.message ||
              message
          }
          setPasswordError(message)
          return
        }
      }
      toast.error('Failed to change password. Please try again.')
    } finally {
      setIsChangingPassword(false)
    }
  }

  const openDeleteModal = () => setShowDeleteModal(true)
  const closeDeleteModal = () => setShowDeleteModal(false)

  const confirmDeleteAccount = async () => {
    setIsDeleting(true)
    try {
      await api.user.deleteMe()
      toast.info('Account deleted.')
      logout()
      navigate('/login')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete account'
      toast.error(message)
    } finally {
      setIsDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const handleDefaultSummaryLengthChange = async (value: string) => {
    const normalizedValue = parseSummaryLengthPreference(value)
    setDefaultSummaryLength(normalizedValue)
    saveStoredSummaryLengthPreference(normalizedValue)

    setIsSettingsSyncing(true)
    try {
      await api.user.updateSettings({ default_summary_length: normalizedValue })
      toast.success('Default summary length saved.')
    } catch (err) {
      console.error('Failed to persist summary length preference:', err)
      toast.error('Saved locally. Cloud sync failed.')
    } finally {
      setIsSettingsSyncing(false)
    }
  }

  const handleDefaultSummaryFormatChange = async (value: string) => {
    const normalizedValue = parseSummaryFormatPreference(value)
    setDefaultSummaryFormat(normalizedValue)
    saveStoredSummaryFormatPreference(normalizedValue)

    setIsSettingsSyncing(true)
    try {
      await api.user.updateSettings({ default_format: normalizedValue })
      toast.success('Default summary format saved.')
    } catch (err) {
      console.error('Failed to persist summary format preference:', err)
      toast.error('Saved locally. Cloud sync failed.')
    } finally {
      setIsSettingsSyncing(false)
    }
  }

  const handleThemeToggle = (enabled: boolean) => {
    const nextTheme: ThemePreference = enabled ? 'dark' : 'light'
    setThemePreference(nextTheme)
    saveStoredThemePreference(nextTheme)
    applyThemePreference(nextTheme)
    toast.success(`Theme switched to ${nextTheme} mode.`)
  }

  const handleNotificationToggle = async (
    key: UpdateNotificationPreferencePayload['key'],
    enabled: boolean,
  ) => {
    const previousValue = notificationPreferences[key]
    setNotificationPreferences((prev) => ({
      ...prev,
      [key]: enabled,
    }))
    setSavingNotificationKey(key)

    try {
      await api.user.updateNotification({ key, enabled })
      toast.success('Notification preference saved.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update notification preference'
      setNotificationPreferences((prev) => ({
        ...prev,
        [key]: previousValue,
      }))
      toast.error(message)
    } finally {
      setSavingNotificationKey(null)
    }
  }

  const handleSetGeminiKey = async () => {
    const trimmed = geminiKeyInput.trim()
    if (!trimmed) {
      toast.error('Please enter a Gemini API key.')
      return
    }
    setIsSavingGeminiKey(true)
    try {
      await api.user.setGeminiKey(trimmed)
      await refreshUser()
      setGeminiKeyInput('')
      toast.success('Gemini API key saved and encrypted successfully!')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save API key'
      toast.error(message)
    } finally {
      setIsSavingGeminiKey(false)
    }
  }

  const handleClearGeminiKey = async () => {
    setIsClearingGeminiKey(true)
    try {
      await api.user.setGeminiKey('')
      await refreshUser()
      toast.success('Gemini API key removed. Using shared developer key.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove API key'
      toast.error(message)
    } finally {
      setIsClearingGeminiKey(false)
    }
  }

  const handleUpgrade = async (plan: 'student' | 'pro') => {
    setIsCheckoutLoading(plan)
    try {
      const { url } = await api.billing.checkout(plan)
      if (url) {
        window.location.href = url
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create checkout session'
      toast.error(message)
      setIsCheckoutLoading(null)
    }
  }

  const handlePortal = async () => {
    setIsPortalLoading(true)
    try {
      const { url } = await api.billing.portal()
      if (url) {
        window.location.href = url
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal'
      toast.error(message)
      setIsPortalLoading(false)
    }
  }

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

  const initials = fullName
    ? fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const enabledNotificationsCount = Object.values(notificationPreferences).filter(Boolean).length
  const profileCompletionSteps = [
    firstName.trim().length > 0,
    lastName.trim().length > 0,
    email.trim().length > 0,
    avatarUrl.trim().length > 0,
    bio.trim().length > 0,
  ].filter(Boolean).length
  const profileCompletionPercent = Math.round((profileCompletionSteps / 5) * 100)
  const currentPlan = user?.plan ? `${user.plan.charAt(0).toUpperCase()}${user.plan.slice(1)}` : 'Free'

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-secondary/20 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <Badge variant="secondary" className="rounded-full px-3">{currentPlan} plan</Badge>
              </div>
              <p className="text-muted-foreground">
                Manage your account, security, and learning preferences in one place.
              </p>
            </div>

            <Badge variant="outline" className="rounded-full px-3 py-1.5 text-xs w-fit">
              <Shield className="h-3.5 w-3.5 mr-1.5" />
              Security enabled
            </Badge>
          </div>

          <div className="relative mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-card/90 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Profile completion</p>
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{profileCompletionPercent}%</p>
            </div>

            <div className="rounded-xl border bg-card/90 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Notifications</p>
                <Bell className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{enabledNotificationsCount}/3</p>
            </div>

            <div className="rounded-xl border bg-card/90 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Theme</p>
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight capitalize">{themePreference}</p>
            </div>

            <div className="rounded-xl border bg-card/90 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Password status</p>
                <Key className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-lg font-semibold tracking-tight text-green-600">Protected</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-8 rounded-xl border bg-secondary/40 p-1 h-auto gap-1">
            <TabsTrigger value="account" className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 data-[state=active]:shadow-sm">
              <User className="h-4 w-4" />
              Account
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 data-[state=active]:shadow-sm">
              <Bell className="h-4 w-4" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 data-[state=active]:shadow-sm">
              <Key className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 data-[state=active]:shadow-sm">
              <CreditCard className="h-4 w-4" />
              Billing
            </TabsTrigger>
          </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-6">
            <Card className="border shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Profile
                </CardTitle>
                <CardDescription>Update your personal information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border bg-muted/20 p-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarUrl || ''} alt={fullName || 'User avatar'} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif"
                      className="hidden"
                      onChange={handleAvatarChange}
                      aria-label="Upload avatar"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAvatarButtonClick}
                        disabled={isSaving || isAvatarProcessing}
                      >
                        {isAvatarProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Change Avatar
                      </Button>
                      {avatarUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRemoveAvatar}
                          disabled={isSaving || isAvatarProcessing}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      JPG, GIF or PNG. Max size of 800K.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">First Name</Label>
                    <Input
                      id="first-name"
                      placeholder="Enter your first name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">Last Name</Label>
                    <Input
                      id="last-name"
                      placeholder="Enter your last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="bio">Bio / About</Label>
                      <span className="text-xs text-muted-foreground">{bio.length}/{MAX_BIO_LENGTH}</span>
                    </div>
                    <Textarea
                      id="bio"
                      placeholder="Tell others a little about yourself, your goals, or your learning focus"
                      value={bio}
                      maxLength={MAX_BIO_LENGTH}
                      onChange={(e) => setBio(e.target.value)}
                      className="min-h-[110px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      This appears on your profile and helps personalize your learning space.
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4 flex items-center justify-between gap-4">
                <Button onClick={handleSaveProfile} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
                {saveSuccess && (
                  <span className="text-sm text-green-600">Profile updated!</span>
                )}
              </CardFooter>
            </Card>

            <Card className="border-red-200/80 bg-red-50/40 dark:bg-red-950/20 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>Irreversible account actions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-red-200/70 bg-background/80 p-4">
                  <div>
                    <h4 className="font-medium">Delete Account</h4>
                    <p className="text-sm text-muted-foreground">
                      Permanently remove your account and all data.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={openDeleteModal}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Account'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-6">
            <Card className="border shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  General Preferences
                </CardTitle>
                <CardDescription>Customize your experience.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/10">
                  <div className="space-y-0.5">
                    <Label className="text-base">Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">Toggle dark mode theme.</p>
                  </div>
                  <Switch
                    aria-label="Dark Mode"
                    checked={themePreference === 'dark'}
                    onCheckedChange={handleThemeToggle}
                  />
                </div>
                <div className="space-y-2 pt-4 border-t">
                  <Label>Default Summary Length</Label>
                  <Select
                    value={defaultSummaryLength}
                    onValueChange={handleDefaultSummaryLengthChange}
                  >
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder="Select length" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="concise">Concise</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="detailed">Detailed</SelectItem>
                      <SelectItem value="comprehensive">Comprehensive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <Label>Default Summary Format</Label>
                  <Select
                    value={defaultSummaryFormat}
                    onValueChange={handleDefaultSummaryFormatChange}
                  >
                    <SelectTrigger className="w-full sm:w-[260px]">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cornell">Cornell Method</SelectItem>
                      <SelectItem value="bullets">Structured Bullets</SelectItem>
                      <SelectItem value="paragraph">Paragraph Text</SelectItem>
                      <SelectItem value="smart">Smart Summary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isSettingsSyncing && (
                  <p className="text-xs text-muted-foreground">Syncing preference to cloud...</p>
                )}
              </CardContent>
            </Card>

            <Card className="border shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  Email Notifications
                </CardTitle>
                <CardDescription>Manage how we communicate with you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/10">
                  <div className="space-y-0.5">
                    <Label className="text-base">Processing Complete</Label>
                    <p className="text-sm text-muted-foreground">Email when your summaries are ready.</p>
                  </div>
                  <Switch
                    aria-label="Processing Complete"
                    checked={notificationPreferences.processing_complete}
                    onCheckedChange={(enabled) => handleNotificationToggle('processing_complete', enabled)}
                    disabled={isNotificationsLoading || savingNotificationKey !== null}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/10">
                  <div className="space-y-0.5">
                    <Label className="text-base">Weekly Digest</Label>
                    <p className="text-sm text-muted-foreground">Summary of your learning activity.</p>
                  </div>
                  <Switch
                    aria-label="Weekly Digest"
                    checked={notificationPreferences.weekly_digest}
                    onCheckedChange={(enabled) => handleNotificationToggle('weekly_digest', enabled)}
                    disabled={isNotificationsLoading || savingNotificationKey !== null}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/10">
                  <div className="space-y-0.5">
                    <Label className="text-base">Study Reminders</Label>
                    <p className="text-sm text-muted-foreground">
                      Gentle nudge when you haven&apos;t studied in 3+ days.
                    </p>
                  </div>
                  <Switch
                    aria-label="Study Reminders"
                    checked={notificationPreferences.study_reminders}
                    onCheckedChange={(enabled) => handleNotificationToggle('study_reminders', enabled)}
                    disabled={isNotificationsLoading || savingNotificationKey !== null}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card className="border shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  Change Password
                </CardTitle>
                <CardDescription>Update your account password.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value)
                      if (passwordError) setPasswordError('')
                    }}
                  />
                  {passwordError && (
                    <p className="text-sm text-destructive">{passwordError}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Create a new password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      if (passwordError) setPasswordError('')
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use at least 8 characters and include at least 1 number.
                  </p>
                </div>

                {passwordSuccess && (
                  <p className="text-sm text-green-600">Password changed successfully!</p>
                )}
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button
                  onClick={handleChangePassword}
                  disabled={!currentPassword.trim() || !newPassword || isChangingPassword}
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
              </CardFooter>
            </Card>

            {/* Gemini API Key Card */}
            <Card className="border shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Gemini API Key (BYOK)
                </CardTitle>
                <CardDescription>
                  Use your own Google Gemini API key for unlimited AI generations — bypassing shared quota limits.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {user?.has_gemini_key ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-xl border border-green-200/70 bg-green-50/40 dark:bg-green-950/20 p-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                        <Key className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">API Key configured</p>
                        <p className="text-xs text-muted-foreground font-mono tracking-widest mt-0.5">••••••••••••••••••••••••••••••••</p>
                      </div>
                      <Badge variant="secondary" className="text-green-700 bg-green-100 dark:bg-green-900/40 border-0">
                        Active
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Your key is stored encrypted with AES-256-GCM. All AI generations use your key and your Google quota.
                    </p>
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={handleClearGeminiKey}
                      disabled={isClearingGeminiKey}
                    >
                      {isClearingGeminiKey && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Remove API Key
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-muted/20 p-4 space-y-1">
                      <p className="text-sm font-medium">Why use your own key?</p>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Bypass shared plan quotas entirely</li>
                        <li>Your key, your usage — no limits imposed by us</li>
                        <li>Google's free tier gives you generous daily quotas</li>
                      </ul>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                      >
                        Get your free key at Google AI Studio →
                      </a>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gemini-api-key">Paste your API Key</Label>
                      <div className="relative">
                        <input
                          id="gemini-api-key"
                          type={showGeminiKey ? 'text' : 'password'}
                          placeholder="AIza..."
                          value={geminiKeyInput}
                          onChange={(e) => setGeminiKeyInput(e.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pr-10 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowGeminiKey((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showGeminiKey ? 'Hide key' : 'Show key'}
                        >
                          {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The key is encrypted with AES-256-GCM before storage. It is never sent back to your browser.
                      </p>
                    </div>
                    <Button
                      onClick={handleSetGeminiKey}
                      disabled={!geminiKeyInput.trim() || isSavingGeminiKey}
                    >
                      {isSavingGeminiKey && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save API Key
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-6">
            <Card className="border shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Subscription Plan
                </CardTitle>
                <CardDescription>You are currently on the Free plan.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className={`rounded-xl border p-4 ${user?.plan === 'student' ? 'bg-primary/5 border-primary/20' : 'bg-card/60'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Student Plan</h3>
                      {user?.plan === 'student' && <Badge>Current</Badge>}
                      {user?.plan !== 'student' && (
                        <span className="font-bold text-lg">
                          $5<span className="text-sm font-normal text-muted-foreground">/mo</span>
                        </span>
                      )}
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" /> 50 Summaries / mo
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" /> 50 Quizzes & Flashcards / mo
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" /> 30 Presentations / mo
                      </li>
                    </ul>
                    {user?.plan === 'student' ? (
                      <Button variant="outline" className="w-full" disabled>Current Plan</Button>
                    ) : (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => handleUpgrade('student')}
                        disabled={isCheckoutLoading !== null}
                      >
                        {isCheckoutLoading === 'student' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Upgrade to Student
                      </Button>
                    )}
                  </div>
                  <div className={`rounded-xl border p-4 ${user?.plan === 'pro' ? 'bg-primary/5 border-primary/20' : 'bg-card/60'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Pro Plan</h3>
                      {user?.plan === 'pro' && <Badge>Current</Badge>}
                      {user?.plan !== 'pro' && (
                        <span className="font-bold text-lg">
                          $12<span className="text-sm font-normal text-muted-foreground">/mo</span>
                        </span>
                      )}
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" /> Unlimited Summaries
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" /> Advanced Quizzes
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" /> Priority Support
                      </li>
                    </ul>
                    {user?.plan === 'pro' ? (
                      <Button variant="outline" className="w-full" disabled>Current Plan</Button>
                    ) : (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => handleUpgrade('pro')}
                        disabled={isCheckoutLoading !== null}
                      >
                        {isCheckoutLoading === 'pro' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Upgrade to Pro
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Usage & Quota Card */}
            <Card className="border shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Usage & Quota
                </CardTitle>
                <CardDescription>
                  Your monthly AI generation limits based on your current plan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {user?.has_gemini_key ? (
                  <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <Infinity className="h-6 w-6 text-primary shrink-0" />
                    <div>
                      <p className="font-medium text-sm">Unlimited via your own API key</p>
                      <p className="text-xs text-muted-foreground">You're using your personal Gemini key — limits are set by Google, not by us.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[
                      { label: 'Summaries', free: 5, student: 50, pro: 'Unlimited' },
                      { label: 'Quizzes', free: 5, student: 50, pro: 'Unlimited' },
                      { label: 'Presentations', free: 3, student: 30, pro: 'Unlimited' },
                      { label: 'Flashcard Decks', free: 5, student: 50, pro: 'Unlimited' },
                    ].map((item) => {
                      const plan = (user?.plan || 'free').toLowerCase()
                      const limit = plan === 'pro' ? item.pro : plan === 'student' ? item.student : item.free
                      return (
                        <div key={item.label} className="flex items-center justify-between rounded-xl border bg-muted/20 px-4 py-3">
                          <span className="text-sm font-medium">{item.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">
                              {typeof limit === 'number' ? `${limit} / month` : limit}
                            </span>
                            {typeof limit === 'number' && (
                              <Badge variant="outline" className="text-xs">
                                {plan === 'free' ? 'Free' : 'Student'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <p className="text-xs text-muted-foreground pt-1">
                      Add your own Gemini API key in the <strong>Security</strong> tab to bypass these limits for free.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border shadow-sm rounded-2xl overflow-hidden">
              <CardHeader>
                <CardTitle>Manage Subscription</CardTitle>
                <CardDescription>View invoices, update card, or cancel subscription.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-4 border rounded-lg bg-card/60">
                  <div className="h-10 w-16 bg-secondary rounded flex items-center justify-center">
                    <CreditCard className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Stripe Billing Portal</p>
                    <p className="text-sm text-muted-foreground">Manage your payment methods and subscription status securely.</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handlePortal}
                    disabled={isPortalLoading}
                  >
                    {isPortalLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Manage Subscription
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={showDeleteModal}
        title="Delete your account?"
        description="This will permanently remove your account and all associated data. This action cannot be undone."
        confirmLabel="Delete Account"
        cancelLabel="Cancel"
        variant="destructive"
        loading={isDeleting}
        onConfirm={confirmDeleteAccount}
        onCancel={closeDeleteModal}
      />
    </AppLayout>
  )
}

function Check({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
