import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  BrainCircuit,
  Library,
  Settings,
  LogOut,
  PlusCircle,
  Sparkles,
  Zap,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Progress } from '../ui/Progress'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar'
import { useAuth } from '../../lib/AuthContext'

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const location = useLocation()
  const { user, logout } = useAuth()

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: FileText, label: 'Summaries', href: '/summaries' },
    { icon: BrainCircuit, label: 'Quizzes', href: '/quizzes', notification: true },
    { icon: Library, label: 'Library', href: '/library' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ]

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
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
      <div className="p-4 space-y-4 border-t bg-secondary/10">
        <div className="space-y-3 p-3 rounded-lg bg-background border shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Free Plan</span>
            <span className="text-muted-foreground">3/5 used</span>
          </div>
          <Progress value={60} className="h-1.5" />
          <Button variant="outline" size="sm" className="w-full text-xs h-7 border-primary/20 hover:bg-primary/5 hover:text-primary transition-colors">
            <Zap className="mr-2 h-3 w-3 text-orange-500" />
            Upgrade to Pro
          </Button>
        </div>
        <div className="flex items-center gap-3 px-1 pt-1 group cursor-pointer hover:bg-secondary/50 p-2 rounded-md transition-colors">
          <Avatar className="h-8 w-8 border group-hover:border-primary/50 transition-colors">
            <AvatarImage src={user?.avatar_url || ''} />
            <AvatarFallback>{user?.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium leading-none group-hover:text-primary transition-colors">
              {user?.full_name || 'User'}
            </p>
            <p className="truncate text-xs text-muted-foreground mt-1">{user?.email || ''}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
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
