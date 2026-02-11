import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, ProtectedRoute } from './lib/AuthContext'
import { ToastProvider } from './components/ui/Toast'
import { OfflineBanner } from './components/layout/OfflineBanner'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { EmailVerificationPage } from './pages/EmailVerificationPage'
import { DashboardPage } from './pages/DashboardPage'
import { ContentInputPage } from './pages/ContentInputPage'
import { ProcessingPage } from './pages/ProcessingPage'
import { SummaryPage } from './pages/SummaryPage'
import { SummariesPage } from './pages/SummariesPage'
import { QuizzesPage } from './pages/QuizzesPage'
import { QuizConfigPage } from './pages/QuizConfigPage'
import { QuizTakePage } from './pages/QuizTakePage'
import { QuizResultsPage } from './pages/QuizResultsPage'
import { FlashcardConfigPage } from './pages/FlashcardConfigPage'
import { FlashcardStudyPage } from './pages/FlashcardStudyPage'
import { FlashcardsPage } from './pages/FlashcardsPage'
import { LibraryPage } from './pages/LibraryPage'
import { SettingsPage } from './pages/SettingsPage'
import { NotFoundPage } from './pages/NotFoundPage'

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <OfflineBanner />
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<EmailVerificationPage />} />

            {/* Authenticated Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/create" element={<ProtectedRoute><ContentInputPage /></ProtectedRoute>} />
            <Route path="/processing/:jobId" element={<ProtectedRoute><ProcessingPage /></ProtectedRoute>} />
            <Route path="/summaries" element={<ProtectedRoute><SummariesPage /></ProtectedRoute>} />
            <Route path="/quizzes" element={<ProtectedRoute><QuizzesPage /></ProtectedRoute>} />
            <Route path="/summary/:id" element={<ProtectedRoute><SummaryPage /></ProtectedRoute>} />

            {/* Quiz Routes */}
            <Route path="/quiz/create/:summaryId" element={<ProtectedRoute><QuizConfigPage /></ProtectedRoute>} />
            <Route path="/quiz/take/:quizId" element={<ProtectedRoute><QuizTakePage /></ProtectedRoute>} />
            <Route path="/quiz/results/:attemptId" element={<ProtectedRoute><QuizResultsPage /></ProtectedRoute>} />

            {/* Flashcard Routes */}
            <Route path="/flashcards" element={<ProtectedRoute><FlashcardsPage /></ProtectedRoute>} />
            <Route path="/flashcards/create/:summaryId" element={<ProtectedRoute><FlashcardConfigPage /></ProtectedRoute>} />
            <Route path="/flashcards/study/:deckId" element={<ProtectedRoute><FlashcardStudyPage /></ProtectedRoute>} />

            {/* Management Routes */}
            <Route path="/library" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

            {/* Fallback route */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
