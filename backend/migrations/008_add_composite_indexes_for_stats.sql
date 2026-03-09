-- Composite indexes for dashboard stats, recent activity, and streak-related date filters.

-- Supports stats/streak patterns filtering by user and grouping/ranging on summary creation date.
CREATE INDEX IF NOT EXISTS idx_summaries_user_created_at
ON summaries(user_id, created_at DESC);

-- Supports recent activity query filtering by user and non-null last_accessed_at in summaries.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'summaries'
          AND column_name = 'last_accessed_at'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_summaries_user_last_accessed_at ON summaries(user_id, last_accessed_at DESC)';
    END IF;
END $$;

-- Supports stats ranges filtering quizzes by user and created_at windows.
CREATE INDEX IF NOT EXISTS idx_quizzes_user_created_at
ON quizzes(user_id, created_at DESC);

-- Supports recent activity query filtering quizzes by user and last_accessed_at ordering.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'quizzes'
          AND column_name = 'last_accessed_at'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quizzes_user_last_accessed_at ON quizzes(user_id, last_accessed_at DESC)';
    END IF;
END $$;

-- Supports stats ranges filtering flashcard decks by user and created_at windows.
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user_created_at
ON flashcard_decks(user_id, created_at DESC);

-- Supports recent activity query filtering flashcard decks by user and last_accessed_at ordering.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'flashcard_decks'
          AND column_name = 'last_accessed_at'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user_last_accessed_at ON flashcard_decks(user_id, last_accessed_at DESC)';
    END IF;
END $$;

-- Supports streak/activity-day extraction on quiz attempts by user and started_at date.
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_started_at
ON quiz_attempts(user_id, started_at DESC);

-- Supports streak/stats CTE patterns that group/range study sessions by created_at per user.
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_created_at
ON study_sessions(user_id, created_at DESC);
