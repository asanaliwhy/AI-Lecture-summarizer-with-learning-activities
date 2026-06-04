interface FollowUpQuestionsProps {
  questions: string[]
  onQuestionClick: (question: string) => void
}

export function FollowUpQuestions({ questions, onQuestionClick }: FollowUpQuestionsProps) {
  if (!questions || questions.length === 0) return null

  return (
    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-4">
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          className="text-blue-500 flex-shrink-0"
        >
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Dig Deeper
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {questions.map((question, index) => (
          <button
            key={index}
            onClick={() => onQuestionClick(question)}
            className="text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors text-sm text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
}
