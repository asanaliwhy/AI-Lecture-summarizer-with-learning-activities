import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { User, Bell, Key, CreditCard, Shield, LogOut, Loader2 } from 'lucide-react'
import { useToast } from '../components/ui/Toast'

const MAX_AVATAR_BYTES = 800 * 1024
const ACCEPTED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif'])

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesResponse = {
  processing_complete: true,
  weekly_digest: false,
  study_reminders: false,
}

const PASSWORD_MIN_LENGTH = 8

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
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [isAvatarProcessing, setIsAvatarProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [defaultSummaryLength, setDefaultSummaryLength] =
    useState<SummaryLengthPreference>(() => getStoredSummaryLengthPreference())
  const [defaultSummaryFormat, setDefaultSummaryFormat] =
    useState<SummaryFormatPreference>(() => getStoredSummaryFormatPreference())
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(() => getStoredThemePreference())
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferencesResponse>(DEFAULT_NOTIFICATION_PREFERENCES)
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(true)
  const [savingNotificationKey, setSavingNotificationKey] =
    useState<UpdateNotificationPreferencePayload['key'] | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (user) {
      setDisplayName(user.full_name || '')
      setEmail(user.email || '')
      setAvatarUrl(user.avatar_url || '')
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
      await api.user.updateMe({ full_name: displayName, email, avatar_url: avatarUrl || '' })
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
      let message = err instanceof Error ? err.message : 'Failed to change password'
      if (err instanceof ApiError && err.fields) {
        message =
          err.fields.new_password ||
          err.fields.current_password ||
          err.message ||
          message
      }
      setPasswordError(message)
      toast.error(message)
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you sure? This action cannot be undone.')) return
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
    }
  }

  const handleDefaultSummaryLengthChange = (value: string) => {
    const normalizedValue = parseSummaryLengthPreference(value)
    setDefaultSummaryLength(normalizedValue)
    saveStoredSummaryLengthPreference(normalizedValue)
    toast.success('Default summary length saved.')
  }

  const handleDefaultSummaryFormatChange = (value: string) => {
    const normalizedValue = parseSummaryFormatPreference(value)
    setDefaultSummaryFormat(normalizedValue)
    saveStoredSummaryFormatPreference(normalizedValue)
    toast.success('Default summary format saved.')
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

  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account preferences and subscription.
          </p>
        </div>

        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[400px] mb-8">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update your personal information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarUrl || ''} alt={displayName || 'User avatar'} />
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
                    <Label htmlFor="name">Display Name</Label>
                    <Input
                      id="name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4 flex items-center gap-4">
                <Button onClick={handleSaveProfile} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
                {saveSuccess && (
                  <span className="text-sm text-green-600">Profile updated!</span>
                )}
              </CardFooter>
            </Card>

            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600">Danger Zone</CardTitle>
                <CardDescription>Irreversible account actions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Delete Account</h4>
                    <p className="text-sm text-muted-foreground">
                      Permanently remove your account and all data.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
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
            <Card>
              <CardHeader>
                <CardTitle>General Preferences</CardTitle>
                <CardDescription>Customize your experience.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
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
                    <SelectTrigger className="w-[180px]">
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
                    <SelectTrigger className="w-[220px]">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>Manage how we communicate with you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
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
                <div className="flex items-center justify-between">
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
                <div className="flex items-center justify-between">
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
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your account password.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value)
                      if (passwordError) setPasswordError('')
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
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
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
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
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Plan</CardTitle>
                <CardDescription>You are currently on the Free plan.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Free Plan</h3>
                      <Badge>Current</Badge>
                    </div>
                    <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" /> 5 Summaries / mo
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" /> Basic Quizzes
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" /> 100MB Storage
                      </li>
                    </ul>
                    <Button variant="outline" className="w-full" disabled>Current Plan</Button>
                  </div>
                  <div className="rounded-lg border p-4 bg-primary/5 border-primary/20">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Pro Plan</h3>
                      <span className="font-bold text-lg">
                        $12<span className="text-sm font-normal text-muted-foreground">/mo</span>
                      </span>
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
                    <Button className="w-full">Upgrade to Pro</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Method</CardTitle>
                <CardDescription>Manage your payment details.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-4 border rounded-lg">
                  <div className="h-10 w-16 bg-secondary rounded flex items-center justify-center">
                    <CreditCard className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">No payment method</p>
                    <p className="text-sm text-muted-foreground">Add a card to upgrade.</p>
                  </div>
                  <Button variant="ghost" size="sm">Add Card</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
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
