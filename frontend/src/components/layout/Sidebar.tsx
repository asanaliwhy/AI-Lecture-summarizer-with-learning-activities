import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
	BrainCircuit,
	Presentation,
	Layers,
  Library,
  Settings,
  LogOut,
  PlusCircle,
  Sparkles,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useAuth } from '../../lib/AuthContext'

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

interface NavItem {
  icon: LucideIcon
  label: string
  href: string
  notification?: boolean
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const navItems: NavItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
		{ icon: FileText, label: 'Summaries', href: '/summaries' },
		{ icon: BrainCircuit, label: 'Quizzes', href: '/quizzes' },
		{ icon: Layers, label: 'Flashcards', href: '/flashcards' },
		{ icon: Presentation, label: 'Presentations', href: '/presentations' },
    { icon: Library, label: 'Library', href: '/library' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ]

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      window.location.href = '/login'
    } finally {
      setIsLoggingOut(false)
      setShowLogoutDialog(false)
    }
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-6">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 font-bold text-xl tracking-tight hover:opacity-90 transition-opacity group"
          onClick={onClose}
        >
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <span>Lectura</span>
        </Link>
        <button className="md:hidden p-1 rounded hover:bg-secondary text-muted-foreground" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
        <div>
          <div className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platform</div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={onClose}
                  className={cn(
                    'group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 relative overflow-hidden',
                    isActive
                      ? 'bg-secondary text-primary border-l-2 border-primary rounded-l-none'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground hover:translate-x-1',
                  )}
                >
                  {isActive && <div className="absolute inset-0 bg-primary/5 pointer-events-none" />}
                  <div className="flex items-center gap-3 relative z-10">
                    <item.icon className={cn('h-4 w-4 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                    {item.label}
                  </div>
                  {item.notification && <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shadow-sm" />}
                </Link>
              )
            })}
          </nav>
        </div>
        <div>
          <div className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</div>
          <nav className="space-y-1">
            <Link to="/create" onClick={onClose}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-all duration-200 hover:shadow-sm border border-transparent hover:border-primary/10"
            >
              <PlusCircle className="h-4 w-4" />
              New Content
            </Link>
          </nav>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 space-y-4 border-t bg-secondary/10 overflow-hidden">
        <div className="flex items-center gap-2 px-1 pt-1 min-w-0">
          <button
            type="button"
            onClick={() => {
              onClose()
              navigate('/settings')
            }}
            className="flex flex-1 min-w-0 items-center gap-3 group cursor-pointer hover:bg-secondary/50 p-2 rounded-md transition-colors text-left overflow-hidden"
          >
            <Avatar className="h-8 w-8 border group-hover:border-primary/50 transition-colors">
              <AvatarImage src={user?.avatar_url || ''} />
              <AvatarFallback>{user?.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="truncate text-sm font-medium leading-none group-hover:text-primary transition-colors">
                {user?.full_name || 'User'}
              </p>
              <p className="truncate text-xs text-muted-foreground mt-1">{user?.email || ''}</p>
            </div>
          </button>
          <Button variant="ghost" size="icon" onClick={() => setShowLogoutDialog(true)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showLogoutDialog}
        title="Log out"
        description="Log out of your account now? You will need to sign in again to continue."
        confirmLabel="Log out"
        variant="destructive"
        loading={isLoggingOut}
        onCancel={() => {
          if (!isLoggingOut) {
            setShowLogoutDialog(false)
          }
        }}
        onConfirm={() => {
          void handleLogout()
        }}
      />
    </>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-60 border-r bg-background flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-72 border-r bg-background flex flex-col transition-transform duration-300 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
