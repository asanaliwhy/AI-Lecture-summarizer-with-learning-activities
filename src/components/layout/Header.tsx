import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Menu } from 'lucide-react'
import { Input } from '../ui/Input'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar'
import { useAuth } from '../../lib/AuthContext'
import { UpgradeModal } from '../UpgradeModal'

interface HeaderProps {
  onMenuToggle: () => void
}

export function Header({ onMenuToggle }: HeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false)

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchValue.trim()
    if (!q) {
      navigate('/library')
      return
    }
    navigate(`/library?search=${encodeURIComponent(q)}`)
  }

  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/dashboard': return 'Dashboard'
      case '/library': return 'Library'
      case '/settings': return 'Settings'
      case '/create': return 'Create Content'
      case '/summaries': return 'My Summaries'
      case '/quizzes': return 'My Quizzes'
      case '/flashcards': return 'My Flashcards'
      default:
        if (pathname.includes('/summary/')) return 'Summary View'
        if (pathname.includes('/quiz/')) return 'Quiz'
        if (pathname.includes('/flashcards/')) return 'Flashcards'
        return 'Dashboard'
    }
  }

  return (
    <header className="fixed left-0 md:left-60 top-0 z-30 flex h-16 w-full md:w-[calc(100%-15rem)] items-center justify-between gap-3 overflow-hidden border-b bg-background/95 px-4 sm:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-all duration-300">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 -ml-2 rounded-md hover:bg-secondary text-muted-foreground"
          onClick={onMenuToggle}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb */}
        <div className="hidden min-w-0 lg:flex items-center text-sm text-muted-foreground mr-2 xl:mr-4">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="hover:text-foreground transition-colors cursor-pointer hover:underline underline-offset-4 whitespace-nowrap"
          >
            Lectura
          </button>
          <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground/50" />
          <span className="truncate font-medium text-foreground animate-in fade-in slide-in-from-left-2 duration-300">
            {getPageTitle(location.pathname)}
          </span>
        </div>

        {/* Mobile title */}
        <span className="truncate lg:hidden font-semibold text-sm">{getPageTitle(location.pathname)}</span>

        <form
          onSubmit={handleSearchSubmit}
          className={`relative hidden xl:block w-full max-w-xs 2xl:max-w-sm transition-all duration-300 ${isSearchFocused ? 'xl:max-w-md' : ''}`}
        >
          <Search className={`absolute left-2.5 top-2.5 h-4 w-4 transition-colors ${isSearchFocused ? 'text-primary' : 'text-muted-foreground'}`} />
          <Input
            type="search"
            placeholder="Search summaries, quizzes..."
            className="w-full bg-secondary/50 pl-9 focus-visible:bg-background border-transparent focus-visible:border-primary/50 transition-all shadow-sm focus-visible:shadow-md"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
        </form>
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-2 sm:gap-4">
        {/* Credits Indicator */}
        <button
          onClick={() => setIsUpgradeModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-full transition-colors text-sm font-medium border border-border/50"
        >
          <span className="text-primary">⚡</span>
          {user?.plan === 'plus' ? (
            <span>Unlimited</span>
          ) : (
            <span>{Math.max(0, (user?.total_credits ?? 100) - (user?.used_credits ?? 0))} / {user?.total_credits ?? 100}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="hidden sm:flex items-center gap-3 pl-1 group cursor-pointer p-1 rounded-full hover:bg-secondary/50 transition-colors"
          aria-label="Open profile settings"
        >
          <div className="hidden 2xl:flex flex-col items-end">
            <span className="text-sm font-medium leading-none group-hover:text-primary transition-colors">
              {user?.full_name || 'User'}
            </span>
            <span className="text-xs text-muted-foreground mt-1 capitalize">{user?.plan || 'Free'} Plan</span>
          </div>
          <Avatar className="h-9 w-9 border ring-2 ring-background transition-transform group-hover:scale-105 group-hover:ring-primary/20">
            <AvatarImage src={user?.avatar_url || ''} alt={user?.full_name || 'User'} />
            <AvatarFallback>{user?.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
        </button>
      </div>

      <UpgradeModal 
        isOpen={isUpgradeModalOpen} 
        onClose={() => setIsUpgradeModalOpen(false)} 
      />
    </header>
  )
}
