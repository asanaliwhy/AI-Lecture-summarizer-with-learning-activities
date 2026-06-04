import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { AppLayout } from '../components/layout/AppLayout'
import { FileQuestion, Home, Search } from 'lucide-react'
export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="h-24 w-24 bg-secondary/30 rounded-full flex items-center justify-center mb-6">
          <FileQuestion className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          Page not found
        </h1>
        <p className="text-muted-foreground max-w-[500px] mb-8">
          Sorry, we couldn't find the page you're looking for. It might have
          been moved or doesn't exist.
        </p>

        <div className="flex gap-4">
          <Button onClick={() => navigate('/dashboard')} size="lg">
            <Home className="mr-2 h-4 w-4" />
            Return to Dashboard
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate('/library')}
          >
            <Search className="mr-2 h-4 w-4" />
            Search Library
          </Button>
        </div>
      </div>
    </AppLayout>
  )
}
